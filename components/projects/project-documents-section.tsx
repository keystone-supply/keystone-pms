"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CloudUpload,
  CornerDownLeft,
  Eye,
  FileText,
  HardDriveDownload,
  History,
  Plus,
  Printer,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { HelpPopoverButton } from "@/components/ui/help-popover-button";
import {
  buildDocumentLinesFromCalc,
  type ImportStrategy,
} from "@/lib/calcLines/calcLineImport";
import {
  PROJECT_CALC_LINE_SELECT,
  PROJECT_CALC_TAPE_SELECT,
  type ProjectCalcLineRow,
  type ProjectCalcTapeRow,
} from "@/lib/calcLines/types";
import { DOCUMENT_KIND_LABEL, PROJECT_DOCUMENT_KINDS } from "@/lib/documentTypes";
import type {
  DocumentLineItem,
  ProjectDocumentDraftMeta,
  ProjectDocumentKind,
} from "@/lib/documentTypes";
import { milestonePatchForDocumentExport } from "@/lib/documentMilestones";
import {
  PROJECT_DOCUMENT_SELECT,
  PROJECT_DOCUMENT_REVISION_SELECT,
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
import { generateProjectDocumentPdfBuffer } from "@/lib/documents/composePdfInput";
import { formatRiversideDateStampYmd } from "@/lib/documents/riversideTime";
import { openPdfPrintWindow } from "@/lib/print/openPrintWindow";
import {
  buildQuoteFinancialsSnapshot,
  documentKindSupportsQuoteFinancialsSnapshot,
  readQuoteFinancialsSnapshotFromMetadata,
  snapshotToProjectPatch,
} from "@/lib/quoteFinancialsSnapshot";
import { projectPatchFromSavedQuoteOrInvoice } from "@/lib/projectDocumentTotalsPolicy";
import { useProjectWorkspaceOptional } from "@/lib/projectWorkspaceContext";

function emptyMeta(): ProjectDocumentDraftMeta {
  return {
    lines: [],
    packingLines: [],
    bolRows: [],
  };
}

function finiteOrNull(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function normalizeMeta(raw: unknown): ProjectDocumentDraftMeta {
  if (!raw || typeof raw !== "object") return emptyMeta();
  const m = raw as ProjectDocumentDraftMeta;
  const base: ProjectDocumentDraftMeta = {
    ...emptyMeta(),
    ...m,
    lines: Array.isArray(m.lines) ? m.lines : [],
    packingLines: Array.isArray(m.packingLines) ? m.packingLines : [],
    bolRows: Array.isArray(m.bolRows) ? m.bolRows : [],
    quotePdfTaxRatePct: finiteOrNull(m.quotePdfTaxRatePct),
    quotePdfTaxAmount: finiteOrNull(m.quotePdfTaxAmount),
    quotePdfLogisticsAmount: finiteOrNull(m.quotePdfLogisticsAmount),
    quotePdfOtherAmount: finiteOrNull(m.quotePdfOtherAmount),
  };
  const snap = readQuoteFinancialsSnapshotFromMetadata(raw);
  if (snap) base.quoteFinancialsSnapshot = snap;
  else delete base.quoteFinancialsSnapshot;
  return base;
}

function suggestDocNumber(project: ProjectRow, kind: ProjectDocumentKind): string {
  const pn = String(project.project_number ?? "JOB").replace(/\s+/g, "");
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
  return `${prefix}-${pn}-${formatRiversideDateStampYmd(new Date())}`;
}

function createPdfBlob(buffer: ArrayBuffer | Uint8Array): Blob {
  const source = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const byteCopy = new Uint8Array(source.byteLength);
  byteCopy.set(source);
  return new Blob([byteCopy.buffer], { type: "application/pdf" });
}

export function ProjectDocumentsSection({
  projectId,
  project,
  supabase,
  onProjectRefresh,
  onApplyQuoteFinancialsSnapshot,
  canManageDocuments = true,
}: {
  projectId: string;
  project: ProjectRow;
  supabase: SupabaseClient;
  onProjectRefresh: () => void;
  onApplyQuoteFinancialsSnapshot?: (patch: Partial<ProjectRow>) => void;
  canManageDocuments?: boolean;
}) {
  const workspace = useProjectWorkspaceOptional();
  const lastWorkspaceTapeHandledRef = useRef<string | null>(null);
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportingRow, setExportingRow] = useState<ProjectDocumentRow | null>(null);
  const [exportRevisions, setExportRevisions] = useState<ProjectDocumentRevisionRow[]>([]);
  const [selectedExportRevisionIndex, setSelectedExportRevisionIndex] = useState<number | null>(
    null,
  );
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
  const [calcMarkupPct, setCalcMarkupPct] = useState<number>(
    project.material_markup_pct ?? 30,
  );
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [rowRevisionCache, setRowRevisionCache] = useState<
    Record<string, ProjectDocumentRevisionRow[]>
  >({});
  const [rowRevisionLoading, setRowRevisionLoading] = useState<Record<string, boolean>>(
    {},
  );
  const [rowRevisionError, setRowRevisionError] = useState<Record<string, string>>({});

  const defaultShipTo = useMemo(() => {
    const addrs = crm?.customer_shipping_addresses;
    if (!addrs?.length) return null;
    const def = addrs.find((a) => a.is_default);
    return def ?? addrs[0] ?? null;
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
    const cid = project.customer_id;
    if (!cid) {
      setCrm(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from("customers")
      .select(CUSTOMER_DETAIL_SELECT)
      .eq("id", cid)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setCrm(data as CustomerWithShipping);
      });
    return () => {
      cancelled = true;
    };
  }, [project.customer_id, supabase]);

  const openNew = () => {
    setEditingId(null);
    setKind("quote");
    setDocNumber(suggestDocNumber(project, "quote"));
    setVendorId("");
    setMeta(buildDefaultDocumentMetaFromProject(project));
    setSaveError(null);
    setEditorOpen(true);
  };

  const openEdit = (r: ProjectDocumentRow) => {
    setEditingId(r.id);
    setKind(r.kind);
    setDocNumber(r.number ?? suggestDocNumber(project, r.kind));
    setVendorId(r.vendor_id ?? "");
    setMeta(normalizeMeta(r.metadata));
    setSaveError(null);
    setEditorOpen(true);
  };

  const saveDraft = async () => {
    if (!canManageDocuments) {
      setSaveError("Your role does not allow editing project documents.");
      return;
    }
    setSaveError(null);
    setSaveBusy(true);
    try {
      const metaToSave: ProjectDocumentDraftMeta = { ...meta };
      if (documentKindSupportsQuoteFinancialsSnapshot(kind)) {
        metaToSave.quoteFinancialsSnapshot =
          buildQuoteFinancialsSnapshot(project);
      } else {
        delete metaToSave.quoteFinancialsSnapshot;
      }
      const payload = {
        project_id: projectId,
        kind,
        number: docNumber.trim() || null,
        metadata: metaToSave,
        vendor_id:
          kind === "rfq" || kind === "purchase_order"
            ? vendorId.trim() || null
            : null,
      };
      if (editingId) {
        const { error } = await supabase.rpc(
          "append_project_document_revision",
          {
            p_document_id: editingId,
            p_number: payload.number,
            p_metadata: payload.metadata,
            p_vendor_id: payload.vendor_id,
          },
        );
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc(
          "create_project_document_with_initial_revision",
          {
            p_project_id: payload.project_id,
            p_kind: payload.kind,
            p_number: payload.number,
            p_metadata: payload.metadata,
            p_vendor_id: payload.vendor_id,
          },
        );
        if (error) throw error;
      }

      const financialPatch = projectPatchFromSavedQuoteOrInvoice(kind, metaToSave);
      if (financialPatch && Object.keys(financialPatch).length > 0) {
        const { error: projErr } = await supabase
          .from("projects")
          .update(financialPatch)
          .eq("id", projectId);
        if (projErr) throw projErr;
        onProjectRefresh();
      }

      setEditorOpen(false);
      await loadDocs();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaveBusy(false);
    }
  };

  const syncLines = (lines: DocumentLineItem[]) =>
    setMeta((m) => ({ ...m, lines }));

  const addLine = () => {
    const nextNo =
      meta.lines.reduce((mx, l) => Math.max(mx, l.lineNo), 0) + 1;
    syncLines([
      ...meta.lines,
      {
        lineNo: nextNo,
        description: "",
        qty: 1,
        uom: "EA",
        unitPrice: 0,
        extended: 0,
      },
    ]);
  };

  const removeLine = (lineNo: number) => {
    syncLines(meta.lines.filter((l) => l.lineNo !== lineNo));
  };

  const patchLine = (lineNo: number, patch: Partial<DocumentLineItem>) => {
    syncLines(
      meta.lines.map((l) => {
        if (l.lineNo !== lineNo) return l;
        const next = { ...l, ...patch };
        if (patch.qty != null || patch.unitPrice != null) {
          next.extended = next.qty * next.unitPrice;
        }
        return next;
      }),
    );
  };

  const openCalcImport = useCallback(async (preferredTapeId?: string | null) => {
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
      (preferredTapeId &&
      tapes.some((tape) => tape.id === preferredTapeId)
        ? preferredTapeId
        : null) ?? tapes[0]?.id ?? "";
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
    const rows = (lineData ?? []) as ProjectCalcLineRow[];
    setCalcLines(rows);
    setSelectedCalcLineIds(
      rows.filter((row) => row.kind === "material").map((row) => row.id),
    );
    setCalcImportBusy(false);
  }, [project.material_markup_pct, projectId, supabase]);

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
  }, [
    openCalcImport,
    workspace,
    workspace?.focusTarget,
    workspace?.focusedDocKind,
    workspace?.lastSavedTapeId,
  ]);

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
      const rows = (data ?? []) as ProjectCalcLineRow[];
      setCalcLines(rows);
      setSelectedCalcLineIds(
        rows.filter((row) => row.kind === "material").map((row) => row.id),
      );
      setCalcImportBusy(false);
    },
    [supabase],
  );

  const calcImportPreview = useMemo(() => {
    const selected = calcLines.filter((row) => selectedCalcLineIds.includes(row.id));
    return buildDocumentLinesFromCalc({
      selectedRows: selected,
      strategy: calcStrategy,
      project,
      markupPct: calcMarkupPct,
    });
  }, [calcLines, calcMarkupPct, calcStrategy, project, selectedCalcLineIds]);

  const applyCalcImport = useCallback(() => {
    if (calcImportPreview.length === 0) return;
    const start = meta.lines.reduce((mx, line) => Math.max(mx, line.lineNo), 0);
    const renumbered = calcImportPreview.map((line, index) => ({
      ...line,
      lineNo: start + index + 1,
    }));
    syncLines([...meta.lines, ...renumbered]);
    setCalcImportOpen(false);
  }, [calcImportPreview, meta.lines]);

  const runExport = async () => {
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
        (exportingRow.kind === "rfq" ||
          exportingRow.kind === "purchase_order") &&
        selectedRevision.vendorId
          ? (vendors.find((v) => v.id === selectedRevision.vendorId) ?? null)
          : null;
      const issuedDate = new Date();
      const revisionIndex = normalizeRevisionIndex(selectedRevision.revisionIndex);
      const buffer = generateProjectDocumentPdfBuffer({
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
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        const { error: exportErr } = await supabase.rpc(
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
        if (exportErr) throw exportErr;
      } else {
        const file = new File([createPdfBlob(buffer)], filename, {
          type: "application/pdf",
        });
        const uploadForm = new FormData();
        uploadForm.set("file", file);
        uploadForm.set("filename", filename);
        uploadForm.set("revisionIndex", String(revisionIndex));
        const uploadRes = await fetch(
          `/api/projects/${projectId}/documents/export-onedrive`,
          {
            method: "POST",
            body: uploadForm,
          },
        );
        const uploadPayload = (await uploadRes.json().catch(() => ({}))) as {
          path?: string;
          error?: string;
        };
        if (!uploadRes.ok || !uploadPayload.path) {
          throw new Error(uploadPayload.error ?? "OneDrive export failed.");
        }
        const path = uploadPayload.path;
        const { error: exportErr } = await supabase.rpc(
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
        if (exportErr) throw exportErr;
        if (workspace) {
          workspace.requestFilesSync(filename);
          workspace.focus("files");
        }
      }

      if (updateMilestones) {
        const patch = milestonePatchForDocumentExport(
          project,
          exportingRow.kind,
        );
        if (Object.keys(patch).length > 0) {
          await supabase.from("projects").update(patch).eq("id", projectId);
          onProjectRefresh();
        }
      }

      setExportOpen(false);
      setExportingRow(null);
      setUpdateMilestones(false);
      await loadDocs();
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExportBusy(false);
    }
  };

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

  const openExportFor = async (
    r: ProjectDocumentRow,
    preferredRevisionIndex?: number,
  ) => {
    setExportingRow(r);
    const defaultRevision = normalizeRevisionIndex(r.current_revision_index);
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
    const revisions = await loadRevisionHistoryForRow(r.id);
    setExportRevisions(revisions);
    if (revisions.length === 0) {
      setExportError((prev) => prev || "No revisions found for this document.");
    }
    setExportRevisionsLoading(false);
  };

  const openPdfBuffer = (buffer: ArrayBuffer | Uint8Array, shouldPrint = false) => {
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
  };

  const quickPreview = async (r: ProjectDocumentRow, shouldPrint = false) => {
    try {
      const logo = await fetchLogoDataUrl(r.kind);
      const buffer = generateProjectDocumentPdfBuffer({
        kind: r.kind,
        documentNumber: r.number ?? suggestDocNumber(project, r.kind),
        issuedDate: new Date(),
        logoDataUrl: logo,
        project,
        meta: normalizeMeta(r.metadata),
        vendor:
          r.vendor_id && (r.kind === "rfq" || r.kind === "purchase_order")
            ? vendors.find((v) => v.id === r.vendor_id) ?? null
            : null,
        customer: crm,
        defaultShipTo,
        revisionIndex: normalizeRevisionIndex(r.current_revision_index),
      });
      openPdfBuffer(buffer, shouldPrint);
    } catch {
      /* ignore */
    }
  };

  const previewSelectedRevision = async () => {
    if (!exportingRow) return;
    try {
      const selectedRevision = pickRevisionForExport(
        exportingRow,
        exportRevisions,
        selectedExportRevisionIndex,
      );
      const logo = await fetchLogoDataUrl(exportingRow.kind);
      const vendorForRow =
        (exportingRow.kind === "rfq" ||
          exportingRow.kind === "purchase_order") &&
        selectedRevision.vendorId
          ? (vendors.find((v) => v.id === selectedRevision.vendorId) ?? null)
          : null;
      const buffer = generateProjectDocumentPdfBuffer({
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
      /* ignore */
    }
  };

  const printSelectedRevision = async () => {
    if (!exportingRow) return;
    try {
      const selectedRevision = pickRevisionForExport(
        exportingRow,
        exportRevisions,
        selectedExportRevisionIndex,
      );
      const logo = await fetchLogoDataUrl(exportingRow.kind);
      const vendorForRow =
        (exportingRow.kind === "rfq" ||
          exportingRow.kind === "purchase_order") &&
        selectedRevision.vendorId
          ? (vendors.find((v) => v.id === selectedRevision.vendorId) ?? null)
          : null;
      const buffer = generateProjectDocumentPdfBuffer({
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
      /* ignore */
    }
  };

  const previewRevisionFromHistory = async (
    row: ProjectDocumentRow,
    revision: ProjectDocumentRevisionRow,
    shouldPrint = false,
  ) => {
    try {
      const logo = await fetchLogoDataUrl(row.kind);
      const picked = pickRevisionForExport(row, [revision], revision.revision_index);
      const vendorForRow =
        (row.kind === "rfq" || row.kind === "purchase_order") && picked.vendorId
          ? (vendors.find((v) => v.id === picked.vendorId) ?? null)
          : null;
      const buffer = generateProjectDocumentPdfBuffer({
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
      /* ignore */
    }
  };

  const toggleHistoryForRow = async (row: ProjectDocumentRow) => {
    if (expandedHistoryId === row.id) {
      setExpandedHistoryId(null);
      return;
    }
    setExpandedHistoryId(row.id);
    await loadRevisionHistoryForRow(row.id);
  };

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Project documents</h2>
          <p className="mt-1 text-sm text-zinc-500">
            RFQs, quotes, POs, packing lists, BOLs, and invoices — export to PDF
            or your job&apos;s OneDrive `_DOCS` folder.
          </p>
        </div>
        <Button
          type="button"
          onClick={openNew}
          disabled={!canManageDocuments}
          className="gap-2 self-start sm:self-auto"
        >
          <Plus className="size-4" />
          New document
        </Button>
      </div>

      {loading ? (
        <p className="text-zinc-500">Loading documents…</p>
      ) : rows.length === 0 ? (
        <p className="text-zinc-500">No documents yet. Create one to get started.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const currentRevision = normalizeRevisionIndex(
              r.current_revision_index,
            );
            return (
            <li
              key={r.id}
              className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 size-5 shrink-0 text-sky-400" aria-hidden />
                <div>
                  <p className="font-medium text-white">
                    {DOCUMENT_KIND_LABEL[r.kind]}
                  </p>
                  <p className="font-mono text-sm text-zinc-400">
                    {r.number ?? "—"} · REV. {currentRevision}{" "}
                    {formatRevisionSuffix(currentRevision)}
                    {r.pdf_path ? (
                      <span className="ml-2 text-emerald-500/90">· file saved</span>
                    ) : null}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {documentKindSupportsQuoteFinancialsSnapshot(r.kind) &&
                readQuoteFinancialsSnapshotFromMetadata(r.metadata) &&
                onApplyQuoteFinancialsSnapshot ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    title="Restore Project financials from values stored when this document was saved. Save the project to persist."
                    onClick={() => {
                      const snap = readQuoteFinancialsSnapshotFromMetadata(
                        r.metadata,
                      );
                      if (!snap) return;
                      onApplyQuoteFinancialsSnapshot(
                        snapshotToProjectPatch(snap),
                      );
                    }}
                  >
                    <CornerDownLeft className="size-4" />
                    Use as reference
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => void quickPreview(r)}
                >
                  <Eye className="size-4" />
                  Preview
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => void quickPreview(r, true)}
                >
                  <Printer className="size-4" />
                  Print
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!canManageDocuments}
                  onClick={() => openEdit(r)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => void toggleHistoryForRow(r)}
                >
                  <History className="size-4" />
                  {expandedHistoryId === r.id ? "Hide history" : "Show history"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="gap-1"
                  disabled={!canManageDocuments}
                  onClick={() => void openExportFor(r)}
                >
                  <HardDriveDownload className="size-4" />
                  Export
                </Button>
              </div>
              {expandedHistoryId === r.id ? (
                <div className="mt-3 w-full rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                  <p className="text-xs font-medium uppercase text-zinc-500">
                    Revision history
                  </p>
                  {rowRevisionLoading[r.id] ? (
                    <p className="mt-2 text-sm text-zinc-400">Loading revisions…</p>
                  ) : rowRevisionError[r.id] ? (
                    <p className="mt-2 text-sm text-red-400">{rowRevisionError[r.id]}</p>
                  ) : (rowRevisionCache[r.id] ?? []).length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-400">No revisions found.</p>
                  ) : (
                    <div className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">
                      {[...(rowRevisionCache[r.id] ?? [])]
                        .sort((a, b) => {
                          const rank = (rev: ProjectDocumentRevisionRow): number => {
                            if (rev.revision_index === currentRevision) return 0;
                            if (rev.state === "exported") return 1;
                            return 2;
                          };
                          const rankDiff = rank(a) - rank(b);
                          if (rankDiff !== 0) return rankDiff;
                          return b.revision_index - a.revision_index;
                        })
                        .map((rev) => (
                        <div
                          key={rev.id}
                          className={`flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between ${
                            rev.revision_index === currentRevision
                              ? "border-sky-500/70 bg-sky-950/20"
                              : "border-zinc-800 bg-zinc-950/60"
                          }`}
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-mono text-sm text-zinc-200">
                                {buildRevisionHistoryLabel(rev)}
                              </p>
                              {rev.revision_index === currentRevision ? (
                                <span className="rounded-full border border-sky-500/60 bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-sky-300 uppercase">
                                  Active
                                </span>
                              ) : null}
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
                                  rev.state === "exported"
                                    ? "border border-emerald-500/60 bg-emerald-500/15 text-emerald-300"
                                    : "border border-amber-500/60 bg-amber-500/15 text-amber-300"
                                }`}
                              >
                                {rev.state}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-500">
                              {rev.number_snapshot ?? "—"}{" "}
                              {rev.filename ? `· ${rev.filename}` : ""}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void previewRevisionFromHistory(r, rev)}
                            >
                              Preview
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              onClick={() => void previewRevisionFromHistory(r, rev, true)}
                            >
                              <Printer className="size-4" />
                              Print
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void openExportFor(r, rev.revision_index)}
                            >
                              Export REV {rev.revision_index}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </li>
            );
          })}
        </ul>
      )}

      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
          <div className="my-8 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">
              {editingId ? "Edit document" : "New document"}
            </h3>

            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase text-zinc-500">
                Document type
              </p>
              <div className="flex flex-wrap gap-2">
                {PROJECT_DOCUMENT_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setKind(k);
                      setDocNumber(suggestDocNumber(project, k));
                    }}
                    className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                      kind === k
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                  >
                    {DOCUMENT_KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>

            {(kind === "rfq" || kind === "purchase_order") ? (
              <div className="mt-4">
                <label className="mb-1 block text-xs text-zinc-500">Vendor</label>
                <select
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white"
                >
                  <option value="">— Select —</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.legal_name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="mt-4">
              <label className="mb-1 block text-xs text-zinc-500">Document #</label>
              <input
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 font-mono text-white"
              />
            </div>

            {kind === "quote" ? (
              <div className="mt-4 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <p className="text-xs font-medium uppercase text-zinc-500">
                  Quote PDF fields
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">
                      Quote description
                    </label>
                    <input
                      value={meta.quoteDescription ?? ""}
                      onChange={(e) =>
                        setMeta((m) => ({
                          ...m,
                          quoteDescription: e.target.value || undefined,
                        }))
                      }
                      placeholder={(project.project_name ?? "").toUpperCase() || "Project name"}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">
                      Shipping method
                    </label>
                    <input
                      value={meta.shippingMethod ?? ""}
                      onChange={(e) =>
                        setMeta((m) => ({
                          ...m,
                          shippingMethod: e.target.value || undefined,
                        }))
                      }
                      placeholder="e.g. prepaid, FOB, will call"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">
                      Payment terms
                    </label>
                    <input
                      value={meta.paymentTerms ?? ""}
                      onChange={(e) =>
                        setMeta((m) => ({
                          ...m,
                          paymentTerms: e.target.value || undefined,
                        }))
                      }
                      placeholder={crm?.payment_terms ?? "e.g. Net 30"}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">
                      Lead time (following P.O.)
                    </label>
                    <input
                      value={meta.leadTime ?? ""}
                      onChange={(e) =>
                        setMeta((m) => ({
                          ...m,
                          leadTime: e.target.value || undefined,
                        }))
                      }
                      placeholder="e.g. 1–2 weeks"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">
                      Customer contact (override)
                    </label>
                    <input
                      value={meta.customerContactDisplay ?? ""}
                      onChange={(e) =>
                        setMeta((m) => ({
                          ...m,
                          customerContactDisplay: e.target.value || undefined,
                        }))
                      }
                      placeholder={
                        [crm?.contact_name, crm?.contact_phone]
                          .filter(Boolean)
                          .join(" · ") || "From CRM if blank"
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">
                      Account manager
                    </label>
                    <input
                      value={meta.accountManagerDisplay ?? ""}
                      onChange={(e) =>
                        setMeta((m) => ({
                          ...m,
                          accountManagerDisplay: e.target.value || undefined,
                        }))
                      }
                      placeholder="Name (phone) — or set NEXT_PUBLIC_QUOTE_ACCOUNT_MANAGER"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">
                      Tax rate %
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={
                        meta.quotePdfTaxRatePct == null ? "" : meta.quotePdfTaxRatePct
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        setMeta((m) => ({
                          ...m,
                          quotePdfTaxRatePct:
                            v === "" ? null : parseFloat(v),
                        }));
                      }}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">
                      Tax $
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={
                        meta.quotePdfTaxAmount == null ? "" : meta.quotePdfTaxAmount
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        setMeta((m) => ({
                          ...m,
                          quotePdfTaxAmount:
                            v === "" ? null : parseFloat(v),
                        }));
                      }}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">
                      Logistics $
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={
                        meta.quotePdfLogisticsAmount == null
                          ? ""
                          : meta.quotePdfLogisticsAmount
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        setMeta((m) => ({
                          ...m,
                          quotePdfLogisticsAmount:
                            v === "" ? null : parseFloat(v),
                        }));
                      }}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">
                      Other $
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={
                        meta.quotePdfOtherAmount == null
                          ? ""
                          : meta.quotePdfOtherAmount
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        setMeta((m) => ({
                          ...m,
                          quotePdfOtherAmount:
                            v === "" ? null : parseFloat(v),
                        }));
                      }}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-6">
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-medium uppercase text-zinc-500">
                  Line items
                </p>
                <div className="flex flex-wrap gap-2">
                  {kind === "quote" || kind === "invoice" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setMeta(buildDefaultDocumentMetaFromProject(project))
                      }
                    >
                      Sync from project totals
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void openCalcImport()}
                  >
                    Import from Calc
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={addLine}>
                    Add line
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                {meta.lines.map((line) => (
                  <div
                    key={line.lineNo}
                    className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 sm:grid-cols-12"
                  >
                    <input
                      className="sm:col-span-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white"
                      value={line.lineNo}
                      readOnly
                      title="Line #"
                    />
                    {kind === "quote" ? (
                      <input
                        className="sm:col-span-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white"
                        value={line.partRef ?? ""}
                        onChange={(e) =>
                          patchLine(line.lineNo, {
                            partRef: e.target.value.trim()
                              ? e.target.value.trim()
                              : undefined,
                          })
                        }
                        placeholder="Item #"
                      />
                    ) : null}
                    <input
                      className={`rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white ${
                        kind === "quote" ? "sm:col-span-3" : "sm:col-span-5"
                      }`}
                      value={line.description}
                      onChange={(e) =>
                        patchLine(line.lineNo, { description: e.target.value })
                      }
                      placeholder="Description"
                    />
                    <input
                      className="sm:col-span-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white"
                      type="number"
                      value={line.qty}
                      onChange={(e) =>
                        patchLine(line.lineNo, {
                          qty: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                    <input
                      className="sm:col-span-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white"
                      value={line.uom}
                      onChange={(e) =>
                        patchLine(line.lineNo, { uom: e.target.value })
                      }
                    />
                    <input
                      className="sm:col-span-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white"
                      type="number"
                      value={line.unitPrice}
                      onChange={(e) =>
                        patchLine(line.lineNo, {
                          unitPrice: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                    <div className="sm:col-span-1 flex items-center justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeLine(line.lineNo)}
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs text-zinc-500">Notes (footer)</label>
              <textarea
                value={meta.notes ?? ""}
                onChange={(e) =>
                  setMeta((m) => ({ ...m, notes: e.target.value }))
                }
                rows={3}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white"
              />
            </div>

            {saveError ? (
              <p className="mt-3 text-sm text-red-400" role="alert">
                {saveError}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => void saveDraft()}
                disabled={saveBusy || !canManageDocuments}
              >
                {saveBusy ? "Saving…" : "Save draft"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditorOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {calcImportOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">Import from project calc</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Tape</label>
                <select
                  value={selectedCalcTapeId}
                  onChange={(e) => void loadCalcTapeLines(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                >
                  <option value="">Select tape</option>
                  {calcTapes.map((tape) => (
                    <option key={tape.id} value={tape.id}>
                      {tape.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Strategy</label>
                <select
                  value={calcStrategy}
                  onChange={(e) => setCalcStrategy(e.target.value as ImportStrategy)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                >
                  <option value="oneToOne">One line per calc line</option>
                  <option value="collapseLumpSum">Collapse into one line</option>
                  <option value="costPlusMarkup">Cost + markup</option>
                </select>
              </div>
            </div>

            {calcStrategy === "costPlusMarkup" ? (
              <div className="mt-3">
                <label className="mb-1 block text-xs text-zinc-500">Markup %</label>
                <input
                  type="number"
                  value={calcMarkupPct}
                  onChange={(e) => setCalcMarkupPct(parseFloat(e.target.value) || 0)}
                  className="w-full max-w-[12rem] rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                />
              </div>
            ) : null}

            <div className="mt-4 max-h-52 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              {calcImportBusy ? (
                <p className="text-sm text-zinc-400">Loading calc lines…</p>
              ) : calcLines.length === 0 ? (
                <p className="text-sm text-zinc-400">No calc lines on this tape.</p>
              ) : (
                <div className="space-y-2">
                  {calcLines.map((row) => {
                    const checked = selectedCalcLineIds.includes(row.id);
                    const disabled = row.kind !== "material";
                    return (
                      <label key={row.id} className="flex items-start gap-2 text-sm text-zinc-200">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={(e) => {
                            if (disabled) return;
                            if (e.target.checked) {
                              setSelectedCalcLineIds((prev) => [...prev, row.id]);
                            } else {
                              setSelectedCalcLineIds((prev) =>
                                prev.filter((id) => id !== row.id),
                              );
                            }
                          }}
                          className="mt-0.5 size-4 rounded border-zinc-600"
                        />
                        <span>
                          {row.description || "(no description)"}{" "}
                          <span className="text-zinc-500">
                            ({row.kind === "material" ? "material" : "math"})
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase text-zinc-500">Preview</p>
              <div className="max-h-52 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                {calcImportPreview.length === 0 ? (
                  <p className="text-sm text-zinc-400">No rows selected.</p>
                ) : (
                  <div className="space-y-2">
                    {calcImportPreview.map((line, index) => (
                      <div key={`${line.description}-${index}`} className="text-sm text-zinc-200">
                        {line.description} · {line.qty} {line.uom} · ${line.unitPrice.toFixed(2)} ={" "}
                        <span className="font-mono">${line.extended.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <Button type="button" variant="outline" onClick={() => setCalcImportOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={applyCalcImport}
                disabled={calcImportPreview.length === 0}
              >
                Import
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {exportOpen && exportingRow ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">Export PDF</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Job{" "}
              <span className="font-mono text-zinc-200">
                {project.project_number}
              </span>{" "}
              — {DOCUMENT_KIND_LABEL[exportingRow.kind]}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-1">
              <button
                type="button"
                onClick={() => setExportMethod("download")}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${
                  exportMethod === "download"
                    ? "bg-blue-600 text-white"
                    : "text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                <HardDriveDownload className="size-4" />
                Download
              </button>
              <button
                type="button"
                onClick={() => setExportMethod("onedrive")}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${
                  exportMethod === "onedrive"
                    ? "bg-blue-600 text-white"
                    : "text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                <CloudUpload className="size-4" />
                OneDrive
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <p className="text-xs font-medium uppercase text-zinc-500">
                Revision history
              </p>
              {exportRevisionsLoading ? (
                <p className="mt-2 text-sm text-zinc-400">Loading revisions…</p>
              ) : exportRevisions.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-400">
                  No saved revisions found. Export uses current draft.
                </p>
              ) : (
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
                  {exportRevisions.map((rev) => (
                    <label
                      key={rev.id}
                      className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-700"
                    >
                      <span className="pr-3">{buildRevisionHistoryLabel(rev)}</span>
                      <input
                        type="radio"
                        name="export-revision"
                        checked={selectedExportRevisionIndex === rev.revision_index}
                        onChange={() => setSelectedExportRevisionIndex(rev.revision_index)}
                        className="size-4 rounded border-zinc-600"
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300 select-none">
                <input
                  type="checkbox"
                  checked={updateMilestones}
                  onChange={(e) => setUpdateMilestones(e.target.checked)}
                  className="size-4 rounded border-zinc-600"
                />
                Update job milestones
              </label>
              <HelpPopoverButton
                detail="Milestones updated by document type: quote -> quote sent, RFQ -> vendors, vendor PO -> materials ordered, invoice -> invoiced, BOL -> delivered."
                align="right"
              />
            </div>

            {exportError ? (
              <p className="mt-3 text-sm text-red-400">{exportError}</p>
            ) : null}

            <div className="mt-6 flex gap-3">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => void previewSelectedRevision()}
              >
                Preview selected REV
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="flex-1 gap-1"
                onClick={() => void printSelectedRevision()}
              >
                <Printer className="size-4" />
                Print selected REV
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setExportOpen(false);
                  setExportingRow(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={exportBusy}
                onClick={() => void runExport()}
              >
                {exportBusy ? "Working…" : exportMethod === "download" ? "Download" : "Upload"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
