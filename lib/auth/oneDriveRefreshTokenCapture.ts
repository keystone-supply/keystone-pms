type CaptureTokenPayload = {
  authProvider?: unknown;
  refreshToken?: unknown;
};

type CaptureRequest = {
  configuredCaptureKey?: string | null;
  providedCaptureKey?: string | null;
  token?: CaptureTokenPayload | null;
  nowMs?: () => number;
};

type CaptureResult =
  | { kind: "disabled" }
  | { kind: "forbidden" }
  | { kind: "already_used"; usedAtMs: number }
  | { kind: "wrong_provider" }
  | { kind: "missing_refresh_token" }
  | { kind: "ok"; refreshToken: string; capturedAtMs: number };

let usedAtMs: number | null = null;

function normalizeValue(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function captureOneDriveRefreshTokenOnce(
  request: CaptureRequest,
): CaptureResult {
  const configuredCaptureKey = normalizeValue(request.configuredCaptureKey);
  const providedCaptureKey = normalizeValue(request.providedCaptureKey);
  const nowMs = request.nowMs ?? Date.now;

  if (!configuredCaptureKey) return { kind: "disabled" };
  if (!providedCaptureKey || providedCaptureKey !== configuredCaptureKey) {
    return { kind: "forbidden" };
  }
  if (usedAtMs != null) {
    return { kind: "already_used", usedAtMs };
  }

  if (request.token?.authProvider !== "azure-ad") {
    return { kind: "wrong_provider" };
  }
  if (
    typeof request.token.refreshToken !== "string" ||
    request.token.refreshToken.length === 0
  ) {
    return { kind: "missing_refresh_token" };
  }

  usedAtMs = nowMs();
  return {
    kind: "ok",
    refreshToken: request.token.refreshToken,
    capturedAtMs: usedAtMs,
  };
}

export function __resetOneDriveRefreshTokenCaptureForTests() {
  usedAtMs = null;
}
