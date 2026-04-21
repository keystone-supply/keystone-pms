import { NextRequest, NextResponse } from "next/server";

import { requireApiCapability } from "@/lib/auth/api-guard";
import { getGraphAccessToken } from "@/lib/auth/apiAccessToken";
import { mirrorFile } from "@/lib/files/oneDriveSync";
import type { ProjectFileRow } from "@/lib/projectFiles";
import { adminSupabase } from "@/lib/supabaseAdmin";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; fileId: string }> },
) {
  const authResult = await requireApiCapability(
    request,
    "read_projects",
    "Your account cannot print project files.",
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
    const accessToken = await getGraphAccessToken(request);
    if (!accessToken) {
      return NextResponse.json(
        { error: "Sign in with Azure AD to print OneDrive files." },
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
      { error: signed.error?.message ?? "Could not create print URL." },
      { status: 500 },
    );
  }

  const upstream = await fetch(signed.data.signedUrl, { cache: "no-store" });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: "Could not fetch file bytes for print." },
      { status: 502 },
    );
  }

  const filename = row.name || "project-file";
  const headers = new Headers();
  headers.set(
    "content-type",
    upstream.headers.get("content-type") ||
      row.mime_type ||
      "application/octet-stream",
  );
  headers.set(
    "content-disposition",
    `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) {
    headers.set("content-length", contentLength);
  }
  headers.set("cache-control", "private, no-store, max-age=0");

  return new NextResponse(upstream.body, {
    status: 200,
    headers,
  });
}
