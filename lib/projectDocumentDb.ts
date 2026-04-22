import type {
  ProjectDocumentDraftMeta,
  ProjectDocumentKind,
} from "@/lib/documentTypes";

export type ProjectDocumentRow = {
  id: string;
  project_id: string;
  kind: ProjectDocumentKind;
  status: string;
  number: string | null;
  /** Current immutable revision index for this document series. */
  current_revision_index: number;
  /** Legacy export counter retained for backward compatibility. */
  version: number;
  pdf_path: string | null;
  metadata: ProjectDocumentDraftMeta;
  vendor_id: string | null;
  created_at: string;
  created_at_riverside?: string | null;
  updated_at: string;
  updated_at_riverside?: string | null;
};

export type ProjectDocumentRevisionRow = {
  id: string;
  document_id: string;
  revision_index: number;
  state: "draft" | "exported";
  number_snapshot: string | null;
  metadata_snapshot: ProjectDocumentDraftMeta;
  vendor_id_snapshot: string | null;
  issued_date_snapshot: string | null;
  export_channel: "download" | "onedrive" | null;
  exported_at: string | null;
  pdf_path: string | null;
  filename: string | null;
  created_by: string | null;
  created_at: string;
  created_at_riverside?: string | null;
  exported_at_riverside?: string | null;
};

export const PROJECT_DOCUMENT_SELECT =
  "id, project_id, kind, status, number, current_revision_index, version, pdf_path, metadata, vendor_id, created_at, created_at_riverside, updated_at, updated_at_riverside";

export const PROJECT_DOCUMENT_REVISION_SELECT =
  "id, document_id, revision_index, state, number_snapshot, metadata_snapshot, vendor_id_snapshot, issued_date_snapshot, export_channel, exported_at, exported_at_riverside, pdf_path, filename, created_by, created_at, created_at_riverside";

function normalizeRevisionIndex(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function coerceMeta(raw: unknown): ProjectDocumentDraftMeta {
  if (!raw || typeof raw !== "object") {
    return { lines: [], optionGroups: [], quotePresentAsMultipleOptions: false };
  }
  const candidate = raw as Partial<ProjectDocumentDraftMeta> & Record<string, unknown>;
  return {
    ...candidate,
    lines: Array.isArray(candidate.lines) ? candidate.lines : [],
    optionGroups: Array.isArray(candidate.optionGroups) ? candidate.optionGroups : [],
    quotePresentAsMultipleOptions: Boolean(candidate.quotePresentAsMultipleOptions),
  };
}

export function pickRevisionForExport(
  row: ProjectDocumentRow,
  revisions: ProjectDocumentRevisionRow[],
  selectedRevisionIndex: number | null,
): {
  revisionIndex: number;
  number: string | null;
  metadata: ProjectDocumentDraftMeta;
  vendorId: string | null;
} {
  const targetIndex =
    selectedRevisionIndex == null
      ? normalizeRevisionIndex(row.current_revision_index)
      : normalizeRevisionIndex(selectedRevisionIndex);
  const selected = revisions.find((r) => r.revision_index === targetIndex);
  if (selected) {
    return {
      revisionIndex: targetIndex,
      number: selected.number_snapshot,
      metadata: coerceMeta(selected.metadata_snapshot),
      vendorId: selected.vendor_id_snapshot,
    };
  }
  return {
    revisionIndex: normalizeRevisionIndex(row.current_revision_index),
    number: row.number,
    metadata: coerceMeta(row.metadata),
    vendorId: row.vendor_id,
  };
}

export function buildRevisionHistoryLabel(revision: ProjectDocumentRevisionRow): string {
  if (revision.created_at_riverside) {
    const stamped = revision.created_at_riverside
      .replace("T", " ")
      .replace(/:\d{2}(\.\d+)?$/, "");
    return `REV. ${revision.revision_index} (v${revision.revision_index}) - ${stamped} MT`;
  }
  const fallback = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(revision.created_at ? new Date(revision.created_at) : new Date())
    .replace(",", "");
  return `REV. ${revision.revision_index} (v${revision.revision_index}) - ${fallback} MT`;
}
