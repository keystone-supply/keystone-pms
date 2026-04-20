import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

import {
  hasCapability,
  legacyRoleToCapabilities,
  normalizeAppCapabilities,
  toCapabilitySet,
  type AppCapability,
  type AppCapabilitySet,
} from "@/lib/auth/roles";

type AuthorizedRoleContext = {
  capabilities: AppCapabilitySet;
  email: string;
  userId: string;
};

type RoleGuardResult =
  | {
      ok: true;
      context: AuthorizedRoleContext;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function requireApiRole(
  request: NextRequest,
  check: (capabilities: AppCapabilitySet) => boolean,
  deniedMessage = "Not authorized for this action.",
): Promise<RoleGuardResult> {
  const nextAuthSecret = process.env.NEXTAUTH_SECRET;
  if (!nextAuthSecret) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Server auth configuration is incomplete." },
        { status: 500 },
      ),
    };
  }

  const token = await getToken({
    req: request,
    secret: nextAuthSecret,
  });
  const email = typeof token?.email === "string" ? token.email.trim().toLowerCase() : "";
  const userId = typeof token?.userId === "string" ? token.userId : "";

  if (!token || !email || !userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not authenticated." }, { status: 401 }),
    };
  }

  const legacyRole = (token as { role?: unknown }).role;
  const capabilities = toCapabilitySet(
    normalizeAppCapabilities(token.capabilities ?? legacyRoleToCapabilities(legacyRole)),
  );
  if (!check(capabilities)) {
    return {
      ok: false,
      response: NextResponse.json({ error: deniedMessage }, { status: 403 }),
    };
  }

  return {
    ok: true,
    context: {
      capabilities,
      email,
      userId,
    },
  };
}

export async function requireApiCapability(
  request: NextRequest,
  capability: AppCapability,
  deniedMessage = "Not authorized for this action.",
): Promise<RoleGuardResult> {
  return requireApiRole(
    request,
    (capabilities) => hasCapability(capabilities, capability),
    deniedMessage,
  );
}
