import { NextRequest, NextResponse } from "next/server";

const NESTNOW_URL =
  process.env.NESTNOW_URL || "http://127.0.0.1:3001";

const USER_NEST_SERVICE_DOWN =
  "The nesting service isn't reachable right now. Ask IT to check the nesting service on the office server.";

const USER_NEST_RUN_FAILED =
  "The nesting run didn't complete successfully. Try the Preview preset, fewer parts, or simpler settings. If it keeps failing, contact IT.";

/**
 * Max seconds Next.js may keep this route alive while proxying NestNow.
 * Large population × generations can run a long time; self-hosted can use 24h.
 * Hosted platforms (e.g. Vercel) may enforce a lower ceiling regardless.
 */
export const maxDuration = 86400;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Body must be a JSON object with sheets and parts" },
      { status: 400 },
    );
  }

  const url = `${NESTNOW_URL.replace(/\/$/, "")}/nest`;
  const started = Date.now();

  try {
    // Forward the client JSON verbatim (e.g. optional `chromosome` for Refine).
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const proxyDurationMs = Date.now() - started;

    let data: Record<string, unknown> = {};
    try {
      const parsed: unknown = await res.json();
      if (parsed && typeof parsed === "object") {
        data = parsed as Record<string, unknown>;
      }
    } catch {
      /* NestNow returned non-JSON */
    }

    if (!res.ok) {
      const nestMessage =
        typeof data.error === "string"
          ? data.error
          : res.statusText || "NestNow error";
      console.warn(
        `[api/nest] NestNow HTTP ${res.status} after ${proxyDurationMs}ms: ${nestMessage}`,
      );
      const clientError = res.status >= 400 && res.status < 500;
      const userError = clientError ? nestMessage : USER_NEST_RUN_FAILED;
      const adminHint = `NestNow HTTP ${res.status}: ${nestMessage}`;
      const failureKind =
        typeof data.failureKind === "string" ? data.failureKind : undefined;
      const nestNowDurationRaw = data.nestNowDurationMs;
      const nestNowDurationMs =
        typeof nestNowDurationRaw === "number" &&
        Number.isFinite(nestNowDurationRaw)
          ? Math.round(nestNowDurationRaw)
          : undefined;

      const evalRaw = data.evalCount;
      const evalCount =
        typeof evalRaw === "number" && Number.isFinite(evalRaw)
          ? Math.round(evalRaw)
          : undefined;
      const popRaw = data.populationSize;
      const populationSize =
        typeof popRaw === "number" && Number.isFinite(popRaw)
          ? Math.round(popRaw)
          : undefined;
      const genRaw = data.gaGenerations;
      const gaGenerations =
        typeof genRaw === "number" && Number.isFinite(genRaw)
          ? Math.round(genRaw)
          : undefined;
      const lastEvalError =
        typeof data.lastEvalError === "string" && data.lastEvalError.trim()
          ? data.lastEvalError.trim()
          : undefined;
      const bestEffort =
        data.bestEffort != null && typeof data.bestEffort === "object"
          ? data.bestEffort
          : undefined;

      return NextResponse.json(
        {
          error: userError,
          adminHint,
          proxyDurationMs,
          nestNowHttpStatus: res.status,
          ...(failureKind ? { failureKind } : {}),
          ...(nestNowDurationMs != null ? { nestNowDurationMs } : {}),
          ...(evalCount != null ? { evalCount } : {}),
          ...(populationSize != null ? { populationSize } : {}),
          ...(gaGenerations != null ? { gaGenerations } : {}),
          ...(lastEvalError ? { lastEvalError } : {}),
          ...(bestEffort ? { bestEffort } : {}),
        },
        { status: res.status >= 400 && res.status < 600 ? res.status : 502 },
      );
    }

    console.log(`[api/nest] NestNow OK in ${proxyDurationMs}ms`);
    return NextResponse.json({ ...data, proxyDurationMs });
  } catch (err) {
    const proxyDurationMs = Date.now() - started;
    const message = err instanceof Error ? err.message : "Connection failed";
    console.warn(
      `[api/nest] NestNow fetch failed after ${proxyDurationMs}ms: ${message}`,
    );
    const adminHint = `${message} — NESTNOW_URL=${NESTNOW_URL}. Ensure NestNow is running on that host (e.g. npm run start:server in the NestNow project).`;
    return NextResponse.json(
      {
        error: USER_NEST_SERVICE_DOWN,
        adminHint,
        proxyDurationMs,
        stage: "nestnow_connect",
      },
      { status: 503 },
    );
  }
}
