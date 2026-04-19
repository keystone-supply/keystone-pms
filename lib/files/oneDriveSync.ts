import { createHash } from "crypto";

import { adminSupabase } from "@/lib/supabaseAdmin";
import type { ProjectFileRow, ProjectFolderSlot } from "@/lib/projectFiles";

const PROJECT_FILES_BUCKET = "project-files";
const DEFAULT_MAX_MIRROR_FILE_BYTES = 100 * 1024 * 1024;

type ProjectFolderMetadata = {
  id: string;
  project_number: string | null;
  project_name: string | null;
  customer: string | null;
};

type GraphDeltaItem = {
  id: string;
  name?: string;
  size?: number;
  webUrl?: string;
  eTag?: string;
  cTag?: string;
  parentReference?: {
    driveId?: string;
    id?: string;
    path?: string;
  };
  file?: {
    mimeType?: string;
  };
  folder?: {
    childCount?: number;
  };
  deleted?: {
    state?: string;
  };
  "@removed"?: {
    reason?: string;
  };
};

type GraphDeltaResponse = {
  value?: GraphDeltaItem[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
};

function sanitizeSegment(value: string): string {
  return value
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9 ]/g, "");
}

function buildProjectFolderPath(project: ProjectFolderMetadata): string {
  const customerUpper = sanitizeSegment(project.customer ?? "");
  const projectUpper = sanitizeSegment(project.project_name ?? "");
  const projectNumber = String(project.project_number ?? "").trim();
  const folderName = `${projectNumber} - ${projectUpper}`;
  return `Documents/0 PROJECT FOLDERS/${customerUpper}/${folderName}`;
}

export function classifyFolderSlot(onedrivePath: string): ProjectFolderSlot {
  const normalized = onedrivePath.toUpperCase();
  if (/_CAD(\/|$)/.test(normalized)) return "cad";
  if (/_VENDORS(\/|$)/.test(normalized)) return "vendors";
  if (/_PICS(\/|$)/.test(normalized)) return "pics";
  if (/_DOCS(\/|$)/.test(normalized)) return "docs";
  if (/_G-CODE(\/|$)/.test(normalized)) return "gcode";
  if (/0 PROJECT FOLDERS\/[^/]+\/[^/]+$/.test(normalized)) return "root";
  return "other";
}

function toOneDrivePath(parentPath: string | undefined, name: string): string {
  if (!parentPath) return name;
  const rootPrefix = "/drive/root:";
  const cleanedParent = parentPath.startsWith(rootPrefix)
    ? parentPath.slice(rootPrefix.length)
    : parentPath;
  const withParent = cleanedParent.endsWith("/")
    ? `${cleanedParent}${name}`
    : `${cleanedParent}/${name}`;
  return withParent.replace(/^\/+/, "");
}

function ensureAdminClient() {
  if (!adminSupabase) {
    throw new Error("Supabase service client is not configured.");
  }
  return adminSupabase;
}

async function graphJson<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Graph request failed (${response.status}): ${body}`);
  }
  return (body ? JSON.parse(body) : {}) as T;
}

async function graphDelete(url: string, accessToken: string): Promise<void> {
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Graph delete failed (${response.status}): ${text}`);
  }
}

async function getProject(projectId: string): Promise<ProjectFolderMetadata> {
  const client = ensureAdminClient();
  const { data, error } = await client
    .from("projects")
    .select("id,project_number,project_name,customer")
    .eq("id", projectId)
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Project not found.");
  }
  return data as ProjectFolderMetadata;
}

async function getSyncState(projectId: string): Promise<{ delta_token: string | null }> {
  const client = ensureAdminClient();
  const { data, error } = await client
    .from("project_folder_sync")
    .select("delta_token")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return { delta_token: (data as { delta_token: string | null } | null)?.delta_token ?? null };
}

