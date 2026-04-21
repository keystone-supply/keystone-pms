import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-guard";
import { canRunNesting } from "@/lib/auth/roles";

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
  const authResult = await requireApiRole(
    request,
    canRunNesting,
    "Your role cannot run nesting.",
  );
  if (!authResult.ok) {
    return authResult.response;
  }

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
      const diagnostic = {
        nestNowHttpStatus: res.status,
        failureKind:
          typeof data.failureKind === "string" ? data.failureKind : undefined,
        nestNowDurationMs:
          typeof data.nestNowDurationMs === "number" &&
          Number.isFinite(data.nestNowDurationMs)
            ? Math.round(data.nestNowDurationMs)
            : undefined,
        evalCount:
          typeof data.evalCount === "number" && Number.isFinite(data.evalCount)
            ? Math.round(data.evalCount)
            : undefined,
        populationSize:
          typeof data.populationSize === "number" &&
          Number.isFinite(data.populationSize)
            ? Math.round(data.populationSize)
            : undefined,
        gaGenerations:
          typeof data.gaGenerations === "number" &&
          Number.isFinite(data.gaGenerations)
            ? Math.round(data.gaGenerations)
            : undefined,
        lastEvalError:
          typeof data.lastEvalError === "string" && data.lastEvalError.trim()
            ? data.lastEvalError.trim()
            : undefined,
      };
      console.warn("[api/nest] Nested service failure details:", diagnostic);

      return NextResponse.json(
        {
          error: userError,
          proxyDurationMs,
        },
        { status: res.status >= 400 && res.status < 600 ? res.status : 502 },
      );
    }

    return NextResponse.json({ ...data, proxyDurationMs });
  } catch (err) {
    const proxyDurationMs = Date.now() - started;
    const message = err instanceof Error ? err.message : "Connection failed";
    console.warn(
      `[api/nest] NestNow fetch failed after ${proxyDurationMs}ms: ${message}`,
    );
    console.warn(
      `[api/nest] Verify NestNow host: NESTNOW_URL=${NESTNOW_URL.replace(/\/$/, "")}`,
    );
    return NextResponse.json(
      {
        error: USER_NEST_SERVICE_DOWN,
        proxyDurationMs,
        stage: "nestnow_connect",
      },
      { status: 503 },
    );
  }
}
