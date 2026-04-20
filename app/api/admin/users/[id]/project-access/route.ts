import { NextRequest, NextResponse } from "next/server";

import { requireApiRole } from "@/lib/auth/api-guard";
import { hasCapability } from "@/lib/auth/roles";
import { adminSupabase } from "@/lib/supabaseAdmin";

type AccessRow = {
  project_id: string;
  can_read: boolean;
  can_write: boolean;
};

type UpdateProjectAccessBody = {
  access?: AccessRow[];
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireApiRole(
    request,
    (caps) =>
      hasCapability(caps, "manage_users") || hasCapability(caps, "manage_user_access"),
    "Your account cannot manage project access.",
  );
  if (!authResult.ok) return authResult.response;
  if (!adminSupabase) {
    return NextResponse.json({ error: "Admin API is not configured." }, { status: 500 });
  }
  const { id } = await context.params;
  const [projectsResult, accessResult] = await Promise.all([
    adminSupabase
      .from("projects")
      .select("id,project_number,project_name")
      .order("project_number", { ascending: false }),
    adminSupabase
      .from("app_user_project_access")
      .select("project_id,can_read,can_write")
      .eq("user_id", id),
  ]);
  if (projectsResult.error || accessResult.error) {
    return NextResponse.json(
      { error: projectsResult.error?.message ?? accessResult.error?.message ?? "Load failed." },
      { status: 500 },
    );
  }
  return NextResponse.json({
    projects: projectsResult.data ?? [],
    access: accessResult.data ?? [],
  });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireApiRole(
    request,
    (caps) =>
      hasCapability(caps, "manage_users") || hasCapability(caps, "manage_user_access"),
    "Your account cannot manage project access.",
  );
  if (!authResult.ok) return authResult.response;
  if (!adminSupabase) {
    return NextResponse.json({ error: "Admin API is not configured." }, { status: 500 });
  }
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as UpdateProjectAccessBody;
  const rows = (body.access ?? []).filter((row) => row.can_read || row.can_write);

  const { error: deleteError } = await adminSupabase
    .from("app_user_project_access")
    .delete()
    .eq("user_id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  if (rows.length > 0) {
    const { error: insertError } = await adminSupabase.from("app_user_project_access").insert(
      rows.map((row) => ({
        user_id: id,
        project_id: row.project_id,
        can_read: Boolean(row.can_read),
        can_write: Boolean(row.can_write),
      })),
    );
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
