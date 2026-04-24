"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildDocumentLinesFromCalc, type ImportStrategy } from "@/lib/calcLines/calcLineImport";
import {
  PROJECT_CALC_LINE_SELECT,
  PROJECT_CALC_TAPE_SELECT,
  type ProjectCalcLineRow,
  type ProjectCalcTapeRow,
} from "@/lib/calcLines/types";
import type {
  CalcSyncConflict,
  DocumentLineItem,
  OptionGroup,
  ProjectDocumentDraftMeta,
  ProjectDocumentKind,
} from "@/lib/documentTypes";
import { milestonePatchForDocumentExport } from "@/lib/documentMilestones";
import {
  PROJECT_DOCUMENT_REVISION_SELECT,
  PROJECT_DOCUMENT_SELECT,
  buildRevisionHistoryLabel,
  pickRevisionForExport,
  type ProjectDocumentRevisionRow,
  type ProjectDocumentRow,
} from "@/lib/projectDocumentDb";
import { buildDefaultDocumentMetaFromProject } from "@/lib/projectDocumentDefaults";
import type { ProjectRow } from "@/lib/projectTypes";
import { CUSTOMER_DETAIL_SELECT, type CustomerWithShipping } from "@/lib/customerQueries";
import { VENDOR_LIST_SELECT, type VendorRow } from "@/lib/vendorQueries";
import {
  buildDocumentDownloadFilename,
  fetchLogoDataUrl,
  formatRevisionSuffix,
  normalizeRevisionIndex,
} from "@/lib/documents/buildProjectDocumentPdf";
import { formatRiversideDateStampYmd } from "@/lib/documents/riversideTime";
import { generateProjectDocumentPdfBuffer } from "@/lib/documents/composePdfInput";
import {
  applySyncBaselineFromDocument,
  collectLinkedCalcLineIds,
  detectSyncConflicts,
  filterCalcConflictsForCurrentLines,
  isCalcLinkedLineStale,
  linkedCalcLineId,
  refreshDocumentFromCalc,
} from "@/lib/documents/calcDocumentSync";
import { openPdfPrintWindow } from "@/lib/print/openPrintWindow";
import { useProjectWorkspaceOptional } from "@/lib/projectWorkspaceContext";
import {
  buildQuoteFinancialsSnapshot,
  documentKindSupportsQuoteFinancialsSnapshot,
} from "@/lib/quoteFinancialsSnapshot";
import { projectPatchFromSavedQuoteOrInvoice } from "@/lib/projectDocumentTotalsPolicy";

function emptyMeta(): ProjectDocumentDraftMeta {
  return {
    lines: [],
    optionGroups: [],
    quotePresentAsMultipleOptions: false,
    packingLines: [],
    bolRows: [],
  };
}