async function updateSyncState(
  projectId: string,
  patch: Partial<{
    delta_token: string | null;
    last_full_index_at: string | null;
    last_delta_at: string | null;
    last_error: string | null;
  }>,
): Promise<void> {
  const client = ensureAdminClient();
  const { error } = await client.from("project_folder_sync").upsert(
    {
      project_id: projectId,
      ...patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id" },
  );
  if (error) {
    throw new Error(error.message);
  }
}

async function upsertDeltaItem(projectId: string, item: GraphDeltaItem): Promise<void> {
  if (!item.id) return;
  const client = ensureAdminClient();
  if (item.deleted || item["@removed"]) {
    const { error: deleteError } = await client
      .from("project_files")
      .delete()
      .eq("project_id", projectId)
      .eq("onedrive_item_id", item.id);
    if (deleteError) {
      throw new Error(deleteError.message);
    }
    return;
  }

  const itemName = item.name ?? "";
  const onedrivePath = toOneDrivePath(item.parentReference?.path, itemName);
  const isFolder = Boolean(item.folder);
  const existing = await client
    .from("project_files")
    .select("storage_object_key,onedrive_etag")
    .eq("project_id", projectId)
    .eq("onedrive_item_id", item.id)
    .maybeSingle();

  if (existing.error) {
    throw new Error(existing.error.message);
  }
  const existingData = existing.data as
    | { storage_object_key: string | null; onedrive_etag: string | null }
    | null;
  const etagChanged =
    existingData != null &&
    existingData.onedrive_etag != null &&
    item.eTag != null &&
    existingData.onedrive_etag !== item.eTag;

  const { error: upsertError } = await client.from("project_files").upsert(
    {
      project_id: projectId,
      onedrive_drive_id: item.parentReference?.driveId ?? "",
      onedrive_item_id: item.id,
      onedrive_parent_item_id: item.parentReference?.id ?? null,
      onedrive_path: onedrivePath,
      folder_slot: classifyFolderSlot(onedrivePath),
      name: itemName,
      mime_type: item.file?.mimeType ?? null,
      size_bytes: typeof item.size === "number" ? item.size : null,
      is_folder: isFolder,
      onedrive_etag: item.eTag ?? null,
      onedrive_ctag: item.cTag ?? null,
      web_url: item.webUrl ?? null,
      mirror_status:
        isFolder || !existingData?.storage_object_key
          ? "not_mirrored"
          : etagChanged
            ? "stale"
            : "synced",
      mirror_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "onedrive_item_id" },
  );
  if (upsertError) {
    throw new Error(upsertError.message);
  }
}

async function runDeltaSyncFromUrl(
  projectId: string,
  accessToken: string,
  initialUrl: string,
  isFullIndex: boolean,
): Promise<void> {
  let url: string | null = initialUrl;
  let deltaToken: string | null = null;
  while (url) {
    const page: GraphDeltaResponse = await graphJson<GraphDeltaResponse>(
      url,
      accessToken,
    );
    for (const item of page.value ?? []) {
      await upsertDeltaItem(projectId, item);
    }
    url = page["@odata.nextLink"] ?? null;
    if (page["@odata.deltaLink"]) {
      deltaToken = page["@odata.deltaLink"];
    }
  }

  await updateSyncState(projectId, {
    delta_token: deltaToken,
    last_error: null,
    last_delta_at: new Date().toISOString(),
    last_full_index_at: isFullIndex ? new Date().toISOString() : undefined,
  });
}

export async function indexProjectFolder(
  projectId: string,
  accessToken: string,
): Promise<void> {
  const project = await getProject(projectId);
  const folderPath = buildProjectFolderPath(project);
  const startUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(folderPath)}:/delta`;
  try {
    await runDeltaSyncFromUrl(projectId, accessToken, startUrl, true);
  } catch (error) {
    await updateSyncState(projectId, {
      last_error: error instanceof Error ? error.message : "Sync failed.",
    });
    throw error;
  }
}

export async function deltaSyncProject(
  projectId: string,
  accessToken: string,
): Promise<void> {
  const state = await getSyncState(projectId);
  if (!state.delta_token) {
    await indexProjectFolder(projectId, accessToken);
    return;
  }
  try {
    await runDeltaSyncFromUrl(projectId, accessToken, state.delta_token, false);
  } catch (error) {
    await updateSyncState(projectId, {
      last_error: error instanceof Error ? error.message : "Sync failed.",
    });
    throw error;
  }
}

export async function mirrorFile(
  fileRow: ProjectFileRow,
  accessToken: string,
): Promise<ProjectFileRow> {
  if (fileRow.is_folder) return fileRow;
  const client = ensureAdminClient();
  const maxBytes = Number(
    process.env.PROJECT_FILES_MIRROR_MAX_BYTES ?? DEFAULT_MAX_MIRROR_FILE_BYTES,
  );
  if (
    typeof fileRow.size_bytes === "number" &&
    Number.isFinite(maxBytes) &&
    fileRow.size_bytes > maxBytes
  ) {
    const { data, error } = await client
      .from("project_files")
      .update({
        mirror_status: "error",
        mirror_error: `File exceeds mirror cap (${maxBytes} bytes).`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fileRow.id)
      .select("*")
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Could not update mirror status.");
    }
    return data as ProjectFileRow;
  }

  if (
    fileRow.storage_object_key &&
    fileRow.mirror_status === "synced" &&
    fileRow.onedrive_etag
  ) {
    return fileRow;
  }

  const { error: markMirroringError } = await client
    .from("project_files")
    .update({
      mirror_status: "mirroring",
      mirror_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fileRow.id);
  if (markMirroringError) {
    throw new Error(markMirroringError.message);
  }

  const contentRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${fileRow.onedrive_item_id}/content`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (!contentRes.ok) {
    const errorText = await contentRes.text().catch(() => "");
    await client
      .from("project_files")
      .update({
        mirror_status: "error",
        mirror_error: `Graph content fetch failed (${contentRes.status}): ${errorText}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fileRow.id);
    throw new Error(`Could not mirror file (${contentRes.status}).`);
  }

  const bytes = new Uint8Array(await contentRes.arrayBuffer());
  const objectKey = `${fileRow.project_id}/${fileRow.onedrive_item_id}`;
  const sha = createHash("sha256").update(bytes).digest("hex");

  const { error: uploadError } = await client.storage
    .from(PROJECT_FILES_BUCKET)
    .upload(objectKey, bytes, {
      upsert: true,
      contentType: fileRow.mime_type ?? undefined,
      cacheControl: "3600",
    });

  if (uploadError) {
    await client
      .from("project_files")
      .update({
        mirror_status: "error",
        mirror_error: uploadError.message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fileRow.id);
    throw new Error(uploadError.message);
  }

  const { data, error } = await client
    .from("project_files")
    .update({
      storage_object_key: objectKey,
      storage_sha256: sha,
      mirrored_at: new Date().toISOString(),
      mirror_status: "synced",
      mirror_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fileRow.id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Mirror update failed.");
  }
  return data as ProjectFileRow;
}

export async function removeOneDriveFile(
  fileRow: ProjectFileRow,
  accessToken: string,
): Promise<void> {
  await graphDelete(
    `https://graph.microsoft.com/v1.0/me/drive/items/${fileRow.onedrive_item_id}`,
    accessToken,
  );
}
