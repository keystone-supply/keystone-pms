import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { createClient } from "@supabase/supabase-js";

import { normalizeAppRole } from "@/lib/auth/roles";
import {
  getSupabaseBridgeTokenTtlSeconds,
  issueSupabaseBridgeToken,
} from "@/lib/auth/supabase-jwt";

type SupabaseTokenResponse = {
  accessToken: string;
  expiresAt: number;
};

type DbIssuedBridgeToken = {
  access_token: string;
  expires_at: number;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
const adminSupabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

async function issueBridgeTokenFromDatabase(
  email: string,
  userId: string,
  role: ReturnType<typeof normalizeAppRole>,
): Promise<SupabaseTokenResponse> {
  if (!adminSupabase) {
    throw new Error("Server auth configuration is incomplete.");
  }
  const { data, error } = await adminSupabase.rpc("issue_supabase_bridge_token", {
    p_email: email,
    p_user_id: userId,
    p_app_role: role,
    p_ttl_seconds: getSupabaseBridgeTokenTtlSeconds(),
  });
  if (error) {
    throw new Error(error.message ?? "Database bridge token issuance failed.");
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (
    !row ||
    typeof (row as DbIssuedBridgeToken).access_token !== "string" ||
    typeof (row as DbIssuedBridgeToken).expires_at !== "number"
  ) {
    throw new Error("Database bridge token issuance returned an unexpected payload.");
  }
  return {
    accessToken: (row as DbIssuedBridgeToken).access_token,
    expiresAt: (row as DbIssuedBridgeToken).expires_at,
  };
}

export async function GET(request: NextRequest) {
  const nextAuthSecret = process.env.NEXTAUTH_SECRET;
  if (!nextAuthSecret) {
    return NextResponse.json(
      { error: "Server auth configuration is incomplete." },
      { status: 500 },
    );
  }

  const token = await getToken({
    req: request,
    secret: nextAuthSecret,
  });
  const email = typeof token?.email === "string" ? token.email : "";
  const userId = typeof token?.userId === "string" ? token.userId : "";
  if (!token || !email || !userId) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const role = normalizeAppRole(token.role);
  let issued: SupabaseTokenResponse;
  try {
    if (process.env.SUPABASE_JWT_SECRET) {
      const bridgeToken = issueSupabaseBridgeToken({
        email,
        userId,
        role,
      });
      issued = {
        accessToken: bridgeToken.token,
        expiresAt: bridgeToken.expiresAt,
      };
    } else {
      issued = await issueBridgeTokenFromDatabase(email, userId, role);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not issue token.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json(issued, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
