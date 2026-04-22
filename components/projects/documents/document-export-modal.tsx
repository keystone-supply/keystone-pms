"use client";

import { CloudUpload, HardDriveDownload, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HelpPopoverButton } from "@/components/ui/help-popover-button";
import { DOCUMENT_KIND_LABEL } from "@/lib/documentTypes";
import { buildRevisionHistoryLabel, type ProjectDocumentRevisionRow, type ProjectDocumentRow } from "@/lib/projectDocumentDb";
import type { ProjectRow } from "@/lib/projectTypes";

type ExportMethod = "download" | "onedrive";

type DocumentExportModalProps = {
  open: boolean;
  project: ProjectRow;
  exportingRow: ProjectDocumentRow | null;
  exportMethod: ExportMethod;
  exportRevisions: ProjectDocumentRevisionRow[];
  selectedExportRevisionIndex: number | null;
  exportRevisionsLoading: boolean;
  updateMilestones: boolean;
  exportError: string;
  exportBusy: boolean;
  onSetExportMethod: (method: ExportMethod) => void;
  onSetSelectedExportRevisionIndex: (revisionIndex: number) => void;
  onSetUpdateMilestones: (enabled: boolean) => void;
  onPreviewSelectedRevision: () => Promise<void>;
  onPrintSelectedRevision: () => Promise<void>;
  onClose: () => void;
  onExport: () => Promise<void>;
};

export function DocumentExportModal({
  open,
  project,
  exportingRow,
  exportMethod,
  exportRevisions,
  selectedExportRevisionIndex,
  exportRevisionsLoading,
  updateMilestones,
  exportError,
  exportBusy,
  onSetExportMethod,
  onSetSelectedExportRevisionIndex,
  onSetUpdateMilestones,
  onPreviewSelectedRevision,
  onPrintSelectedRevision,
  onClose,
  onExport,
}: DocumentExportModalProps) {
  if (!open || !exportingRow) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">Export PDF</h3>
        <p className="mt-2 text-sm text-zinc-400">
          Job <span className="font-mono text-zinc-200">{project.project_number}</span> —{" "}
          {DOCUMENT_KIND_LABEL[exportingRow.kind]}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-1">
          <button
            type="button"
            onClick={() => onSetExportMethod("download")}
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
            onClick={() => onSetExportMethod("onedrive")}
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
          <p className="text-xs font-medium uppercase text-zinc-500">Revision history</p>
          {exportRevisionsLoading ? (
            <p className="mt-2 text-sm text-zinc-400">Loading revisions…</p>
          ) : exportRevisions.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-400">
              No saved revisions found. Export uses current draft.
            </p>
          ) : (
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
              {exportRevisions.map((revision) => (
                <label
                  key={revision.id}
                  className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-700"
                >
                  <span className="pr-3">{buildRevisionHistoryLabel(revision)}</span>
                  <input
                    type="radio"
                    name="export-revision"
                    checked={selectedExportRevisionIndex === revision.revision_index}
                    onChange={() => onSetSelectedExportRevisionIndex(revision.revision_index)}
                    className="size-4 rounded border-zinc-600"
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={updateMilestones}
              onChange={(event) => onSetUpdateMilestones(event.target.checked)}
              className="size-4 rounded border-zinc-600"
            />
            Update job milestones
          </label>
          <HelpPopoverButton
            detail="Milestones updated by document type: quote -> quote sent, RFQ -> vendors, vendor PO -> materials ordered, invoice -> invoiced, BOL -> delivered."
            align="right"
          />
        </div>

        {exportError ? <p className="mt-3 text-sm text-red-400">{exportError}</p> : null}

        <div className="mt-6 flex gap-3">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => void onPreviewSelectedRevision()}
          >
            Preview selected REV
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="flex-1 gap-1"
            onClick={() => void onPrintSelectedRevision()}
          >
            <Printer className="size-4" />
            Print selected REV
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" className="flex-1" disabled={exportBusy} onClick={() => void onExport()}>
            {exportBusy ? "Working…" : exportMethod === "download" ? "Download" : "Upload"}
          </Button>
        </div>
      </div>
    </div>
  );
}
