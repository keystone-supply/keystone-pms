import { NextRequest, NextResponse } from "next/server";

import { requireApiRole } from "@/lib/auth/api-guard";
import { canManageDocuments } from "@/lib/auth/roles";
import { resolveOneDriveAccessToken } from "@/lib/auth/oneDriveAccessToken";
import { uploadPdfToDocs } from "@/lib/onedrive";
import { adminSupabase } from "@/lib/supabaseAdmin";

type ProjectExportMetadata = {
  customer: string | null;
  project_number: string | null;
  project_name: string | null;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireApiRole(
    request,
    canManageDocuments,
    "Your role cannot export project documents.",
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

  const formData = await request.formData();
  const upload = formData.get("file");
  const filename = String(formData.get("filename") ?? "").trim();
  const revisionIndex = Number(formData.get("revisionIndex") ?? 0);
  if (!(upload instanceof File) || !filename) {
    return NextResponse.json(
      { error: "Missing filename or PDF upload." },
      { status: 400 },
    );
  }

  const params = await context.params;
  const { data: project, error: projectError } = await adminSupabase
    .from("projects")
    .select("customer,project_number,project_name")
    .eq("id", params.id)
    .single();
  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }
  const meta = project as ProjectExportMetadata;
  const bytes = new Uint8Array(await upload.arrayBuffer());

  try {
    const path = await uploadPdfToDocs(
      accessToken,
      meta.customer ?? "",
      String(meta.project_number ?? ""),
      meta.project_name ?? "",
      filename,
      Number.isFinite(revisionIndex) ? revisionIndex : 0,
      bytes,
    );
    return NextResponse.json({ ok: true, path });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OneDrive export failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
