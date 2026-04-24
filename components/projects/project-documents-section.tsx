"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BriefcaseBusiness, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CalcImportDialog } from "@/components/projects/documents/calc-import-dialog";
import { DocumentWorkspace } from "@/components/projects/documents/document-workspace";
import { DocumentExportModal } from "@/components/projects/documents/document-export-modal";
import { DocumentsList } from "@/components/projects/documents/documents-list";
import {
  JobPacketBuilder,
  type JobPacketSelectedFile,
} from "@/components/projects/documents/job-packet-builder";
import { DOCUMENT_KIND_LABEL } from "@/lib/documentTypes";
import {
  buildJobPacketFilename,
  buildJobPacketPdf,
} from "@/lib/documents/buildJobPacket";
import { fetchLogoDataUrl, normalizeRevisionIndex } from "@/lib/documents/buildProjectDocumentPdf";
import type { ProjectDocumentRow } from "@/lib/projectDocumentDb";
import type { ProjectRow } from "@/lib/projectTypes";
import {
  readQuoteFinancialsSnapshotFromMetadata,
  snapshotToProjectPatch,
} from "@/lib/quoteFinancialsSnapshot";
import { useProjectDocuments } from "@/hooks/useProjectDocuments";
import { useLivePreview } from "@/hooks/useLivePreview";
import { generateProjectDocumentPdfBuffer } from "@/lib/documents/composePdfInput";

