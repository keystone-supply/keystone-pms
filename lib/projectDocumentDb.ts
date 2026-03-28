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
  version: number;
  pdf_path: string | null;
  metadata: ProjectDocumentDraftMeta;
  vendor_id: string | null;
  created_at: string;
  updated_at: string;
};

export const PROJECT_DOCUMENT_SELECT =
  "id, project_id, kind, status, number, version, pdf_path, metadata, vendor_id, created_at, updated_at";
