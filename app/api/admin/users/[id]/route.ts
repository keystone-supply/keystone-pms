import { NextRequest, NextResponse } from "next/server";

import { requireApiCapability } from "@/lib/auth/api-guard";
import { adminSupabase } from "@/lib/supabaseAdmin";

type UpdateUserBody = {
  displayName?: string | null;
  isActive?: boolean;
  azureOid?: string | null;
  password?: string;
};

async function activeManageUserCount(excludeUserId?: string): Promise<number> {
  if (!adminSupabase) return 0;
  const capsQuery = adminSupabase
    .from("app_user_capabilities")
    .select("user_id")
    .eq("capability", "manage_users");
  if (excludeUserId) {
    capsQuery.neq("user_id", excludeUserId);
  }

  const { data: capRows, error: capError } = await capsQuery;
  if (capError || !capRows || capRows.length === 0) return 0;

  const uniqueIds = [...new Set(capRows.map((row) => row.user_id))];
  const { count, error: countError } = await adminSupabase
    .from("app_users")
    .select("id", { head: true, count: "exact" })
    .in("id", uniqueIds)
    .eq("is_active", true);
  if (countError) return 0;
  return count ?? 0;
}

async function userHasManageUsersCapability(userId: string): Promise<boolean> {
  if (!adminSupabase) return false;
  const { count, error } = await adminSupabase
    .from("app_user_capabilities")
    .select("user_id", { head: true, count: "exact" })
    .eq("user_id", userId)
    .eq("capability", "manage_users")
    .limit(1);
  if (error) return false;
  return (count ?? 0) > 0;
}

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
  const { data: existingUser, error: existingUserError } = await adminSupabase
    .from("app_users")
    .select("id,is_active")
    .eq("id", id)
    .maybeSingle();
  if (existingUserError) return NextResponse.json({ error: existingUserError.message }, { status: 500 });
  if (!existingUser) return NextResponse.json({ error: "User not found." }, { status: 404 });

  if (body.isActive === false && existingUser.is_active) {
    const isManageUsersUser = await userHasManageUsersCapability(id);
    if (isManageUsersUser) {
      const remaining = await activeManageUserCount(id);
      if (remaining <= 0) {
        return NextResponse.json(
          { error: "At least one active user must retain manage_users." },
          { status: 400 },
        );
      }
    }
  }

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

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireApiCapability(request, "manage_users");
  if (!authResult.ok) return authResult.response;
  if (!adminSupabase) {
    return NextResponse.json({ error: "Admin API is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  if (id === authResult.context.userId) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const { data: existingUser, error: existingUserError } = await adminSupabase
    .from("app_users")
    .select("id,is_active")
    .eq("id", id)
    .maybeSingle();
  if (existingUserError) return NextResponse.json({ error: existingUserError.message }, { status: 500 });
  if (!existingUser) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const isManageUsersUser = await userHasManageUsersCapability(id);
  if (isManageUsersUser && existingUser.is_active) {
    const remaining = await activeManageUserCount(id);
    if (remaining <= 0) {
      return NextResponse.json(
        { error: "At least one active user must retain manage_users." },
        { status: 400 },
      );
    }
  }

  const { error: clearGrantsError } = await adminSupabase
    .from("app_user_capabilities")
    .update({ granted_by: null })
    .eq("granted_by", id);
  if (clearGrantsError) {
    return NextResponse.json({ error: clearGrantsError.message }, { status: 500 });
  }

  const { error: deleteError } = await adminSupabase.from("app_users").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
