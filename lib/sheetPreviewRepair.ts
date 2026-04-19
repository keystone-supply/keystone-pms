import { buildSheetPreviewSvgMarkup } from "@/lib/sheetPreviewGeometry";
import { adminSupabase } from "@/lib/supabaseAdmin";

const SHEET_PREVIEW_BUCKET = "sheet-previews";

type ClaimedPreviewRepairJob = {
  job_id: number;
  sheet_stock_id: string;
  svg_path: string | null;
  length_in: number | null;
  width_in: number | null;
  attempts: number;
};

export type SheetPreviewRepairRunOptions = {
  limit?: number;
  retrySeconds?: number;
  workerId?: string;
};

export type SheetPreviewRepairRunResult = {
  claimed: number;
  succeeded: number;
  failed: number;
  deadLettered: number;
};

export function normalizeSheetPreviewRepairLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return 25;
  return Math.max(1, Math.min(200, Math.trunc(value as number)));
}

export function toSheetPreviewObjectPath(sheetStockId: string): string {
  return `${sheetStockId}.svg`;
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "unknown_error";
}

async function markPreviewRepairJob(
  jobId: number,
  success: boolean,
  errorMessage: string | null,
  retrySeconds: number,
): Promise<void> {
  if (!adminSupabase) return;

  const { error } = await adminSupabase.rpc("finish_sheet_preview_repair_job", {
    p_job_id: jobId,
    p_success: success,
    p_error: errorMessage,
    p_retry_seconds: retrySeconds,
  });

  if (error) {
    throw new Error(`finish_sheet_preview_repair_job failed: ${error.message}`);
  }
}

async function processPreviewRepairJob(
  job: ClaimedPreviewRepairJob,
  retrySeconds: number,
): Promise<"succeeded" | "failed" | "dead_letter"> {
  if (!adminSupabase) {
    throw new Error("SUPABASE service role is not configured.");
  }

  try {
    const svgResult = buildSheetPreviewSvgMarkup({
      svg_path: job.svg_path ?? "",
      length_in: Number(job.length_in ?? 0),
      width_in: Number(job.width_in ?? 0),
    });
    if (!svgResult.ok) {
      throw new Error(svgResult.reason);
    }

    const objectPath = toSheetPreviewObjectPath(job.sheet_stock_id);
    const { error: uploadError } = await adminSupabase.storage
      .from(SHEET_PREVIEW_BUCKET)
      .upload(objectPath, Buffer.from(svgResult.svg, "utf-8"), {
        upsert: true,
        contentType: "image/svg+xml",
        cacheControl: "3600",
      });
    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: publicUrlData } = adminSupabase.storage
      .from(SHEET_PREVIEW_BUCKET)
      .getPublicUrl(objectPath);
    const publicUrl = publicUrlData?.publicUrl?.trim();
    if (!publicUrl) {
      throw new Error("public_url_missing");
    }

    const { error: updateError } = await adminSupabase
      .from("sheet_stock")
      .update({ img_url: publicUrl })
      .eq("id", job.sheet_stock_id);
    if (updateError) {
      throw new Error(updateError.message);
    }

    await markPreviewRepairJob(job.job_id, true, null, retrySeconds);
    return "succeeded";
  } catch (error) {
    await markPreviewRepairJob(job.job_id, false, asErrorMessage(error), retrySeconds);
    return job.attempts >= 5 ? "dead_letter" : "failed";
  }
}

export async function processSheetPreviewRepairQueue(
  options: SheetPreviewRepairRunOptions = {},
): Promise<SheetPreviewRepairRunResult> {
  if (!adminSupabase) {
    throw new Error("SUPABASE service role is not configured.");
  }

  const limit = normalizeSheetPreviewRepairLimit(options.limit);
  const retrySeconds = Math.max(10, Math.trunc(options.retrySeconds ?? 300));
  const workerId = options.workerId?.trim() || `server:${Date.now()}`;

  const { data, error } = await adminSupabase.rpc("claim_sheet_preview_repair_jobs", {
    p_limit: limit,
    p_worker: workerId,
  });
  if (error) {
    throw new Error(`claim_sheet_preview_repair_jobs failed: ${error.message}`);
  }

  const jobs = Array.isArray(data) ? (data as ClaimedPreviewRepairJob[]) : [];
  const result: SheetPreviewRepairRunResult = {
    claimed: jobs.length,
    succeeded: 0,
    failed: 0,
    deadLettered: 0,
  };

  for (const job of jobs) {
    const state = await processPreviewRepairJob(job, retrySeconds);
    switch (state) {
      case "succeeded":
        result.succeeded += 1;
        break;
      case "failed":
        result.failed += 1;
        break;
      case "dead_letter":
        result.deadLettered += 1;
        break;
      default: {
        const unreachable: never = state;
        throw new Error(`Unexpected repair state: ${String(unreachable)}`);
      }
    }
  }

  return result;
}

export async function enqueueMissingSheetPreviewRepairs(limit = 5000): Promise<number> {
  if (!adminSupabase) {
    throw new Error("SUPABASE service role is not configured.");
  }

  const normalizedLimit = Math.max(1, Math.min(50000, Math.trunc(limit)));
  const { data, error } = await adminSupabase.rpc("enqueue_missing_sheet_preview_repairs", {
    p_limit: normalizedLimit,
  });
  if (error) {
    throw new Error(`enqueue_missing_sheet_preview_repairs failed: ${error.message}`);
  }
  return Number(data ?? 0);
}
