import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function getGraphAccessToken(
  request: NextRequest,
): Promise<string | null> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  const token = await getToken({ req: request, secret });
  const accessToken =
    token && typeof token.accessToken === "string" ? token.accessToken : null;
  return accessToken;
}
