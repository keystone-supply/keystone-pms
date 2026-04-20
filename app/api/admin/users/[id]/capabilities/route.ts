import { NextRequest, NextResponse } from "next/server";

import { requireApiCapability } from "@/lib/auth/api-guard";
import { normalizeAppCapabilities } from "@/lib/auth/roles";
import { adminSupabase } from "@/lib/supabaseAdmin";

type UpdateCapabilitiesBody = {
  capabilities?: string[];
};

async function activeManageUserCount(excludeUserId?: string): Promise<number> {
  if (!adminSupabase) return 0;
  const { data, error } = await adminSupabase
    .from("app_user_capabilities")
    .select("user_id, app_users!inner(id,is_active)")
    .eq("capability", "manage_users");
  if (error || !data) return 0;
  const ids = new Set<string>();
  for (const row of data as Array<{
    user_id: string;
    app_users: Array<{ is_active: boolean }> | { is_active: boolean } | null;
  }>) {
    const appUser = Array.isArray(row.app_users) ? row.app_users[0] : row.app_users;
    if (!appUser?.is_active) continue;
    if (excludeUserId && row.user_id === excludeUserId) continue;
    ids.add(row.user_id);
  }
  return ids.size;
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireApiCapability(request, "manage_users");
  if (!authResult.ok) return authResult.response;
  if (!adminSupabase) {
    return NextResponse.json({ error: "Admin API is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as UpdateCapabilitiesBody;
  const nextCapabilities = normalizeAppCapabilities(body.capabilities ?? []);

  const removingSelfManageUsers =
    id === authResult.context.userId && !nextCapabilities.includes("manage_users");
  if (removingSelfManageUsers) {
    return NextResponse.json(
      { error: "You cannot remove your own manage_users capability." },
      { status: 400 },
    );
  }

  if (!nextCapabilities.includes("manage_users")) {
    const remaining = await activeManageUserCount(id);
    if (remaining <= 0) {
      return NextResponse.json(
        { error: "At least one active user must retain manage_users." },
        { status: 400 },
      );
    }
  }

  const { error: deleteError } = await adminSupabase
    .from("app_user_capabilities")
    .delete()
    .eq("user_id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  if (nextCapabilities.length > 0) {
    const { error: insertError } = await adminSupabase
      .from("app_user_capabilities")
      .insert(
        nextCapabilities.map((capability) => ({
          user_id: id,
          capability,
          granted_by: authResult.context.userId,
        })),
      );
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
