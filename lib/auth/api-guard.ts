import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

import { normalizeAppRole, type AppRole } from "@/lib/auth/roles";

type AuthorizedRoleContext = {
  role: AppRole;
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
  check: (role: AppRole) => boolean,
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

  const role = normalizeAppRole(token.role);
  if (!check(role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: deniedMessage }, { status: 403 }),
    };
  }

  return {
    ok: true,
    context: {
      role,
      email,
      userId,
    },
  };
}
