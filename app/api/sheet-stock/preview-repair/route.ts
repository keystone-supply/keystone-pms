import { NextRequest, NextResponse } from "next/server";

import { requireApiRole } from "@/lib/auth/api-guard";
import { canManageSheetStock } from "@/lib/auth/roles";
import {
  enqueueMissingSheetPreviewRepairs,
  processSheetPreviewRepairQueue,
} from "@/lib/sheetPreviewRepair";

type RepairRequestBody = {
  limit?: number;
  retrySeconds?: number;
  backfill?: boolean;
  backfillLimit?: number;
};

export async function POST(request: NextRequest) {
  const authResult = await requireApiRole(
    request,
    canManageSheetStock,
    "Your role cannot repair sheet previews.",
  );
  if (!authResult.ok) return authResult.response;

  let body: RepairRequestBody = {};
  try {
    body = (await request.json()) as RepairRequestBody;
  } catch {
    body = {};
  }

  try {
    let enqueued = 0;
    if (body.backfill) {
      enqueued = await enqueueMissingSheetPreviewRepairs(body.backfillLimit ?? 5000);
    }

    const result = await processSheetPreviewRepairQueue({
      limit: body.limit,
      retrySeconds: body.retrySeconds,
      workerId: `api:${authResult.context.email}`,
    });

    return NextResponse.json({
      ok: true,
      enqueued,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Preview repair processing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
