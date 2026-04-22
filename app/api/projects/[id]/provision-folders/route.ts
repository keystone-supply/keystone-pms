import { NextRequest, NextResponse } from "next/server";

import { requireApiRole } from "@/lib/auth/api-guard";
import { canCreateProjects } from "@/lib/auth/roles";
import { resolveOneDriveAccessToken } from "@/lib/auth/oneDriveAccessToken";
import { createProjectFolders } from "@/lib/onedrive";
import { adminSupabase } from "@/lib/supabaseAdmin";

type ProjectProvisionRow = {
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
    canCreateProjects,
    "Your role cannot create project folders.",
  );
  if (!authResult.ok) return authResult.response;

  if (!adminSupabase) {
    return NextResponse.json(
      { ok: false, error: "Folder provisioning is not configured." },
      { status: 500 },
    );
  }

  const accessToken = await resolveOneDriveAccessToken(request);
  if (!accessToken) {
    return NextResponse.json(
      {
        ok: false,
        error: "OneDrive is not connected. Ask an admin to reconnect the service account.",
      },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  const { data: project, error: projectError } = await adminSupabase
    .from("projects")
    .select("customer,project_number,project_name")
    .eq("id", id)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
  }

  const row = project as ProjectProvisionRow;

  await createProjectFolders(
    accessToken,
    row.customer ?? "",
    String(row.project_number ?? ""),
    row.project_name ?? "",
  );

  return NextResponse.json({ ok: true });
}