function finiteOrNull(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function createDocumentLineId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `line-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createOptionGroupId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `option-${crypto.randomUUID()}`;
  }
  return `option-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeOptionGroups(groups: unknown): OptionGroup[] {
  if (!Array.isArray(groups)) return [];
  return groups
    .map((group): OptionGroup | null => {
      if (!group || typeof group !== "object") return null;
      const candidate = group as Partial<OptionGroup>;
      const id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id : createOptionGroupId();
      const title = typeof candidate.title === "string" && candidate.title.trim() ? candidate.title.trim() : "Option";
      return { id, title, lineIds: [] };
    })
    .filter((group): group is OptionGroup => Boolean(group));
}

function syncOptionGroupsWithLines(optionGroups: OptionGroup[], lines: DocumentLineItem[]): OptionGroup[] {
  const lineIdsByGroup = new Map<string, string[]>();
  for (const line of lines) {
    if (!line.id || !line.optionGroupId) continue;
    const ids = lineIdsByGroup.get(line.optionGroupId) ?? [];
    ids.push(line.id);
    lineIdsByGroup.set(line.optionGroupId, ids);
  }
  return optionGroups.map((group) => ({
    ...group,
    lineIds: lineIdsByGroup.get(group.id) ?? [],
  }));
}

function normalizeDocumentLines(lines: DocumentLineItem[]): DocumentLineItem[] {
  if (!Array.isArray(lines) || lines.length === 0) return [];

  const withIds = lines.map((line) => {
    const stableId = typeof line.id === "string" && line.id.trim().length > 0 ? line.id : createDocumentLineId();
    return { ...line, id: stableId };
  });
  const lineById = new Map(withIds.map((line) => [line.id as string, line]));

  const parentById = new Map<string, string | null>();
  for (const line of withIds) {
    const rawParent = typeof line.parentId === "string" && line.parentId.trim().length > 0 ? line.parentId : null;
    if (!rawParent || rawParent === line.id || !lineById.has(rawParent)) {
      parentById.set(line.id as string, null);
      continue;
    }
    parentById.set(line.id as string, rawParent);
  }

  const hasCycleFrom = (lineId: string): boolean => {
    const seen = new Set<string>([lineId]);
    let cursor = parentById.get(lineId) ?? null;
    while (cursor) {
      if (seen.has(cursor)) return true;
      seen.add(cursor);
      cursor = parentById.get(cursor) ?? null;
    }
    return false;
  };

  return withIds.map((line) => {
    const lineId = line.id as string;
    const nextParent = parentById.get(lineId) ?? null;
    if (!nextParent || hasCycleFrom(lineId)) {
      return { ...line, parentId: null };
    }
    return { ...line, parentId: nextParent };
  });
}

export function moveLineWithinHierarchy(
  lines: DocumentLineItem[],
  lineNo: number,
  direction: "up" | "down",
): DocumentLineItem[] {
  const normalized = normalizeDocumentLines(lines);
  const byId = new Map(normalized.map((line) => [line.id as string, line]));
  const childrenByParent = new Map<string | null, string[]>();
  for (const line of normalized) {
    const parentId = line.parentId && byId.has(line.parentId) ? line.parentId : null;
    const ids = childrenByParent.get(parentId) ?? [];
    ids.push(line.id as string);
    childrenByParent.set(parentId, ids);
  }

  const target = normalized.find((line) => line.lineNo === lineNo);
  if (!target?.id) return normalized;
  const parentId = target.parentId && byId.has(target.parentId) ? target.parentId : null;
  const siblings = [...(childrenByParent.get(parentId) ?? [])];
  const targetOptionGroup = target.optionGroupId ?? null;
  const siblingIndexes = siblings
    .map((siblingId, siblingIndex) => {
      const sibling = byId.get(siblingId);
      return sibling && (sibling.optionGroupId ?? null) === targetOptionGroup ? siblingIndex : -1;
    })
    .filter((siblingIndex) => siblingIndex >= 0);
  const index = siblings.indexOf(target.id);
  if (index < 0) return normalized;
  const targetPositionInGroup = siblingIndexes.indexOf(index);
  if (targetPositionInGroup < 0) return normalized;
  const swapPositionInGroup = direction === "up" ? targetPositionInGroup - 1 : targetPositionInGroup + 1;
  if (swapPositionInGroup < 0 || swapPositionInGroup >= siblingIndexes.length) return normalized;
  const swapIndex = siblingIndexes[swapPositionInGroup];
  const [moved] = siblings.splice(index, 1);
  siblings.splice(swapIndex, 0, moved);
  childrenByParent.set(parentId, siblings);

  const next: DocumentLineItem[] = [];
  const walk = (currentParentId: string | null) => {
    const childIds = childrenByParent.get(currentParentId) ?? [];
    for (const childId of childIds) {
      const child = byId.get(childId);
      if (!child) continue;
      next.push(child);
      walk(childId);
    }
  };
  walk(null);
  return next.map((line, lineIndex) => ({ ...line, lineNo: lineIndex + 1 }));
}

export function reorderLineWithinHierarchy(
  lines: DocumentLineItem[],
  activeLineNo: number,
  targetLineNo: number,
): DocumentLineItem[] {
  const normalized = normalizeDocumentLines(lines);
  const byId = new Map(normalized.map((line) => [line.id as string, line]));
  const childrenByParent = new Map<string | null, string[]>();
  for (const line of normalized) {
    const parentId = line.parentId && byId.has(line.parentId) ? line.parentId : null;
    const ids = childrenByParent.get(parentId) ?? [];
    ids.push(line.id as string);
    childrenByParent.set(parentId, ids);
  }

  const active = normalized.find((line) => line.lineNo === activeLineNo);
  const target = normalized.find((line) => line.lineNo === targetLineNo);
  if (!active?.id || !target?.id || active.id === target.id) return normalized;

  const activeParentId = active.parentId && byId.has(active.parentId) ? active.parentId : null;
  const targetParentId = target.parentId && byId.has(target.parentId) ? target.parentId : null;
  if (activeParentId !== targetParentId) return normalized;
  if ((active.optionGroupId ?? null) !== (target.optionGroupId ?? null)) return normalized;

  const siblings = [...(childrenByParent.get(activeParentId) ?? [])];
  const activeIndex = siblings.indexOf(active.id);
  const targetIndex = siblings.indexOf(target.id);
  if (activeIndex < 0 || targetIndex < 0 || activeIndex === targetIndex) return normalized;
  const [moved] = siblings.splice(activeIndex, 1);
  siblings.splice(targetIndex, 0, moved);
  childrenByParent.set(activeParentId, siblings);

  const next: DocumentLineItem[] = [];
  const walk = (currentParentId: string | null) => {
    const childIds = childrenByParent.get(currentParentId) ?? [];
    for (const childId of childIds) {
      const child = byId.get(childId);
      if (!child) continue;
      next.push(child);
      walk(childId);
    }
  };
  walk(null);
  return next.map((line, index) => ({ ...line, lineNo: index + 1 }));
}

export function moveLineBetweenSectionsWithinHierarchy(
  lines: DocumentLineItem[],
  activeLineNo: number,
  targetLineNo: number | null,
  targetOptionGroupId: string | null,
): DocumentLineItem[] {
  const normalized = normalizeDocumentLines(lines);
  const active = normalized.find((line) => line.lineNo === activeLineNo);
  if (!active?.id) return normalized;

  const movedIds = new Set<string>([active.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const line of normalized) {
      if (!line.id || !line.parentId) continue;
      if (movedIds.has(line.parentId) && !movedIds.has(line.id)) {
        movedIds.add(line.id);
        changed = true;
      }
    }
  }

  const movingBlock = normalized.filter((line) => line.id && movedIds.has(line.id));
  if (movingBlock.length === 0) return normalized;
  const remaining = normalized.filter((line) => !line.id || !movedIds.has(line.id));

  const targetLine = targetLineNo == null ? null : remaining.find((line) => line.lineNo === targetLineNo) ?? null;
  if (targetLineNo != null && !targetLine) return normalized;

  const normalizedTargetGroup = targetOptionGroupId ?? null;
  const activeCurrentGroup = active.optionGroupId ?? null;
  const sectionChanged = activeCurrentGroup !== normalizedTargetGroup;

  const first = movingBlock[0];
  const rebasedBlock = movingBlock.map((line) => {
    const baseLine = { ...line, optionGroupId: normalizedTargetGroup };
    if (line.id === first.id && sectionChanged) {
      return { ...baseLine, parentId: null };
    }
    if (line.parentId && !movedIds.has(line.parentId)) {
      return { ...baseLine, parentId: null };
    }
    return baseLine;
  });

  const insertIndex = (() => {
    if (targetLine) {
      const index = remaining.findIndex((line) => line.id === targetLine.id);
      if (index >= 0) return index;
    }
    let lastIndexForSection = -1;
    for (let index = 0; index < remaining.length; index += 1) {
      if ((remaining[index].optionGroupId ?? null) === normalizedTargetGroup) {
        lastIndexForSection = index;
      }
    }
    return lastIndexForSection >= 0 ? lastIndexForSection + 1 : remaining.length;
  })();

  const next = [...remaining.slice(0, insertIndex), ...rebasedBlock, ...remaining.slice(insertIndex)];
  return next.map((line, index) => ({ ...line, lineNo: index + 1 }));
}

export function removeLineWithinHierarchy(lines: DocumentLineItem[], lineNo: number): DocumentLineItem[] {
  const normalized = normalizeDocumentLines(lines);
  const targetLine = normalized.find((line) => line.lineNo === lineNo);
  if (!targetLine?.id) return normalized;

  const removedIds = new Set<string>([targetLine.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const line of normalized) {
      if (!line.id || !line.parentId) continue;
      if (removedIds.has(line.parentId) && !removedIds.has(line.id)) {
        removedIds.add(line.id);
        changed = true;
      }
    }
  }

  const kept = normalized.filter((line) => !line.id || !removedIds.has(line.id));
  return kept.map((line, index) => ({ ...line, lineNo: index + 1 }));
}

function normalizeMeta(raw: unknown): ProjectDocumentDraftMeta {
  if (!raw || typeof raw !== "object") return emptyMeta();
  const metadata = raw as ProjectDocumentDraftMeta;
  const optionGroups = normalizeOptionGroups(metadata.optionGroups);
  const normalized: ProjectDocumentDraftMeta = {
    ...emptyMeta(),
    ...metadata,
    lines: normalizeDocumentLines(Array.isArray(metadata.lines) ? metadata.lines : []),
    optionGroups,
    packingLines: Array.isArray(metadata.packingLines) ? metadata.packingLines : [],
    bolRows: Array.isArray(metadata.bolRows) ? metadata.bolRows : [],
    quotePdfTaxRatePct: finiteOrNull(metadata.quotePdfTaxRatePct),
    quotePdfTaxAmount: finiteOrNull(metadata.quotePdfTaxAmount),
    quotePdfLogisticsAmount: finiteOrNull(metadata.quotePdfLogisticsAmount),
    quotePdfOtherAmount: finiteOrNull(metadata.quotePdfOtherAmount),
    quotePresentAsMultipleOptions: Boolean(metadata.quotePresentAsMultipleOptions),
  };
  const validGroupIds = new Set(normalized.optionGroups?.map((group) => group.id) ?? []);
  normalized.lines = normalized.lines.map((line) => ({
    ...line,
    optionGroupId:
      line.optionGroupId && validGroupIds.has(line.optionGroupId) ? line.optionGroupId : null,
  }));
  normalized.optionGroups = syncOptionGroupsWithLines(
    normalized.optionGroups ?? [],
    normalized.lines,
  );
  return normalized;
}

function suggestDocNumber(project: ProjectRow, kind: ProjectDocumentKind): string {
  const projectNumber = String(project.project_number ?? "JOB").replace(/\s+/g, "");
  const prefix =
    kind === "quote"
      ? "Q"
      : kind === "invoice"
        ? "INV"
        : kind === "rfq"
          ? "RFQ"
          : kind === "purchase_order"
            ? "PO"
            : kind === "bol"
              ? "BOL"
              : kind === "packing_list"
                ? "PK"
                : "DOC";
  return `${prefix}-${projectNumber}-${formatRiversideDateStampYmd(new Date())}`;
}

function createPdfBlob(buffer: ArrayBuffer | Uint8Array): Blob {
  const source = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const byteCopy = new Uint8Array(source.byteLength);
  byteCopy.set(source);
  return new Blob([byteCopy.buffer], { type: "application/pdf" });
}

type UseProjectDocumentsParams = {
  projectId: string;
  project: ProjectRow;
  supabase: SupabaseClient;
  onProjectRefresh: () => void;
  canManageDocuments?: boolean;
};

export function useProjectDocuments({
  projectId,
  project,
  supabase,
  onProjectRefresh,
  canManageDocuments = true,
}: UseProjectDocumentsParams) {
  const workspace = useProjectWorkspaceOptional();
  const lastWorkspaceTapeHandledRef = useRef<string | null>(null);
  const [localShowPreview, setLocalShowPreview] = useState(true);
  const [localPreviewZoom, setLocalPreviewZoom] = useState(100);

  const [rows, setRows] = useState<ProjectDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [crm, setCrm] = useState<CustomerWithShipping | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kind, setKind] = useState<ProjectDocumentKind>("quote");
  const [docNumber, setDocNumber] = useState("");
  const [vendorId, setVendorId] = useState<string>("");
  const [meta, setMeta] = useState<ProjectDocumentDraftMeta>(emptyMeta());
  const [collapsedOptionGroupIds, setCollapsedOptionGroupIds] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportingRow, setExportingRow] = useState<ProjectDocumentRow | null>(null);
  const [exportRevisions, setExportRevisions] = useState<ProjectDocumentRevisionRow[]>([]);
  const [selectedExportRevisionIndex, setSelectedExportRevisionIndex] = useState<number | null>(null);
  const [exportRevisionsLoading, setExportRevisionsLoading] = useState(false);
  const [exportMethod, setExportMethod] = useState<"download" | "onedrive">("download");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const [updateMilestones, setUpdateMilestones] = useState(false);

  const [calcImportOpen, setCalcImportOpen] = useState(false);
  const [calcImportBusy, setCalcImportBusy] = useState(false);
  const [calcTapes, setCalcTapes] = useState<ProjectCalcTapeRow[]>([]);
  const [selectedCalcTapeId, setSelectedCalcTapeId] = useState("");
  const [calcLines, setCalcLines] = useState<ProjectCalcLineRow[]>([]);
  const [selectedCalcLineIds, setSelectedCalcLineIds] = useState<string[]>([]);
  const [calcStrategy, setCalcStrategy] = useState<ImportStrategy>("oneToOne");
  const [calcMarkupPct, setCalcMarkupPct] = useState<number>(project.material_markup_pct ?? 30);
  const [calcSyncBusy, setCalcSyncBusy] = useState(false);
  const [calcSyncError, setCalcSyncError] = useState<string | null>(null);
  const [calcSyncMessage, setCalcSyncMessage] = useState<string | null>(null);
  const [calcSyncConflicts, setCalcSyncConflicts] = useState<CalcSyncConflict[]>([]);
  const lineUndoStackRef = useRef<DocumentLineItem[][]>([]);
  const [lineUndoDepth, setLineUndoDepth] = useState(0);

  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [rowRevisionCache, setRowRevisionCache] = useState<Record<string, ProjectDocumentRevisionRow[]>>({});
  const [rowRevisionLoading, setRowRevisionLoading] = useState<Record<string, boolean>>({});
  const [rowRevisionError, setRowRevisionError] = useState<Record<string, string>>({});

  const clearLineUndoStack = useCallback(() => {
    lineUndoStackRef.current = [];
    setLineUndoDepth(0);
  }, []);

  const pushLineUndoSnapshot = useCallback((lines: DocumentLineItem[]) => {
    lineUndoStackRef.current = [...lineUndoStackRef.current.slice(-39), normalizeDocumentLines(lines)];
    setLineUndoDepth(lineUndoStackRef.current.length);
  }, []);

  const defaultShipTo = useMemo(() => {
    const addresses = crm?.customer_shipping_addresses;
    if (!addresses?.length) return null;
    const defaultAddress = addresses.find((address) => address.is_default);
    return defaultAddress ?? addresses[0] ?? null;
  }, [crm]);

  const loadDocs = useCallback(async () => {
    const { data, error } = await supabase
      .from("project_documents")
      .select(PROJECT_DOCUMENT_SELECT)
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false });
    if (!error && data) {
      setRows(data as ProjectDocumentRow[]);
    }
    setLoading(false);
  }, [projectId, supabase]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("vendors")
      .select(VENDOR_LIST_SELECT)
      .order("legal_name", { ascending: true })
      .then(({ data }) => {
        if (!cancelled && data) setVendors(data as VendorRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    const customerId = project.customer_id;
    if (!customerId) {
      setCrm(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from("customers")
      .select(CUSTOMER_DETAIL_SELECT)
      .eq("id", customerId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setCrm(data as CustomerWithShipping);
      });
    return () => {
      cancelled = true;
    };
  }, [project.customer_id, supabase]);

  const openNew = useCallback(() => {
    setEditingId(null);
    setKind("quote");
    setDocNumber(suggestDocNumber(project, "quote"));
    setVendorId("");
    setMeta(normalizeMeta(buildDefaultDocumentMetaFromProject(project)));
    setCollapsedOptionGroupIds([]);
    setSaveError(null);
    setCalcSyncError(null);
    setCalcSyncMessage(null);
    setCalcSyncConflicts([]);
    clearLineUndoStack();
    setEditorOpen(true);
    workspace?.setActiveDocumentId(null);
  }, [clearLineUndoStack, project, workspace]);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setCalcSyncError(null);
    setCalcSyncMessage(null);
    setCalcSyncConflicts([]);
    clearLineUndoStack();
    workspace?.setActiveDocumentId(null);
  }, [clearLineUndoStack, workspace]);

  const openEdit = useCallback(
    (row: ProjectDocumentRow) => {
      setEditingId(row.id);
      setKind(row.kind);
      setDocNumber(row.number ?? suggestDocNumber(project, row.kind));
      setVendorId(row.vendor_id ?? "");
      setMeta(normalizeMeta(row.metadata));
      setCollapsedOptionGroupIds([]);
      setSaveError(null);
      setCalcSyncError(null);
      setCalcSyncMessage(null);
      setCalcSyncConflicts([]);
      clearLineUndoStack();
      setEditorOpen(true);
      workspace?.setActiveDocumentId(row.id);
    },
    [clearLineUndoStack, project, workspace],
  );

  const saveDraft = useCallback(async () => {
    if (!canManageDocuments) {
      setSaveError("Your role does not allow editing project documents.");
      return;
    }
    setSaveError(null);
    setSaveBusy(true);
    try {
      const metaToSave: ProjectDocumentDraftMeta = { ...meta };
      if (documentKindSupportsQuoteFinancialsSnapshot(kind)) {
        metaToSave.quoteFinancialsSnapshot = buildQuoteFinancialsSnapshot(project);
      } else {
        delete metaToSave.quoteFinancialsSnapshot;
      }
      const payload = {
        project_id: projectId,
        kind,
        number: docNumber.trim() || null,
        metadata: metaToSave,
        vendor_id:
          kind === "rfq" || kind === "purchase_order" ? vendorId.trim() || null : null,
      };

      if (editingId) {
        const editingRow = rows.find((row) => row.id === editingId) ?? null;
        const hasExportedFile = Boolean(editingRow?.pdf_path);
        if (hasExportedFile) {
          const { error } = await supabase.rpc("append_project_document_revision", {
            p_document_id: editingId,
            p_number: payload.number,
            p_metadata: payload.metadata,
            p_vendor_id: payload.vendor_id,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("project_documents")
            .update({
              number: payload.number,
              metadata: payload.metadata,
              vendor_id: payload.vendor_id,
            })
            .eq("id", editingId);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase.rpc("create_project_document_with_initial_revision", {
          p_project_id: payload.project_id,
          p_kind: payload.kind,
          p_number: payload.number,
          p_metadata: payload.metadata,
          p_vendor_id: payload.vendor_id,
        });
        if (error) throw error;
      }

      const financialPatch = projectPatchFromSavedQuoteOrInvoice(kind, metaToSave);
      if (financialPatch && Object.keys(financialPatch).length > 0) {
        const { error: projectError } = await supabase
          .from("projects")
          .update(financialPatch)
          .eq("id", projectId);
        if (projectError) throw projectError;
        onProjectRefresh();
      }

      setEditorOpen(false);
      clearLineUndoStack();
      workspace?.setActiveDocumentId(null);
      await loadDocs();
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaveBusy(false);
    }
  }, [canManageDocuments, clearLineUndoStack, docNumber, editingId, kind, loadDocs, meta, onProjectRefresh, project, projectId, rows, supabase, vendorId, workspace]);

  const syncLines = useCallback((lines: DocumentLineItem[]) => {
    setMeta((prev) => {
      const nextLines = normalizeDocumentLines(lines);
      const optionGroups = syncOptionGroupsWithLines(prev.optionGroups ?? [], nextLines);
      const validGroupIds = new Set(optionGroups.map((group) => group.id));
      const cleanLines = nextLines.map((line) => ({
        ...line,
        optionGroupId:
          line.optionGroupId && validGroupIds.has(line.optionGroupId) ? line.optionGroupId : null,
      }));
      return {
        ...prev,
        lines: cleanLines,
        optionGroups: syncOptionGroupsWithLines(optionGroups, cleanLines),
      };
    });
  }, []);

  const addLine = useCallback(() => {
    const nextNo = meta.lines.reduce((maxLineNo, line) => Math.max(maxLineNo, line.lineNo), 0) + 1;
    const normalizedLines = normalizeDocumentLines(meta.lines);
    pushLineUndoSnapshot(normalizedLines);
    syncLines([
      ...normalizedLines,
      {
        id: createDocumentLineId(),
        lineNo: nextNo,
        description: "",
        qty: 1,
        uom: "EA",
        unitPrice: 0,
        extended: 0,
        parentId: null,
      },
    ]);
  }, [meta.lines, pushLineUndoSnapshot, syncLines]);

  const removeLine = useCallback(
    (lineNo: number) => {
      const normalizedLines = normalizeDocumentLines(meta.lines);
      pushLineUndoSnapshot(normalizedLines);
      syncLines(removeLineWithinHierarchy(normalizedLines, lineNo));
    },
    [meta.lines, pushLineUndoSnapshot, syncLines],
  );

  const addSubLine = useCallback(
    (parentLineNo: number) => {
      const normalizedLines = normalizeDocumentLines(meta.lines);
      const parentLine = normalizedLines.find((line) => line.lineNo === parentLineNo);
      if (!parentLine?.id) return;

      const nextNo = normalizedLines.reduce((maxLineNo, line) => Math.max(maxLineNo, line.lineNo), 0) + 1;
      pushLineUndoSnapshot(normalizedLines);
      syncLines([
        ...normalizedLines,
        {
          id: createDocumentLineId(),
          lineNo: nextNo,
          description: "",
          qty: 1,
          uom: "EA",
          unitPrice: 0,
          extended: 0,
          parentId: parentLine.id,
          optionGroupId: parentLine.optionGroupId ?? null,
        },
      ]);
    },
    [meta.lines, pushLineUndoSnapshot, syncLines],
  );

  const moveLineUp = useCallback(
    (lineNo: number) => {
      pushLineUndoSnapshot(meta.lines);
      syncLines(moveLineWithinHierarchy(meta.lines, lineNo, "up"));
    },
    [meta.lines, pushLineUndoSnapshot, syncLines],
  );

  const moveLineDown = useCallback(
    (lineNo: number) => {
      pushLineUndoSnapshot(meta.lines);
      syncLines(moveLineWithinHierarchy(meta.lines, lineNo, "down"));
    },
    [meta.lines, pushLineUndoSnapshot, syncLines],
  );

  const reorderLine = useCallback(
    (lineNo: number, targetLineNo: number) => {
      pushLineUndoSnapshot(meta.lines);
      syncLines(reorderLineWithinHierarchy(meta.lines, lineNo, targetLineNo));
    },
    [meta.lines, pushLineUndoSnapshot, syncLines],
  );

  const moveLineAcrossSections = useCallback(
    (lineNo: number, targetLineNo: number | null, targetOptionGroupId: string | null) => {
      pushLineUndoSnapshot(meta.lines);
      syncLines(
        moveLineBetweenSectionsWithinHierarchy(meta.lines, lineNo, targetLineNo, targetOptionGroupId),
      );
    },
    [meta.lines, pushLineUndoSnapshot, syncLines],
  );

  const indentLine = useCallback(
    (lineNo: number) => {
      const normalizedLines = normalizeDocumentLines(meta.lines);
      const targetIndex = normalizedLines.findIndex((line) => line.lineNo === lineNo);
      if (targetIndex <= 0) return;
      const target = normalizedLines[targetIndex];
      const previous = normalizedLines[targetIndex - 1];
      if (!target.id || !previous.id) return;
      if ((target.optionGroupId ?? null) !== (previous.optionGroupId ?? null)) return;
      pushLineUndoSnapshot(normalizedLines);
      syncLines(
        normalizedLines.map((line) =>
          line.lineNo === lineNo ? { ...line, parentId: previous.id ?? null } : line,
        ),
      );
    },
    [meta.lines, pushLineUndoSnapshot, syncLines],
  );

  const outdentLine = useCallback(
    (lineNo: number) => {
      const normalizedLines = normalizeDocumentLines(meta.lines);
      const byId = new Map(normalizedLines.map((line) => [line.id as string, line]));
      const target = normalizedLines.find((line) => line.lineNo === lineNo);
      if (!target?.id || !target.parentId) return;
      const parent = byId.get(target.parentId);
      const nextParentId = parent?.parentId ?? null;
      pushLineUndoSnapshot(normalizedLines);
      syncLines(
        normalizedLines.map((line) =>
          line.lineNo === lineNo ? { ...line, parentId: nextParentId } : line,
        ),
      );
    },
    [meta.lines, pushLineUndoSnapshot, syncLines],
  );

  const addOptionGroup = useCallback(() => {
    setMeta((prev) => {
      const existing = prev.optionGroups ?? [];
      const nextIndex = existing.length + 1;
      const nextGroups = [
        ...existing,
        {
          id: createOptionGroupId(),
          title: `Option ${nextIndex}`,
          lineIds: [],
        },
      ];
      return {
        ...prev,
        optionGroups: syncOptionGroupsWithLines(nextGroups, prev.lines),
      };
    });
  }, []);

  const renameOptionGroup = useCallback((optionGroupId: string, title: string) => {
    setMeta((prev) => {
      const nextGroups = (prev.optionGroups ?? []).map((group) =>
        group.id === optionGroupId ? { ...group, title: title.trim() || "Option" } : group,
      );
      return {
        ...prev,
        optionGroups: syncOptionGroupsWithLines(nextGroups, prev.lines),
      };
    });
  }, []);

  const removeOptionGroup = useCallback((optionGroupId: string) => {
    setMeta((prev) => {
      const nextLines = prev.lines.map((line) =>
        line.optionGroupId === optionGroupId ? { ...line, optionGroupId: null } : line,
      );
      const nextGroups = (prev.optionGroups ?? []).filter((group) => group.id !== optionGroupId);
      return {
        ...prev,
        lines: nextLines,
        optionGroups: syncOptionGroupsWithLines(nextGroups, nextLines),
      };
    });
    setCollapsedOptionGroupIds((prev) => prev.filter((id) => id !== optionGroupId));
  }, []);

  const setOptionGroupCollapsed = useCallback((optionGroupId: string, collapsed: boolean) => {
    setCollapsedOptionGroupIds((prev) => {
      const has = prev.includes(optionGroupId);
      if (collapsed && !has) return [...prev, optionGroupId];
      if (!collapsed && has) return prev.filter((id) => id !== optionGroupId);
      return prev;
    });
  }, []);

  const patchLine = useCallback(
    (lineNo: number, patch: Partial<DocumentLineItem>) => {
      const normalizedLines = normalizeDocumentLines(meta.lines);
      syncLines(
        normalizedLines.map((line) => {
          if (line.lineNo !== lineNo) return line;
          const updated = { ...line, ...patch };
          if (patch.qty != null || patch.unitPrice != null) {
            updated.extended = updated.qty * updated.unitPrice;
          }
          return updated;
        }),
      );
    },
    [meta.lines, syncLines],
  );

  const assignLineOptionGroup = useCallback((lineNo: number, optionGroupId: string | null) => {
    pushLineUndoSnapshot(meta.lines);
    patchLine(lineNo, { optionGroupId: optionGroupId || null });
  }, [meta.lines, patchLine, pushLineUndoSnapshot]);

  const undoLineStructureChange = useCallback(() => {
    const stack = lineUndoStackRef.current;
    const snapshot = stack[stack.length - 1];
    if (!snapshot) return;
    lineUndoStackRef.current = stack.slice(0, -1);
    setLineUndoDepth(lineUndoStackRef.current.length);
    syncLines(snapshot);
  }, [syncLines]);

  const setQuoteMultipleOptionsPresentation = useCallback((enabled: boolean) => {
    setMeta((prev) => ({ ...prev, quotePresentAsMultipleOptions: enabled }));
  }, []);

  const openCalcImport = useCallback(
    async (preferredTapeId?: string | null) => {
      setCalcImportBusy(true);
      setCalcImportOpen(true);
      setCalcStrategy("oneToOne");
      setCalcMarkupPct(project.material_markup_pct ?? 30);
      const { data, error } = await supabase
        .from("project_calc_tapes")
        .select(PROJECT_CALC_TAPE_SELECT)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) {
        setCalcImportBusy(false);
        return;
      }
      const tapes = (data ?? []) as ProjectCalcTapeRow[];
      setCalcTapes(tapes);
      const firstTapeId =
        (preferredTapeId && tapes.some((tape) => tape.id === preferredTapeId) ? preferredTapeId : null) ??
        tapes[0]?.id ??
        "";
      setSelectedCalcTapeId(firstTapeId);
      if (!firstTapeId) {
        setCalcLines([]);
        setSelectedCalcLineIds([]);
        setCalcImportBusy(false);
        return;
      }
      const { data: lineData } = await supabase
        .from("project_calc_lines")
        .select(PROJECT_CALC_LINE_SELECT)
        .eq("tape_id", firstTapeId)
        .order("position", { ascending: true });
      const rowsToImport = (lineData ?? []) as ProjectCalcLineRow[];
      setCalcLines(rowsToImport);
      setSelectedCalcLineIds(
        rowsToImport.filter((row) => row.kind === "material").map((row) => row.id),
      );
      setCalcImportBusy(false);
    },
    [project.material_markup_pct, projectId, supabase],
  );

  useEffect(() => {
    if (!workspace) return;
    if (workspace.focusTarget !== "docs") return;
    if (workspace.focusedDocKind) {
      setKind(workspace.focusedDocKind);
    }
    if (
      workspace.lastSavedTapeId &&
      lastWorkspaceTapeHandledRef.current !== workspace.lastSavedTapeId
    ) {
      lastWorkspaceTapeHandledRef.current = workspace.lastSavedTapeId;
      void openCalcImport(workspace.lastSavedTapeId);
    }
  }, [openCalcImport, workspace, workspace?.focusTarget, workspace?.focusedDocKind, workspace?.lastSavedTapeId]);

  const loadCalcTapeLines = useCallback(
    async (tapeId: string) => {
      setSelectedCalcTapeId(tapeId);
      if (!tapeId) {
        setCalcLines([]);
        setSelectedCalcLineIds([]);
        return;
      }
      setCalcImportBusy(true);
      const { data } = await supabase
        .from("project_calc_lines")
        .select(PROJECT_CALC_LINE_SELECT)
        .eq("tape_id", tapeId)
        .order("position", { ascending: true });
      const rowsToImport = (data ?? []) as ProjectCalcLineRow[];
      setCalcLines(rowsToImport);
      setSelectedCalcLineIds(
        rowsToImport.filter((row) => row.kind === "material").map((row) => row.id),
      );
      setCalcImportBusy(false);
    },
    [supabase],
  );

  const calcImportPreview = useMemo(() => {
    const selectedRows = calcLines.filter((row) => selectedCalcLineIds.includes(row.id));
    return buildDocumentLinesFromCalc({
      selectedRows,
      strategy: calcStrategy,
      project,
      markupPct: calcMarkupPct,
    });
  }, [calcLines, calcMarkupPct, calcStrategy, project, selectedCalcLineIds]);

  const linkedCalcLinesCount = useMemo(
    () => meta.lines.filter((line) => Boolean(linkedCalcLineId(line))).length,
    [meta.lines],
  );
  const dirtyLinkedCalcLinesCount = useMemo(
    () => meta.lines.filter((line) => isCalcLinkedLineStale(line)).length,
    [meta.lines],
  );
  const calcSyncConflictCalcLineIds = useMemo(
    () => Array.from(new Set(calcSyncConflicts.map((conflict) => conflict.calcLineId))),
    [calcSyncConflicts],
  );

  useEffect(() => {
    if (!workspace) return;
    const linkedTapeIds = Array.from(
      new Set(
        meta.lines
          .map((line) => (typeof line.calcTapeId === "string" ? line.calcTapeId.trim() : ""))
          .filter(Boolean),
      ),
    );
    const current = workspace.linkedCalcTapeIds ?? [];
    if (
      current.length === linkedTapeIds.length &&
      current.every((id, index) => id === linkedTapeIds[index])
    ) {
      return;
    }
    workspace.setLinkedCalcTapeIds(linkedTapeIds);
  }, [meta.lines, workspace]);

  useEffect(() => {
    if (calcSyncConflicts.length === 0) return;
    setCalcSyncConflicts((prev) => {
      const filtered = filterCalcConflictsForCurrentLines(prev, meta.lines);
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [calcSyncConflicts.length, meta.lines]);

  const applyCalcImport = useCallback(() => {
    if (calcImportPreview.length === 0) return;
    const start = meta.lines.reduce((maxLineNo, line) => Math.max(maxLineNo, line.lineNo), 0);
    const renumbered = calcImportPreview.map((line, index) => ({
      ...line,
      lineNo: start + index + 1,
    }));
    syncLines([...meta.lines, ...renumbered]);
    setCalcImportOpen(false);
  }, [calcImportPreview, meta.lines, syncLines]);

  const refreshLinkedCalcLines = useCallback(async () => {
    const linkedLineIds = collectLinkedCalcLineIds(meta.lines);
    if (linkedLineIds.length === 0) {
      setCalcSyncMessage("No calc-linked rows to refresh.");
      setCalcSyncError(null);
      setCalcSyncConflicts([]);
      return;
    }

    setCalcSyncBusy(true);
    setCalcSyncError(null);
    setCalcSyncMessage(null);
    setCalcSyncConflicts([]);
    try {
      const { data, error } = await supabase
        .from("project_calc_lines")
        .select(PROJECT_CALC_LINE_SELECT)
        .eq("project_id", projectId)
        .in("id", linkedLineIds);
      if (error) throw error;
      const calcRows = (data ?? []) as ProjectCalcLineRow[];
      const refreshed = refreshDocumentFromCalc(meta.lines, calcRows);
      syncLines(refreshed.lines);
      setCalcSyncMessage(
        `Refreshed ${refreshed.refreshedCount} linked row${refreshed.refreshedCount === 1 ? "" : "s"} from calc.`,
      );
    } catch (error: unknown) {
      setCalcSyncError(error instanceof Error ? error.message : "Failed to refresh linked calc rows.");
    } finally {
      setCalcSyncBusy(false);
    }
  }, [meta.lines, projectId, supabase, syncLines]);

  const pushLinkedCalcChanges = useCallback(async () => {
    const linkedLines = meta.lines
      .map((line) => ({ line, calcLineId: linkedCalcLineId(line) }))
      .filter((entry): entry is { line: DocumentLineItem; calcLineId: string } => Boolean(entry.calcLineId));
    if (linkedLines.length === 0) {
      setCalcSyncMessage("No calc-linked rows to push.");
      setCalcSyncError(null);
      setCalcSyncConflicts([]);
      return;
    }
    const staleLinkedLines = linkedLines.filter(({ line }) => isCalcLinkedLineStale(line));
    if (staleLinkedLines.length === 0) {
      setCalcSyncMessage("All linked calc rows are already in sync.");
      setCalcSyncError(null);
      setCalcSyncConflicts([]);
      return;
    }

    setCalcSyncBusy(true);
    setCalcSyncError(null);
    setCalcSyncMessage(null);
    try {
      const staleIds = staleLinkedLines.map(({ calcLineId }) => calcLineId);
      const { data, error: staleFetchError } = await supabase
        .from("project_calc_lines")
        .select(PROJECT_CALC_LINE_SELECT)
        .eq("project_id", projectId)
        .in("id", staleIds);
      if (staleFetchError) throw staleFetchError;

      const staleRows = (data ?? []) as ProjectCalcLineRow[];
      const { conflicts, pushableLines } = detectSyncConflicts(staleLinkedLines, staleRows);

      let pushed = 0;
      for (const { line, calcLineId } of pushableLines) {
        const { error } = await supabase
          .from("project_calc_lines")
          .update({
            description: line.description,
            qty: line.qty,
            uom: line.uom,
            total_sell: line.extended,
          })
          .eq("project_id", projectId)
          .eq("id", calcLineId);
        if (error) throw error;
        pushed += 1;
      }
      syncLines(applySyncBaselineFromDocument(meta.lines, pushableLines.map((entry) => entry.calcLineId)));
      setCalcSyncConflicts(conflicts);
      if (conflicts.length > 0) {
        setCalcSyncMessage(
          `Pushed ${pushed} row${pushed === 1 ? "" : "s"}; ${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"} need resolution.`,
        );
      } else {
        setCalcSyncMessage(`Pushed ${pushed} linked row${pushed === 1 ? "" : "s"} to calc.`);
      }
      const refreshedTapeId = pushableLines.find(({ line }) => line.calcTapeId)?.line.calcTapeId;
      if (workspace && refreshedTapeId) {
        workspace.notifyTapeSaved(refreshedTapeId);
      }
    } catch (error: unknown) {
      setCalcSyncError(error instanceof Error ? error.message : "Failed to push document changes to calc.");
    } finally {
      setCalcSyncBusy(false);
    }
  }, [meta.lines, projectId, supabase, syncLines, workspace]);

  const resolveCalcSyncConflictsUsingDocument = useCallback(async () => {
    if (calcSyncConflicts.length === 0) {
      setCalcSyncMessage("No calc sync conflicts to resolve.");
      setCalcSyncError(null);
      return;
    }
    const conflictIds = new Set(calcSyncConflicts.map((conflict) => conflict.calcLineId));
    const conflictLines = meta.lines
      .map((line) => ({ line, calcLineId: linkedCalcLineId(line) }))
      .filter((entry): entry is { line: DocumentLineItem; calcLineId: string } => {
        if (!entry.calcLineId) return false;
        return conflictIds.has(entry.calcLineId);
      });
    if (conflictLines.length === 0) {
      setCalcSyncConflicts([]);
      setCalcSyncMessage("Calc conflicts already cleared.");
      setCalcSyncError(null);
      return;
    }

    setCalcSyncBusy(true);
    setCalcSyncError(null);
    setCalcSyncMessage(null);
    try {
      for (const { line, calcLineId } of conflictLines) {
        const { error } = await supabase
          .from("project_calc_lines")
          .update({
            description: line.description,
            qty: line.qty,
            uom: line.uom,
            total_sell: line.extended,
          })
          .eq("project_id", projectId)
          .eq("id", calcLineId);
        if (error) throw error;
      }
      syncLines(
        applySyncBaselineFromDocument(
          meta.lines,
          conflictLines.map(({ calcLineId }) => calcLineId),
        ),
      );
      setCalcSyncConflicts([]);
      setCalcSyncMessage(
        `Resolved ${conflictLines.length} conflict${conflictLines.length === 1 ? "" : "s"} using document values.`,
      );
    } catch (error: unknown) {
      setCalcSyncError(
        error instanceof Error ? error.message : "Failed to resolve calc conflicts with document values.",
      );
    } finally {
      setCalcSyncBusy(false);
    }
  }, [calcSyncConflicts, meta.lines, projectId, supabase, syncLines]);

  const resolveCalcSyncConflictsUsingCalc = useCallback(async () => {
    if (calcSyncConflicts.length === 0) {
      setCalcSyncMessage("No calc sync conflicts to resolve.");
      setCalcSyncError(null);
      return;
    }
    const conflictIds = calcSyncConflicts.map((conflict) => conflict.calcLineId);
    setCalcSyncBusy(true);
    setCalcSyncError(null);
    setCalcSyncMessage(null);
    try {
      const { data, error } = await supabase
        .from("project_calc_lines")
        .select(PROJECT_CALC_LINE_SELECT)
        .eq("project_id", projectId)
        .in("id", conflictIds);
      if (error) throw error;
      const calcRows = (data ?? []) as ProjectCalcLineRow[];
      const onlyConflictRows = calcRows.filter((row) => conflictIds.includes(row.id));
      const refreshed = refreshDocumentFromCalc(meta.lines, onlyConflictRows);
      syncLines(refreshed.lines);
      setCalcSyncConflicts([]);
      setCalcSyncMessage(
        `Resolved ${refreshed.refreshedCount} conflict${refreshed.refreshedCount === 1 ? "" : "s"} using current calc values.`,
      );
    } catch (error: unknown) {
      setCalcSyncError(
        error instanceof Error ? error.message : "Failed to resolve calc conflicts with calc values.",
      );
    } finally {
      setCalcSyncBusy(false);
    }
  }, [calcSyncConflicts, meta.lines, projectId, supabase, syncLines]);

  const loadRevisionHistoryForRow = useCallback(
    async (documentId: string): Promise<ProjectDocumentRevisionRow[]> => {
      const cached = rowRevisionCache[documentId];
      if (cached) return cached;

      setRowRevisionLoading((prev) => ({ ...prev, [documentId]: true }));
      setRowRevisionError((prev) => ({ ...prev, [documentId]: "" }));
      const { data, error } = await supabase
        .from("project_document_revisions")
        .select(PROJECT_DOCUMENT_REVISION_SELECT)
        .eq("document_id", documentId)
        .order("revision_index", { ascending: false });
      if (error) {
        setRowRevisionLoading((prev) => ({ ...prev, [documentId]: false }));
        setRowRevisionError((prev) => ({ ...prev, [documentId]: error.message }));
        return [];
      }
      const revisions = (data ?? []) as ProjectDocumentRevisionRow[];
      setRowRevisionCache((prev) => ({ ...prev, [documentId]: revisions }));
      setRowRevisionLoading((prev) => ({ ...prev, [documentId]: false }));
      return revisions;
    },
    [rowRevisionCache, supabase],
  );

  const openExportFor = useCallback(
    async (row: ProjectDocumentRow, preferredRevisionIndex?: number) => {
      setExportingRow(row);
      const defaultRevision = normalizeRevisionIndex(row.current_revision_index);
      setSelectedExportRevisionIndex(
        preferredRevisionIndex == null
          ? defaultRevision
          : normalizeRevisionIndex(preferredRevisionIndex),
      );
      setExportRevisionsLoading(true);
      setExportMethod("onedrive");
      setExportError("");
      setUpdateMilestones(true);
      setExportOpen(true);

      const revisions = await loadRevisionHistoryForRow(row.id);
      setExportRevisions(revisions);
      if (revisions.length === 0) {
        setExportError((prev) => prev || "No revisions found for this document.");
      }
      setExportRevisionsLoading(false);
    },
    [loadRevisionHistoryForRow],
  );

  const openPdfBuffer = useCallback((buffer: ArrayBuffer | Uint8Array, shouldPrint = false) => {
    const blob = createPdfBlob(buffer);
    const url = URL.createObjectURL(blob);
    if (!shouldPrint) {
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    const opened = openPdfPrintWindow({
      url,
      onSettled: () => {
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
    });
    if (!opened) {
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  }, []);

  const quickPreview = useCallback(
    async (row: ProjectDocumentRow, shouldPrint = false) => {
      try {
        const logo = await fetchLogoDataUrl(row.kind);
        const buffer = await generateProjectDocumentPdfBuffer({
          kind: row.kind,
          documentNumber: row.number ?? suggestDocNumber(project, row.kind),
          issuedDate: new Date(),
          logoDataUrl: logo,
          project,
          meta: normalizeMeta(row.metadata),
          vendor:
            row.vendor_id && (row.kind === "rfq" || row.kind === "purchase_order")
              ? vendors.find((vendor) => vendor.id === row.vendor_id) ?? null
              : null,
          customer: crm,
          defaultShipTo,
          revisionIndex: normalizeRevisionIndex(row.current_revision_index),
        });
        openPdfBuffer(buffer, shouldPrint);
      } catch {
        // no-op; keep preview errors silent to match current behavior
      }
    },
    [crm, defaultShipTo, openPdfBuffer, project, vendors],
  );

  const previewSelectedRevision = useCallback(async () => {
    if (!exportingRow) return;
    try {
      const selectedRevision = pickRevisionForExport(
        exportingRow,
        exportRevisions,
        selectedExportRevisionIndex,
      );
      const logo = await fetchLogoDataUrl(exportingRow.kind);
      const vendorForRow =
        (exportingRow.kind === "rfq" || exportingRow.kind === "purchase_order") &&
        selectedRevision.vendorId
          ? vendors.find((vendor) => vendor.id === selectedRevision.vendorId) ?? null
          : null;
      const buffer = await generateProjectDocumentPdfBuffer({
        kind: exportingRow.kind,
        documentNumber:
          selectedRevision.number ??
          exportingRow.number ??
          suggestDocNumber(project, exportingRow.kind),
        issuedDate: new Date(),
        logoDataUrl: logo,
        project,
        meta: normalizeMeta(selectedRevision.metadata),
        vendor: vendorForRow,
        customer: crm,
        defaultShipTo,
        revisionIndex: normalizeRevisionIndex(selectedRevision.revisionIndex),
      });
      openPdfBuffer(buffer);
    } catch {
      // no-op; keep preview errors silent to match current behavior
    }
  }, [crm, defaultShipTo, exportRevisions, exportingRow, openPdfBuffer, project, selectedExportRevisionIndex, vendors]);

  const printSelectedRevision = useCallback(async () => {
    if (!exportingRow) return;
    try {
      const selectedRevision = pickRevisionForExport(
        exportingRow,
        exportRevisions,
        selectedExportRevisionIndex,
      );
      const logo = await fetchLogoDataUrl(exportingRow.kind);
      const vendorForRow =
        (exportingRow.kind === "rfq" || exportingRow.kind === "purchase_order") &&
        selectedRevision.vendorId
          ? vendors.find((vendor) => vendor.id === selectedRevision.vendorId) ?? null
          : null;
      const buffer = await generateProjectDocumentPdfBuffer({
        kind: exportingRow.kind,
        documentNumber:
          selectedRevision.number ??
          exportingRow.number ??
          suggestDocNumber(project, exportingRow.kind),
        issuedDate: new Date(),
        logoDataUrl: logo,
        project,
        meta: normalizeMeta(selectedRevision.metadata),
        vendor: vendorForRow,
        customer: crm,
        defaultShipTo,
        revisionIndex: normalizeRevisionIndex(selectedRevision.revisionIndex),
      });
      openPdfBuffer(buffer, true);
    } catch {
      // no-op; keep preview errors silent to match current behavior
    }
  }, [crm, defaultShipTo, exportRevisions, exportingRow, openPdfBuffer, project, selectedExportRevisionIndex, vendors]);

  const previewRevisionFromHistory = useCallback(
    async (row: ProjectDocumentRow, revision: ProjectDocumentRevisionRow, shouldPrint = false) => {
      try {
        const logo = await fetchLogoDataUrl(row.kind);
        const picked = pickRevisionForExport(row, [revision], revision.revision_index);
        const vendorForRow =
          (row.kind === "rfq" || row.kind === "purchase_order") && picked.vendorId
            ? vendors.find((vendor) => vendor.id === picked.vendorId) ?? null
            : null;
        const buffer = await generateProjectDocumentPdfBuffer({
          kind: row.kind,
          documentNumber: picked.number ?? row.number ?? suggestDocNumber(project, row.kind),
          issuedDate: new Date(),
          logoDataUrl: logo,
          project,
          meta: normalizeMeta(picked.metadata),
          vendor: vendorForRow,
          customer: crm,
          defaultShipTo,
          revisionIndex: picked.revisionIndex,
        });
        openPdfBuffer(buffer, shouldPrint);
      } catch {
        // no-op; keep preview errors silent to match current behavior
      }
    },
    [crm, defaultShipTo, openPdfBuffer, project, vendors],
  );

  const runExport = useCallback(async () => {
    if (!canManageDocuments) return;
    if (!exportingRow) return;
    setExportBusy(true);
    setExportError("");
    try {
      const selectedRevision = pickRevisionForExport(
        exportingRow,
        exportRevisions,
        selectedExportRevisionIndex,
      );
      const logo = await fetchLogoDataUrl(exportingRow.kind);
      const vendorForRow =
        (exportingRow.kind === "rfq" || exportingRow.kind === "purchase_order") &&
        selectedRevision.vendorId
          ? vendors.find((vendor) => vendor.id === selectedRevision.vendorId) ?? null
          : null;
      const issuedDate = new Date();
      const revisionIndex = normalizeRevisionIndex(selectedRevision.revisionIndex);
      const buffer = await generateProjectDocumentPdfBuffer({
        kind: exportingRow.kind,
        documentNumber:
          selectedRevision.number ??
          exportingRow.number ??
          suggestDocNumber(project, exportingRow.kind),
        issuedDate,
        logoDataUrl: logo,
        project,
        meta: normalizeMeta(selectedRevision.metadata),
        vendor: vendorForRow,
        customer: crm,
        defaultShipTo,
        revisionIndex,
      });

      const filename = buildDocumentDownloadFilename(
        String(project.project_number ?? "JOB"),
        exportingRow.kind,
        project.project_name ?? "",
        revisionIndex,
        issuedDate,
      );

      if (exportMethod === "download") {
        const blob = createPdfBlob(buffer);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
        const { error: exportMarkError } = await supabase.rpc(
          "mark_project_document_revision_exported",
          {
            p_document_id: exportingRow.id,
            p_revision_index: revisionIndex,
            p_export_channel: "download",
            p_pdf_path: null,
            p_filename: filename,
            p_issued_at: issuedDate.toISOString(),
          },
        );
        if (exportMarkError) throw exportMarkError;
      } else {
        const file = new File([createPdfBlob(buffer)], filename, {
          type: "application/pdf",
        });
        const uploadForm = new FormData();
        uploadForm.set("file", file);
        uploadForm.set("filename", filename);
        uploadForm.set("revisionIndex", String(revisionIndex));
        const uploadResponse = await fetch(`/api/projects/${projectId}/documents/export-onedrive`, {
          method: "POST",
          body: uploadForm,
        });
        const payload = (await uploadResponse.json().catch(() => ({}))) as {
          path?: string;
          error?: string;
        };
        if (!uploadResponse.ok || !payload.path) {
          throw new Error(payload.error ?? "OneDrive export failed.");
        }
        const path = payload.path;
        const { error: exportMarkError } = await supabase.rpc(
          "mark_project_document_revision_exported",
          {
            p_document_id: exportingRow.id,
            p_revision_index: revisionIndex,
            p_export_channel: "onedrive",
            p_pdf_path: path,
            p_filename: filename,
            p_issued_at: issuedDate.toISOString(),
          },
        );
        if (exportMarkError) throw exportMarkError;
        if (workspace) {
          workspace.requestFilesSync(filename);
          workspace.focus("files");
        }
      }

      if (updateMilestones) {
        const patch = milestonePatchForDocumentExport(project, exportingRow.kind);
        if (Object.keys(patch).length > 0) {
          await supabase.from("projects").update(patch).eq("id", projectId);
          onProjectRefresh();
        }
      }

      setExportOpen(false);
      setExportingRow(null);
      setUpdateMilestones(false);
      await loadDocs();
    } catch (error: unknown) {
      setExportError(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setExportBusy(false);
    }
  }, [canManageDocuments, crm, defaultShipTo, exportMethod, exportRevisions, exportingRow, loadDocs, onProjectRefresh, project, projectId, selectedExportRevisionIndex, supabase, updateMilestones, vendors, workspace]);

  const toggleHistoryForRow = useCallback(
    async (row: ProjectDocumentRow) => {
      if (expandedHistoryId === row.id) {
        setExpandedHistoryId(null);
        return;
      }
      setExpandedHistoryId(row.id);
      await loadRevisionHistoryForRow(row.id);
    },
    [expandedHistoryId, loadRevisionHistoryForRow],
  );

  const closeExportModal = useCallback(() => {
    setExportOpen(false);
    setExportingRow(null);
  }, []);

  const setShowPreview = useCallback(
    (nextValue: boolean) => {
      if (workspace) {
        workspace.setShowPreview(nextValue);
        return;
      }
      setLocalShowPreview(nextValue);
    },
    [workspace],
  );

  const setPreviewZoom = useCallback(
    (nextValue: number) => {
      if (workspace) {
        workspace.setPreviewZoom(nextValue / 100);
        return;
      }
      setLocalPreviewZoom(nextValue);
    },
    [workspace],
  );

  const showPreview = workspace?.showPreview ?? localShowPreview;
  const previewZoom = Math.round((workspace?.previewZoom ?? localPreviewZoom / 100) * 100);

  const applyDocKind = useCallback(
    (nextKind: ProjectDocumentKind) => {
      setKind(nextKind);
      setDocNumber(suggestDocNumber(project, nextKind));
    },
    [project],
  );

  const setMetaUpdater = useCallback(
    (updater: (prev: ProjectDocumentDraftMeta) => ProjectDocumentDraftMeta) => {
      setMeta((prev) => {
        const nextMeta = updater(prev);
        const lines = normalizeDocumentLines(Array.isArray(nextMeta.lines) ? nextMeta.lines : []);
        const optionGroups = normalizeOptionGroups(nextMeta.optionGroups);
        const validGroupIds = new Set(optionGroups.map((group) => group.id));
        const cleanLines = lines.map((line) => ({
          ...line,
          optionGroupId:
            line.optionGroupId && validGroupIds.has(line.optionGroupId) ? line.optionGroupId : null,
        }));
        return {
          ...nextMeta,
          lines: cleanLines,
          optionGroups: syncOptionGroupsWithLines(optionGroups, cleanLines),
        };
      });
    },
    [],
  );

  useEffect(() => {
    const validGroupIds = new Set((meta.optionGroups ?? []).map((group) => group.id));
    setCollapsedOptionGroupIds((prev) => prev.filter((id) => validGroupIds.has(id)));
  }, [meta.optionGroups]);

  const toggleCalcLineSelection = useCallback((lineId: string, checked: boolean) => {
    setSelectedCalcLineIds((prev) =>
      checked ? [...prev, lineId] : prev.filter((id) => id !== lineId),
    );
  }, []);

  return {
    rows,
    loading,
    vendors,
    crm,
    defaultShipTo,
    editorOpen,
    editingId,
    kind,
    docNumber,
    vendorId,
    meta,
    saveError,
    saveBusy,
    openNew,
    openEdit,
    saveDraft,
    closeEditor,
    setEditorOpen,
    setDocNumber,
    setVendorId,
    setKind: applyDocKind,
    setMeta: setMetaUpdater,
    collapsedOptionGroupIds,
    addOptionGroup,
    renameOptionGroup,
    removeOptionGroup,
    setOptionGroupCollapsed,
    assignLineOptionGroup,
    setQuoteMultipleOptionsPresentation,
    addLine,
    addSubLine,
    moveLineUp,
    moveLineDown,
    reorderLine,
    moveLineAcrossSections,
    indentLine,
    outdentLine,
    removeLine,
    patchLine,
    canUndoLineStructureChange: lineUndoDepth > 0,
    undoLineStructureChange,
    syncProjectTotals: () => setMeta(buildDefaultDocumentMetaFromProject(project)),
    exportOpen,
    exportingRow,
    exportRevisions,
    selectedExportRevisionIndex,
    exportRevisionsLoading,
    exportMethod,
    exportBusy,
    exportError,
    updateMilestones,
    openExportFor,
    runExport,
    setExportMethod,
    setSelectedExportRevisionIndex,
    setUpdateMilestones,
    previewSelectedRevision,
    printSelectedRevision,
    closeExportModal,
    showPreview,
    setShowPreview,
    previewZoom,
    setPreviewZoom,
    activeDocumentId: workspace?.activeDocumentId ?? editingId,
    calcImportOpen,
    calcImportBusy,
    calcTapes,
    selectedCalcTapeId,
    calcLines,
    selectedCalcLineIds,
    calcStrategy,
    calcMarkupPct,
    linkedCalcLinesCount,
    dirtyLinkedCalcLinesCount,
    calcSyncConflictCalcLineIds,
    calcSyncConflicts,
    calcSyncBusy,
    calcSyncError,
    calcSyncMessage,
    calcImportPreview,
    openCalcImport,
    refreshLinkedCalcLines,
    pushLinkedCalcChanges,
    resolveCalcSyncConflictsUsingDocument,
    resolveCalcSyncConflictsUsingCalc,
    loadCalcTapeLines,
    setCalcImportOpen,
    setCalcStrategy,
    setCalcMarkupPct,
    applyCalcImport,
    toggleCalcLineSelection,
    expandedHistoryId,
    rowRevisionCache,
    rowRevisionLoading,
    rowRevisionError,
    toggleHistoryForRow,
    quickPreview,
    previewRevisionFromHistory,
    buildRevisionHistoryLabel,
    normalizeRevisionIndex,
    formatRevisionSuffix,
  };
}