async function buildPacketDocumentSection(
  row: ProjectDocumentRow,
  project: ProjectRow,
  documents: ReturnType<typeof useProjectDocuments>,
) {
  const logoDataUrl = await fetchLogoDataUrl(row.kind);
  const vendor =
    (row.kind === "rfq" || row.kind === "purchase_order") && row.vendor_id
      ? documents.vendors.find((candidate) => candidate.id === row.vendor_id) ?? null
      : null;
  const bytes = await generateProjectDocumentPdfBuffer({
    kind: row.kind,
    documentNumber: row.number ?? "DRAFT",
    issuedDate: new Date(),
    logoDataUrl,
    project,
    meta: row.metadata,
    vendor,
    customer: documents.crm,
    defaultShipTo: documents.defaultShipTo,
    revisionIndex: normalizeRevisionIndex(row.current_revision_index),
  });
  return {
    id: `document-${row.id}`,
    title: `${DOCUMENT_KIND_LABEL[row.kind]} · ${row.number ?? "DRAFT"}`,
    filename: `${row.number ?? row.kind}.pdf`,
    source: "document" as const,
    pdfBytes: bytes,
  };
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
  const documents = useProjectDocuments({
    projectId,
    project,
    supabase,
    onProjectRefresh,
    canManageDocuments,
  });
  const activeRow =
    documents.editingId == null
      ? null
      : documents.rows.find((row) => row.id === documents.editingId) ?? null;
  const workspaceVendor =
    (documents.kind === "rfq" || documents.kind === "purchase_order") && documents.vendorId
      ? documents.vendors.find((vendor) => vendor.id === documents.vendorId) ?? null
      : null;
  const livePreview = useLivePreview({
    enabled: documents.editorOpen,
    kind: documents.kind,
    documentNumber: documents.docNumber.trim() || "DRAFT",
    project,
    meta: documents.meta,
    vendor: workspaceVendor,
    customer: documents.crm,
    defaultShipTo: documents.defaultShipTo,
    revisionIndex: activeRow?.current_revision_index ?? 0,
  });
  const [focusedLineNo, setFocusedLineNo] = useState<number | null>(null);
  const [jobPacketOpen, setJobPacketOpen] = useState(false);
  const [jobPacketBusy, setJobPacketBusy] = useState(false);
  const [jobPacketError, setJobPacketError] = useState<string | null>(null);

  const activeFocusedLineNo = documents.editorOpen ? focusedLineNo : null;
  const canBuildPacket = canManageDocuments && (documents.rows.length > 0 || project.files_phase1_enabled);
  const workspaceWarnings: string[] = [];
  const documentSubtotal = documents.meta.lines.reduce((sum, line) => sum + (line.extended || 0), 0);
  if (
    (documents.kind === "quote" || documents.kind === "rfq" || documents.kind === "purchase_order") &&
    !documents.meta.leadTime?.trim()
  ) {
    workspaceWarnings.push("Lead time is missing.");
  }
  if (
    (documents.kind === "quote" || documents.kind === "rfq" || documents.kind === "purchase_order") &&
    !documents.meta.shippingMethod?.trim() &&
    !documents.meta.freightTerms?.trim()
  ) {
    workspaceWarnings.push("Shipping method is missing.");
  }
  if (
    (documents.kind === "quote" || documents.kind === "rfq" || documents.kind === "purchase_order") &&
    !documents.meta.customerContactDisplay?.trim() &&
    !documents.crm?.contact_name
  ) {
    workspaceWarnings.push("Customer contact is missing.");
  }
  if (
    typeof project.total_quoted === "number" &&
    Number.isFinite(project.total_quoted) &&
    project.total_quoted > 0 &&
    documentSubtotal > project.total_quoted
  ) {
    workspaceWarnings.push("Document subtotal exceeds project quoted amount.");
  }

  const buildJobPacket = async (
    selectedDocumentIds: string[],
    selectedFiles: JobPacketSelectedFile[],
  ) => {
    setJobPacketBusy(true);
    setJobPacketError(null);
    try {
      const selectedRows = documents.rows.filter((row) => selectedDocumentIds.includes(row.id));
      const sections = [];
      for (const row of selectedRows) {
        sections.push(await buildPacketDocumentSection(row, project, documents));
      }

      for (const file of selectedFiles) {
        const previewResponse = await fetch(`/api/projects/${projectId}/files/${file.id}/preview`, {
          cache: "no-store",
        });
        const previewPayload = (await previewResponse.json().catch(() => ({}))) as {
          url?: string;
          error?: string;
        };
        if (!previewResponse.ok || !previewPayload.url) {
          throw new Error(previewPayload.error ?? `Could not load ${file.name}.`);
        }
        const fileResponse = await fetch(previewPayload.url, { cache: "no-store" });
        if (!fileResponse.ok) {
          throw new Error(`Could not download ${file.name}.`);
        }
        const fileBytes = await fileResponse.arrayBuffer();
        sections.push({
          id: `file-${file.id}`,
          title: file.name,
          filename: file.name,
          source: "file" as const,
          pdfBytes: fileBytes,
        });
      }

      if (sections.length === 0) {
        throw new Error("Select at least one document or PDF file.");
      }

      const merged = await buildJobPacketPdf({
        projectNumber: String(project.project_number ?? "JOB"),
        projectName: project.project_name ?? "Project",
        generatedAt: new Date(),
        sections,
      });

      const filename = buildJobPacketFilename(
        String(project.project_number ?? "JOB"),
        project.project_name ?? "Project",
        new Date(),
      );
      const mergedBuffer = merged.buffer.slice(
        merged.byteOffset,
        merged.byteOffset + merged.byteLength,
      ) as ArrayBuffer;
      const blob = new Blob([mergedBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setJobPacketOpen(false);
    } catch (error: unknown) {
      setJobPacketError(error instanceof Error ? error.message : "Could not build job packet.");
    } finally {
      setJobPacketBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Project documents</h2>
          <p className="mt-1 text-sm text-zinc-500">
            RFQs, quotes, POs, packing lists, BOLs, and invoices — export to PDF or your
            job&apos;s OneDrive `_DOCS` folder.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <Button
            type="button"
            variant="outline"
            disabled={!canBuildPacket}
            className="gap-2"
            onClick={() => {
              setJobPacketError(null);
              setJobPacketOpen(true);
            }}
          >
            <BriefcaseBusiness className="size-4" />
            Build Job Packet
          </Button>
          <Button type="button" onClick={documents.openNew} disabled={!canManageDocuments} className="gap-2">
            <Plus className="size-4" />
            New document
          </Button>
        </div>
      </div>

      <DocumentsList
        rows={documents.rows}
        loading={documents.loading}
        canManageDocuments={canManageDocuments}
        expandedHistoryId={documents.expandedHistoryId}
        rowRevisionCache={documents.rowRevisionCache}
        rowRevisionLoading={documents.rowRevisionLoading}
        rowRevisionError={documents.rowRevisionError}
        onEdit={documents.openEdit}
        onQuickPreview={documents.quickPreview}
        onToggleHistory={documents.toggleHistoryForRow}
        onOpenExport={documents.openExportFor}
        onPreviewRevisionFromHistory={documents.previewRevisionFromHistory}
        onApplySnapshotReference={
          onApplyQuoteFinancialsSnapshot
            ? (row) => {
                const snap = readQuoteFinancialsSnapshotFromMetadata(row.metadata);
                if (!snap || !onApplyQuoteFinancialsSnapshot) return;
                onApplyQuoteFinancialsSnapshot(snapshotToProjectPatch(snap));
              }
            : undefined
        }
      />

      {documents.editorOpen ? (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
          <div className="mx-auto flex h-full w-full max-w-[2340px] items-center justify-center p-4 sm:p-6">
            <div className="flex h-full max-h-[95vh] w-full flex-col rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl sm:p-5">
              <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-2">
                <p className="text-sm text-zinc-300">
                  Workspace editor ·{" "}
                  <span className="font-medium text-zinc-100">{DOCUMENT_KIND_LABEL[documents.kind]}</span>
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={documents.saveBusy || !canManageDocuments}
                    onClick={() => void documents.saveDraft()}
                  >
                    {documents.saveBusy ? "Saving…" : "Save draft"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={documents.closeEditor}>
                    Close
                  </Button>
                </div>
              </div>
              {workspaceWarnings.length > 0 ? (
                <div className="mt-3 rounded-xl border border-amber-500/50 bg-amber-950/20 px-4 py-3 text-xs text-amber-200">
                  {workspaceWarnings.join(" ")}
                </div>
              ) : null}
              <div className="mt-3 min-h-0 flex-1">
                <DocumentWorkspace
                  projectId={projectId}
                  metadata={{
                    documentTitle:
                      documents.meta.workspaceDocumentTitle?.trim() || DOCUMENT_KIND_LABEL[documents.kind],
                    documentNumber: documents.docNumber,
                    customerName:
                      documents.meta.workspaceCustomerName?.trim() || project.customer || "",
                    projectName:
                      documents.meta.workspaceProjectName?.trim() || project.project_name || "",
                    notes: documents.meta.notes ?? "",
                  }}
                  kind={documents.kind}
                  lineItems={documents.meta.lines}
                  optionGroups={documents.meta.optionGroups ?? []}
                  collapsedOptionGroupIds={documents.collapsedOptionGroupIds}
                  quotePresentAsMultipleOptions={Boolean(documents.meta.quotePresentAsMultipleOptions)}
                  linkedCalcLinesCount={documents.linkedCalcLinesCount}
                  dirtyLinkedCalcLinesCount={documents.dirtyLinkedCalcLinesCount}
                  calcSyncConflictCalcLineIds={documents.calcSyncConflictCalcLineIds}
                  calcSyncConflicts={documents.calcSyncConflicts}
                  calcSyncConflictsCount={documents.calcSyncConflicts.length}
                  calcSyncBusy={documents.calcSyncBusy}
                  calcSyncError={documents.calcSyncError}
                  calcSyncMessage={documents.calcSyncMessage}
                  draftWatermark={documents.showPreview}
                  zoomPercent={documents.previewZoom}
                  focusedLineNo={activeFocusedLineNo}
                  previewPdfBlob={livePreview.blob}
                  previewLoading={livePreview.loading}
                  previewError={livePreview.error}
                  canEdit={canManageDocuments}
                  onPatchMetadata={(patch) => {
                    if (patch.documentNumber !== undefined) {
                      documents.setDocNumber(patch.documentNumber);
                    }
                    if (patch.documentTitle !== undefined) {
                      documents.setMeta((prev) => ({
                        ...prev,
                        workspaceDocumentTitle: patch.documentTitle,
                      }));
                    }
                    if (patch.customerName !== undefined) {
                      documents.setMeta((prev) => ({
                        ...prev,
                        workspaceCustomerName: patch.customerName,
                      }));
                    }
                    if (patch.projectName !== undefined) {
                      documents.setMeta((prev) => ({
                        ...prev,
                        workspaceProjectName: patch.projectName,
                      }));
                    }
                    if (patch.notes !== undefined) {
                      documents.setMeta((prev) => ({ ...prev, notes: patch.notes }));
                    }
                  }}
                  onAddLineItem={documents.addLine}
                  onAddOptionGroup={documents.addOptionGroup}
                  onAddSubLineItem={documents.addSubLine}
                  onMoveLineItemUp={documents.moveLineUp}
                  onMoveLineItemDown={documents.moveLineDown}
                  onSetOptionGroupCollapsed={documents.setOptionGroupCollapsed}
                  onSetQuoteMultipleOptionsPresentation={documents.setQuoteMultipleOptionsPresentation}
                  onRefreshLinkedCalcLines={() => void documents.refreshLinkedCalcLines()}
                  onPushLinkedCalcChanges={() => void documents.pushLinkedCalcChanges()}
                  onResolveCalcSyncConflictsUsingDocument={() =>
                    void documents.resolveCalcSyncConflictsUsingDocument()
                  }
                  onResolveCalcSyncConflictsUsingCalc={() => void documents.resolveCalcSyncConflictsUsingCalc()}
                  onRenameOptionGroup={documents.renameOptionGroup}
                  onRemoveOptionGroup={documents.removeOptionGroup}
                  onAssignLineOptionGroup={documents.assignLineOptionGroup}
                  onReorderLineItem={documents.reorderLine}
                  onMoveLineItemAcrossSections={documents.moveLineAcrossSections}
                  onRemoveLineItem={documents.removeLine}
                  onPatchLineItem={documents.patchLine}
                  onFocusedLineChange={setFocusedLineNo}
                  onDraftWatermarkChange={documents.setShowPreview}
                  onZoomPercentChange={documents.setPreviewZoom}
                  onIndentLineItem={documents.indentLine}
                  onOutdentLineItem={documents.outdentLine}
                  onUndoLineStructureChange={documents.undoLineStructureChange}
                  canUndoLineStructureChange={documents.canUndoLineStructureChange}
                  onSave={() => void documents.saveDraft()}
                  onClose={documents.closeEditor}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <CalcImportDialog
        open={documents.calcImportOpen}
        busy={documents.calcImportBusy}
        tapes={documents.calcTapes}
        selectedTapeId={documents.selectedCalcTapeId}
        strategy={documents.calcStrategy}
        markupPct={documents.calcMarkupPct}
        lines={documents.calcLines}
        selectedLineIds={documents.selectedCalcLineIds}
        preview={documents.calcImportPreview}
        onClose={() => documents.setCalcImportOpen(false)}
        onTapeChange={documents.loadCalcTapeLines}
        onStrategyChange={documents.setCalcStrategy}
        onMarkupChange={documents.setCalcMarkupPct}
        onToggleLine={documents.toggleCalcLineSelection}
        onImport={documents.applyCalcImport}
      />

      <DocumentExportModal
        open={documents.exportOpen}
        project={project}
        exportingRow={documents.exportingRow}
        exportMethod={documents.exportMethod}
        exportRevisions={documents.exportRevisions}
        selectedExportRevisionIndex={documents.selectedExportRevisionIndex}
        exportRevisionsLoading={documents.exportRevisionsLoading}
        updateMilestones={documents.updateMilestones}
        exportError={documents.exportError}
        exportBusy={documents.exportBusy}
        onSetExportMethod={documents.setExportMethod}
        onSetSelectedExportRevisionIndex={documents.setSelectedExportRevisionIndex}
        onSetUpdateMilestones={documents.setUpdateMilestones}
        onPreviewSelectedRevision={documents.previewSelectedRevision}
        onPrintSelectedRevision={documents.printSelectedRevision}
        onClose={documents.closeExportModal}
        onExport={documents.runExport}
      />
      {jobPacketOpen ? (
        <JobPacketBuilder
          projectId={projectId}
          rows={documents.rows}
          busy={jobPacketBusy}
          error={jobPacketError}
          onClose={() => setJobPacketOpen(false)}
          onBuild={buildJobPacket}
        />
      ) : null}
    </div>
  );
}
