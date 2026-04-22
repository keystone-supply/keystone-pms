import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

import { requireApiRole } from "@/lib/auth/api-guard";
import { canManageUsers } from "@/lib/auth/roles";
import { captureOneDriveRefreshTokenOnce } from "@/lib/auth/oneDriveRefreshTokenCapture";

function jsonNoStore(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const authResult = await requireApiRole(
    request,
    canManageUsers,
    "Only admins can capture OneDrive service refresh tokens.",
  );
  if (!authResult.ok) return authResult.response;

  const nextAuthSecret = process.env.NEXTAUTH_SECRET;
  if (!nextAuthSecret) {
    return jsonNoStore({ error: "Server auth configuration is incomplete." }, 500);
  }

  const token = await getToken({
    req: request,
    secret: nextAuthSecret,
  });

  const result = captureOneDriveRefreshTokenOnce({
    configuredCaptureKey: process.env.ONEDRIVE_REFRESH_CAPTURE_KEY,
    providedCaptureKey: request.headers.get("x-onedrive-capture-key"),
    token: token
      ? {
          authProvider: token.authProvider,
          refreshToken: token.refreshToken,
        }
      : null,
  });

  switch (result.kind) {
    case "disabled":
      return jsonNoStore(
        {
          error:
            "Refresh token capture is disabled. Set ONEDRIVE_REFRESH_CAPTURE_KEY to enable one-time capture.",
        },
        403,
      );
    case "forbidden":
      return jsonNoStore({ error: "Capture key is invalid." }, 403);
    case "already_used":
      return jsonNoStore(
        {
          error: "Refresh token capture already used for this process. Restart server to retry.",
          usedAtMs: result.usedAtMs,
        },
        409,
      );
    case "wrong_provider":
      return jsonNoStore(
        {
          error:
            "Current session is not Azure AD. Sign in with Microsoft first, then call this endpoint.",
        },
        400,
      );
    case "missing_refresh_token":
      return jsonNoStore(
        {
          error:
            "No refresh token in current session. Re-authenticate with Microsoft consent and try again.",
        },
        400,
      );
    case "ok":
      return jsonNoStore({
        refreshToken: result.refreshToken,
        capturedAtMs: result.capturedAtMs,
        nextSteps: [
          "Set ONEDRIVE_SERVICE_REFRESH_TOKEN to this value.",
          "Unset ONEDRIVE_REFRESH_CAPTURE_KEY after saving the token.",
          "Restart the app.",
        ],
      });
    default: {
      const exhaustive: never = result;
      return jsonNoStore({ error: exhaustive }, 500);
    }
  }
}
