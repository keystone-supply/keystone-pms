"use client";

import { CornerDownLeft, Eye, FileText, HardDriveDownload, History, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DOCUMENT_KIND_LABEL } from "@/lib/documentTypes";
import type { ProjectDocumentRevisionRow, ProjectDocumentRow } from "@/lib/projectDocumentDb";
import { buildRevisionHistoryLabel } from "@/lib/projectDocumentDb";
import {
  formatRevisionSuffix,
  normalizeRevisionIndex,
} from "@/lib/documents/buildProjectDocumentPdf";
import {
  documentKindSupportsQuoteFinancialsSnapshot,
  readQuoteFinancialsSnapshotFromMetadata,
} from "@/lib/quoteFinancialsSnapshot";

type DocumentsListProps = {
  rows: ProjectDocumentRow[];
  loading: boolean;
  canManageDocuments: boolean;
  expandedHistoryId: string | null;
  rowRevisionCache: Record<string, ProjectDocumentRevisionRow[]>;
  rowRevisionLoading: Record<string, boolean>;
  rowRevisionError: Record<string, string>;
  onEdit: (row: ProjectDocumentRow) => void;
  onQuickPreview: (row: ProjectDocumentRow, shouldPrint?: boolean) => Promise<void>;
  onToggleHistory: (row: ProjectDocumentRow) => Promise<void>;
  onOpenExport: (row: ProjectDocumentRow, preferredRevisionIndex?: number) => Promise<void>;
  onPreviewRevisionFromHistory: (
    row: ProjectDocumentRow,
    revision: ProjectDocumentRevisionRow,
    shouldPrint?: boolean,
  ) => Promise<void>;
  onApplySnapshotReference?: (row: ProjectDocumentRow) => void;
};

export function DocumentsList({
  rows,
  loading,
  canManageDocuments,
  expandedHistoryId,
  rowRevisionCache,
  rowRevisionLoading,
  rowRevisionError,
  onEdit,
  onQuickPreview,
  onToggleHistory,
  onOpenExport,
  onPreviewRevisionFromHistory,
  onApplySnapshotReference,
}: DocumentsListProps) {
  if (loading) {
    return <p className="text-zinc-500">Loading documents…</p>;
  }

  if (rows.length === 0) {
    return <p className="text-zinc-500">No documents yet. Create one to get started.</p>;
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const currentRevision = normalizeRevisionIndex(row.current_revision_index);
        const revisions = rowRevisionCache[row.id] ?? [];
        return (
          <li
            key={row.id}
            className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 size-5 shrink-0 text-sky-400" aria-hidden />
              <div>
                <p className="font-medium text-white">{DOCUMENT_KIND_LABEL[row.kind]}</p>
                <p className="font-mono text-sm text-zinc-400">
                  {row.number ?? "—"} · REV. {currentRevision} {formatRevisionSuffix(currentRevision)}
                  {row.pdf_path ? (
                    <span className="ml-2 text-emerald-500/90">· file saved</span>
                  ) : null}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {documentKindSupportsQuoteFinancialsSnapshot(row.kind) &&
              readQuoteFinancialsSnapshotFromMetadata(row.metadata) &&
              onApplySnapshotReference ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  title="Restore Project financials from values stored when this document was saved. Save the project to persist."
                  onClick={() => onApplySnapshotReference(row)}
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
                onClick={() => void onQuickPreview(row)}
              >
                <Eye className="size-4" />
                Preview
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => void onQuickPreview(row, true)}
              >
                <Printer className="size-4" />
                Print
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!canManageDocuments}
                onClick={() => onEdit(row)}
              >
                Edit
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => void onToggleHistory(row)}
              >
                <History className="size-4" />
                {expandedHistoryId === row.id ? "Hide history" : "Show history"}
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1"
                disabled={!canManageDocuments}
                onClick={() => void onOpenExport(row)}
              >
                <HardDriveDownload className="size-4" />
                Export
              </Button>
            </div>
            {expandedHistoryId === row.id ? (
              <div className="mt-3 w-full rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <p className="text-xs font-medium uppercase text-zinc-500">Revision history</p>
                {rowRevisionLoading[row.id] ? (
                  <p className="mt-2 text-sm text-zinc-400">Loading revisions…</p>
                ) : rowRevisionError[row.id] ? (
                  <p className="mt-2 text-sm text-red-400">{rowRevisionError[row.id]}</p>
                ) : revisions.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-400">No revisions found.</p>
                ) : (
                  <div className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">
                    {[...revisions]
                      .sort((a, b) => {
                        const rank = (revision: ProjectDocumentRevisionRow): number => {
                          if (revision.revision_index === currentRevision) return 0;
                          if (revision.state === "exported") return 1;
                          return 2;
                        };
                        const rankDiff = rank(a) - rank(b);
                        if (rankDiff !== 0) return rankDiff;
                        return b.revision_index - a.revision_index;
                      })
                      .map((revision) => (
                        <div
                          key={revision.id}
                          className={`flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between ${
                            revision.revision_index === currentRevision
                              ? "border-sky-500/70 bg-sky-950/20"
                              : "border-zinc-800 bg-zinc-950/60"
                          }`}
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-mono text-sm text-zinc-200">
                                {buildRevisionHistoryLabel(revision)}
                              </p>
                              {revision.revision_index === currentRevision ? (
                                <span className="rounded-full border border-sky-500/60 bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
                                  Active
                                </span>
                              ) : null}
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                  revision.state === "exported"
                                    ? "border border-emerald-500/60 bg-emerald-500/15 text-emerald-300"
                                    : "border border-amber-500/60 bg-amber-500/15 text-amber-300"
                                }`}
                              >
                                {revision.state}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-500">
                              {revision.number_snapshot ?? "—"}{" "}
                              {revision.filename ? `· ${revision.filename}` : ""}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void onPreviewRevisionFromHistory(row, revision)}
                            >
                              Preview
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              onClick={() =>
                                void onPreviewRevisionFromHistory(row, revision, true)
                              }
                            >
                              <Printer className="size-4" />
                              Print
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void onOpenExport(row, revision.revision_index)}
                            >
                              Export REV {revision.revision_index}
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
  );
}
