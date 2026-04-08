import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/api-guard";
import { canRunNesting } from "@/lib/auth/roles";

const NESTNOW_URL =
  process.env.NESTNOW_URL || "http://127.0.0.1:3001";

export async function POST(request: NextRequest) {
  const authResult = await requireApiRole(
    request,
    canRunNesting,
    "Your role cannot stop nesting jobs.",
  );
  if (!authResult.ok) {
    return authResult.response;
  }

  const url = `${NESTNOW_URL.replace(/\/$/, "")}/stop`;
  try {
    const res = await fetch(url, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message =
        typeof data?.error === "string" ? data.error : res.statusText || "NestNow error";
      return NextResponse.json(
        { error: message },
        { status: res.status >= 400 && res.status < 600 ? res.status : 502 },
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json(
      {
        error:
          message.includes("fetch") || message.includes("ECONNREFUSED")
            ? "Cannot reach NestNow. Is it running? (npm run start:server in NestNow)"
            : message,
      },
      { status: 503 },
    );
  }
}

