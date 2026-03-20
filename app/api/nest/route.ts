import { NextRequest, NextResponse } from "next/server";

const NESTNOW_URL =
  process.env.NESTNOW_URL || "http://127.0.0.1:3001";

/** Allow long NestNow runs when the platform honors this (e.g. Vercel). */
export const maxDuration = 3600;

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
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
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
