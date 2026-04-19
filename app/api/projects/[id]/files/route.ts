import { NextRequest, NextResponse } from "next/server";

import { requireApiRole } from "@/lib/auth/api-guard";
import { hasCapability } from "@/lib/auth/roles";
import { adminSupabase } from "@/lib/supabaseAdmin";
import { PROJECT_FILE_SELECT, type ProjectFileRow } from "@/lib/projectFiles";
import { deltaSyncProject } from "@/lib/files/oneDriveSync";
import { getGraphAccessToken } from "@/lib/auth/apiAccessToken";

async function readProjectFlag(projectId: string): Promise<boolean> {
  if (!adminSupabase) return false;
  const { data, error } = await adminSupabase
    .from("projects")
    .select("files_phase1_enabled")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !data) return false;
  return Boolean((data as { files_phase1_enabled?: boolean }).files_phase1_enabled);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireApiRole(
    request,
    (role) => hasCapability(role, "read_projects"),
    "Your role cannot view project files.",
  );
  if (!authResult.ok) return authResult.response;
  if (!adminSupabase) {
    return NextResponse.json(
      { error: "Files API is not configured." },
      { status: 500 },
    );
  }

  const params = await context.params;
  const projectId = params.id;
  const enabled = await readProjectFlag(projectId);
  if (!enabled) {
    return NextResponse.json({ enabled: false, files: [] });
  }

  const [{ data: files, error: filesError }, { data: sync, error: syncError }] =
    await Promise.all([
      adminSupabase
        .from("project_files")
        .select(PROJECT_FILE_SELECT)
        .eq("project_id", projectId)
        .order("is_folder", { ascending: false })
        .order("name", { ascending: true }),
      adminSupabase
        .from("project_folder_sync")
        .select("last_delta_at,last_error")
        .eq("project_id", projectId)
        .maybeSingle(),
    ]);

  if (filesError || syncError) {
    return NextResponse.json(
      { error: filesError?.message ?? syncError?.message ?? "Could not load files." },
      { status: 500 },
    );
  }

  const lastDeltaAt =
    (sync as { last_delta_at?: string | null } | null)?.last_delta_at ?? null;
  const stale =
    !lastDeltaAt || Date.now() - new Date(lastDeltaAt).getTime() > 60_000;
  if (stale) {
    const accessToken = await getGraphAccessToken(request);
    if (accessToken) {
      void deltaSyncProject(projectId, accessToken).catch(() => undefined);
    }
  }

  return NextResponse.json({
    enabled: true,
    files: (files ?? []) as ProjectFileRow[],
    sync: sync ?? null,
  });
}
