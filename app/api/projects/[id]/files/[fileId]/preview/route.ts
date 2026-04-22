import { NextRequest, NextResponse } from "next/server";

import { requireApiCapability } from "@/lib/auth/api-guard";
import { adminSupabase } from "@/lib/supabaseAdmin";
import type { ProjectFileRow } from "@/lib/projectFiles";
import { mirrorFile } from "@/lib/files/oneDriveSync";
import { resolveOneDriveAccessToken } from "@/lib/auth/oneDriveAccessToken";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; fileId: string }> },
) {
  const authResult = await requireApiCapability(
    request,
    "read_projects",
    "Your account cannot preview project files.",
  );
  if (!authResult.ok) return authResult.response;
  if (!adminSupabase) {
    return NextResponse.json(
      { error: "Files API is not configured." },
      { status: 500 },
    );
  }

  const params = await context.params;
  const { data, error } = await adminSupabase
    .from("project_files")
    .select("*")
    .eq("project_id", params.id)
    .eq("id", params.fileId)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  let row = data as ProjectFileRow;
  if (!row.storage_object_key || row.mirror_status === "stale") {
    const accessToken = await resolveOneDriveAccessToken(request);
    if (!accessToken) {
      return NextResponse.json(
        { error: "OneDrive is not connected. Ask an admin to reconnect the service account." },
        { status: 401 },
      );
    }
    row = await mirrorFile(row, accessToken);
  }

  if (!row.storage_object_key) {
    return NextResponse.json(
      { error: row.mirror_error ?? "File mirror unavailable.", webUrl: row.web_url },
      { status: 409 },
    );
  }

  const signed = await adminSupabase.storage
    .from("project-files")
    .createSignedUrl(row.storage_object_key, 300);
  if (signed.error || !signed.data) {
    return NextResponse.json(
      { error: signed.error?.message ?? "Could not create preview URL." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    url: signed.data.signedUrl,
    mimeType: row.mime_type,
    mirrorStatus: row.mirror_status,
  });
}
