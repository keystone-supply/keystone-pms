import { NextRequest, NextResponse } from "next/server";

import { requireApiRole } from "@/lib/auth/api-guard";
import { canEditProjects } from "@/lib/auth/roles";
import { deltaSyncProject, indexProjectFolder } from "@/lib/files/oneDriveSync";
import { resolveOneDriveAccessToken } from "@/lib/auth/oneDriveAccessToken";
import { adminSupabase } from "@/lib/supabaseAdmin";

async function featureEnabled(projectId: string): Promise<boolean> {
  if (!adminSupabase) return false;
  const { data } = await adminSupabase
    .from("projects")
    .select("files_phase1_enabled")
    .eq("id", projectId)
    .maybeSingle();
  return Boolean((data as { files_phase1_enabled?: boolean } | null)?.files_phase1_enabled);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireApiRole(
    request,
    canEditProjects,
    "Your role cannot refresh project files.",
  );
  if (!authResult.ok) return authResult.response;

  const accessToken = await resolveOneDriveAccessToken(request);
  if (!accessToken) {
    return NextResponse.json(
      { error: "OneDrive is not connected. Ask an admin to reconnect the service account." },
      { status: 401 },
    );
  }

  const params = await context.params;
  if (!(await featureEnabled(params.id))) {
    return NextResponse.json({ error: "Files feature is disabled for this project." }, { status: 403 });
  }

  const payload = (await request.json().catch(() => ({}))) as { full?: boolean };
  if (payload.full) {
    await indexProjectFolder(params.id, accessToken);
  } else {
    await deltaSyncProject(params.id, accessToken);
  }
  return NextResponse.json({ ok: true });
}
