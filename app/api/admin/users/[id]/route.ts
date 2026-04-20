import { NextRequest, NextResponse } from "next/server";

import { requireApiCapability } from "@/lib/auth/api-guard";
import { adminSupabase } from "@/lib/supabaseAdmin";

type UpdateUserBody = {
  displayName?: string | null;
  isActive?: boolean;
  azureOid?: string | null;
  password?: string;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireApiCapability(request, "manage_users");
  if (!authResult.ok) return authResult.response;
  if (!adminSupabase) {
    return NextResponse.json({ error: "Admin API is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  const [userResult, capsResult, projectsResult] = await Promise.all([
    adminSupabase
      .from("app_users")
      .select("id,email,display_name,auth_provider,azure_oid,is_active,created_at,updated_at")
      .eq("id", id)
      .single(),
    adminSupabase
      .from("app_user_capabilities")
      .select("capability")
      .eq("user_id", id),
    adminSupabase
      .from("app_user_project_access")
      .select("project_id,can_read,can_write")
      .eq("user_id", id),
  ]);

  if (userResult.error || !userResult.data) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (capsResult.error || projectsResult.error) {
    return NextResponse.json(
      { error: capsResult.error?.message ?? projectsResult.error?.message ?? "Load failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    user: userResult.data,
    capabilities: (capsResult.data ?? []).map((row) => row.capability),
    projectAccess: projectsResult.data ?? [],
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireApiCapability(request, "manage_users");
  if (!authResult.ok) return authResult.response;
  if (!adminSupabase) {
    return NextResponse.json({ error: "Admin API is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as UpdateUserBody;
  const updatePayload: Record<string, unknown> = {};
  if (body.displayName !== undefined) {
    updatePayload.display_name = body.displayName?.trim() || null;
  }
  if (body.isActive !== undefined) {
    updatePayload.is_active = Boolean(body.isActive);
  }
  if (body.azureOid !== undefined) {
    updatePayload.azure_oid = body.azureOid?.trim() || null;
  }

  if (Object.keys(updatePayload).length > 0) {
    const { error } = await adminSupabase.from("app_users").update(updatePayload).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (typeof body.password === "string" && body.password.length > 0) {
    const { data: user, error: userError } = await adminSupabase
      .from("app_users")
      .select("email,display_name")
      .eq("id", id)
      .single();
    if (userError || !user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    const { error: passwordError } = await adminSupabase.rpc("upsert_credentials_app_user", {
      p_email: user.email,
      p_password: body.password,
      p_display_name: user.display_name,
    });
    if (passwordError) {
      return NextResponse.json({ error: passwordError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
