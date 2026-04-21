import { NextRequest, NextResponse } from "next/server";

import { requireApiCapability } from "@/lib/auth/api-guard";
import { APP_CAPABILITIES, normalizeAppCapabilities } from "@/lib/auth/roles";
import { adminSupabase } from "@/lib/supabaseAdmin";

type CreateUserBody = {
  email: string;
  displayName?: string | null;
  authProvider?: "credentials" | "azure_ad";
  password?: string;
  capabilities?: string[];
};

export async function GET(request: NextRequest) {
  const authResult = await requireApiCapability(
    request,
    "manage_users",
    "Your account cannot manage users.",
  );
  if (!authResult.ok) return authResult.response;
  if (!adminSupabase) {
    return NextResponse.json({ error: "Admin API is not configured." }, { status: 500 });
  }

  const { data: users, error } = await adminSupabase
    .from("app_users")
    .select("id,email,display_name,auth_provider,is_active,created_at,updated_at")
    .order("email", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const [capabilitiesResult, projectAccessResult] = await Promise.all([
    adminSupabase.from("app_user_capabilities").select("user_id,capability"),
    adminSupabase.from("app_user_project_access").select("user_id"),
  ]);
  if (capabilitiesResult.error || projectAccessResult.error) {
    return NextResponse.json(
      {
        error:
          capabilitiesResult.error?.message ??
          projectAccessResult.error?.message ??
          "Unable to load user capability metadata.",
      },
      { status: 500 },
    );
  }
  const capabilities = capabilitiesResult.data;
  const projectAccess = projectAccessResult.data;

  const capabilityCountByUser = new Map<string, number>();
  for (const row of capabilities ?? []) {
    capabilityCountByUser.set(row.user_id, (capabilityCountByUser.get(row.user_id) ?? 0) + 1);
  }
  const projectAccessCountByUser = new Map<string, number>();
  for (const row of projectAccess ?? []) {
    projectAccessCountByUser.set(
      row.user_id,
      (projectAccessCountByUser.get(row.user_id) ?? 0) + 1,
    );
  }

  return NextResponse.json({
    users: (users ?? []).map((user) => ({
      ...user,
      capabilityCount: capabilityCountByUser.get(user.id) ?? 0,
      projectAccessCount: projectAccessCountByUser.get(user.id) ?? 0,
    })),
    allCapabilities: APP_CAPABILITIES,
  });
}

export async function POST(request: NextRequest) {
  const authResult = await requireApiCapability(
    request,
    "manage_users",
    "Your account cannot create users.",
  );
  if (!authResult.ok) return authResult.response;
  if (!adminSupabase) {
    return NextResponse.json({ error: "Admin API is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as CreateUserBody;
  const email = String(body.email ?? "").trim().toLowerCase();
  const displayName = body.displayName?.trim() || null;
  const authProvider = body.authProvider ?? "azure_ad";
  if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });

  let userId: string;
  if (authProvider === "credentials") {
    const password = String(body.password ?? "");
    if (!password) {
      return NextResponse.json(
        { error: "Password is required for credentials users." },
        { status: 400 },
      );
    }
    const { data, error } = await adminSupabase.rpc("upsert_credentials_app_user", {
      p_email: email,
      p_password: password,
      p_display_name: displayName,
    });
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Could not create user." }, { status: 500 });
    }
    userId = data as string;
  } else {
    const { data, error } = await adminSupabase
      .from("app_users")
      .insert({
        email,
        display_name: displayName,
        auth_provider: "azure_ad",
        is_active: true,
      })
      .select("id")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Could not create user." }, { status: 500 });
    }
    userId = data.id;
  }

  const capabilities = normalizeAppCapabilities(body.capabilities ?? ["read_projects"]);
  const { error: capsError } = await adminSupabase.from("app_user_capabilities").insert(
    capabilities.map((capability) => ({
      user_id: userId,
      capability,
      granted_by: authResult.context.userId,
    })),
  );
  if (capsError) {
    return NextResponse.json({ error: capsError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, userId });
}
