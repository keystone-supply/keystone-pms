import { createHmac } from "node:crypto";

import type { AppRole } from "@/lib/auth/roles";
import { normalizeAppRole } from "@/lib/auth/roles";

const JWT_ALGORITHM = "HS256";
const JWT_TYPE = "JWT";
const DEFAULT_SUPABASE_BRIDGE_TOKEN_TTL_SECONDS = 10 * 60;

type SupabaseBridgeTokenInput = {
  email: string;
  userId: string;
  role: AppRole;
  ttlSeconds?: number;
};

type SupabaseBridgePayload = {
  aud: "authenticated";
  role: "authenticated";
  sub: string;
  email: string;
  app_role: AppRole;
  app_user_id: string;
  iat: number;
  exp: number;
  iss: "keystone-pms-nextauth-bridge";
};

function toBase64Url(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signHs256(input: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(input)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function getSupabaseBridgeTokenTtlSeconds(): number {
  const raw = process.env.SUPABASE_BRIDGE_TOKEN_TTL_SECONDS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_SUPABASE_BRIDGE_TOKEN_TTL_SECONDS;
}

export function issueSupabaseBridgeToken({
  email,
  userId,
  role,
  ttlSeconds,
}: SupabaseBridgeTokenInput): { token: string; expiresAt: number } {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error("SUPABASE_JWT_SECRET is required for Supabase session bridging.");
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error("Cannot issue Supabase bridge token without a user email.");
  }
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error("Cannot issue Supabase bridge token without a user id.");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const lifespan = ttlSeconds ?? getSupabaseBridgeTokenTtlSeconds();
  const expiresAt = nowSeconds + lifespan;

  const payload: SupabaseBridgePayload = {
    aud: "authenticated",
    role: "authenticated",
    sub: normalizedUserId,
    email: normalizedEmail,
    app_role: normalizeAppRole(role),
    app_user_id: normalizedUserId,
    iat: nowSeconds,
    exp: expiresAt,
    iss: "keystone-pms-nextauth-bridge",
  };

  const headerSegment = toBase64Url(
    JSON.stringify({
      alg: JWT_ALGORITHM,
      typ: JWT_TYPE,
    }),
  );
  const payloadSegment = toBase64Url(JSON.stringify(payload));
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const signature = signHs256(signingInput, secret);
  return {
    token: `${signingInput}.${signature}`,
    expiresAt,
  };
}
