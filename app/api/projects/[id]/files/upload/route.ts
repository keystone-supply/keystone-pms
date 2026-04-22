import { NextRequest, NextResponse } from "next/server";

import { requireApiRole } from "@/lib/auth/api-guard";
import { canEditProjects } from "@/lib/auth/roles";
import { adminSupabase } from "@/lib/supabaseAdmin";
import { createProjectFolders, ensureFolder } from "@/lib/onedrive";
import { deltaSyncProject, mirrorFile } from "@/lib/files/oneDriveSync";
import type { ProjectFileRow, ProjectFolderSlot } from "@/lib/projectFiles";
import { resolveOneDriveAccessToken } from "@/lib/auth/oneDriveAccessToken";

const SLOT_TO_SUFFIX: Record<ProjectFolderSlot, string | null> = {
  cad: "_CAD",
  vendors: "_VENDORS",
  pics: "_PICS",
  docs: "_DOCS",
  gcode: "_G-CODE",
  root: null,
  other: null,
};

type ProjectUploadMetadata = {
  customer: string | null;
  project_number: string | null;
  project_name: string | null;
};

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "_").trim();
  return cleaned || "upload.bin";
}

function encodeGraphPath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireApiRole(
    request,
    canEditProjects,
    "Your role cannot upload project files.",
  );
  if (!authResult.ok) return authResult.response;
  if (!adminSupabase) {
    return NextResponse.json(
      { error: "Files API is not configured." },
      { status: 500 },
    );
  }

  const accessToken = await resolveOneDriveAccessToken(request);
  if (!accessToken) {
    return NextResponse.json(
      { error: "OneDrive is not connected. Ask an admin to reconnect the service account." },
      { status: 401 },
    );
  }

  const params = await context.params;
  const formData = await request.formData();
  const upload = formData.get("file");
  if (!(upload instanceof File)) {
    return NextResponse.json({ error: "Missing file upload." }, { status: 400 });
  }

  const slotRaw = String(formData.get("folderSlot") ?? "root");
  const folderSlot = (Object.keys(SLOT_TO_SUFFIX) as ProjectFolderSlot[]).includes(
    slotRaw as ProjectFolderSlot,
  )
    ? (slotRaw as ProjectFolderSlot)
    : "root";
  const targetName = sanitizeFileName(upload.name || "upload.bin");

  const { data: project, error: projectError } = await adminSupabase
    .from("projects")
    .select("customer,project_number,project_name")
    .eq("id", params.id)
    .single();
  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  const meta = project as ProjectUploadMetadata;

  const basePath = await createProjectFolders(
    accessToken,
    meta.customer ?? "",
    String(meta.project_number ?? ""),
    meta.project_name ?? "",
  );
  const suffix = SLOT_TO_SUFFIX[folderSlot];
  let uploadPath = basePath;
  if (suffix) {
    uploadPath = `${basePath}/${String(meta.project_number ?? "").trim()}${suffix}`;
    await ensureFolder(
      { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      uploadPath,
    );
  }

  const oneDriveTarget = `${uploadPath}/${targetName}`;
  const uploadBuffer = new Uint8Array(await upload.arrayBuffer());
  const encodedTarget = encodeGraphPath(oneDriveTarget);
  const uploadRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedTarget}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: uploadBuffer,
    },
  );
  const uploadText = await uploadRes.text().catch(() => "");
  if (!uploadRes.ok) {
    console.warn(
      `[api/projects/files/upload] OneDrive upload failed: status=${uploadRes.status} body=${uploadText.slice(0, 500)}`,
    );
    return NextResponse.json(
      { error: `OneDrive upload failed (${uploadRes.status}).` },
      { status: 502 },
    );
  }
  let uploaded: { id?: string } = {};
  if (uploadText) {
    try {
      uploaded = JSON.parse(uploadText) as { id?: string };
    } catch {
      console.warn(
        "[api/projects/files/upload] OneDrive upload returned invalid JSON payload.",
      );
      return NextResponse.json(
        { error: "OneDrive upload returned an invalid response payload." },
        { status: 502 },
      );
    }
  }
  if (!uploaded.id) {
    return NextResponse.json(
      { error: "OneDrive did not return item metadata." },
      { status: 502 },
    );
  }

  await deltaSyncProject(params.id, accessToken);

  const { data: row, error: rowError } = await adminSupabase
    .from("project_files")
    .select("*")
    .eq("project_id", params.id)
    .eq("onedrive_item_id", uploaded.id)
    .single();
  if (rowError || !row) {
    return NextResponse.json(
      { error: rowError?.message ?? "Uploaded file is not indexed yet." },
      { status: 409 },
    );
  }

  const mirrored = await mirrorFile(row as ProjectFileRow, accessToken);
  return NextResponse.json({ ok: true, file: mirrored });
}
