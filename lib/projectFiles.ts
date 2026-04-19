export type ProjectFolderSlot =
  | "cad"
  | "vendors"
  | "pics"
  | "docs"
  | "gcode"
  | "root"
  | "other";

export type ProjectFileRow = {
  id: string;
  project_id: string;
  onedrive_drive_id: string;
  onedrive_item_id: string;
  onedrive_parent_item_id: string | null;
  onedrive_path: string;
  folder_slot: ProjectFolderSlot;
  name: string;
  mime_type: string | null;
  size_bytes: number | null;
  is_folder: boolean;
  onedrive_etag: string | null;
  onedrive_ctag: string | null;
  web_url: string | null;
  storage_object_key: string | null;
  storage_sha256: string | null;
  mirrored_at: string | null;
  mirror_status: "not_mirrored" | "mirroring" | "synced" | "stale" | "error";
  mirror_error: string | null;
  content_text: string | null;
  created_at: string;
  updated_at: string;
};

export const PROJECT_FILE_SELECT =
  "id,project_id,onedrive_drive_id,onedrive_item_id,onedrive_parent_item_id,onedrive_path,folder_slot,name,mime_type,size_bytes,is_folder,onedrive_etag,onedrive_ctag,web_url,storage_object_key,storage_sha256,mirrored_at,mirror_status,mirror_error,content_text,created_at,updated_at";

export type ProjectFolderSyncRow = {
  project_id: string;
  delta_token: string | null;
  last_full_index_at: string | null;
  last_delta_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};
