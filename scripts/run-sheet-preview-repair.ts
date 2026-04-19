import {
  enqueueMissingSheetPreviewRepairs,
  processSheetPreviewRepairQueue,
} from "@/lib/sheetPreviewRepair";

type CliArgs = {
  limit?: number;
  retrySeconds?: number;
  backfill: boolean;
  backfillLimit?: number;
};

function readNumberFlag(name: string): number | undefined {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return undefined;
  const value = Number(process.argv[idx + 1]);
  return Number.isFinite(value) ? value : undefined;
}

function readArgs(): CliArgs {
  return {
    limit: readNumberFlag("--limit"),
    retrySeconds: readNumberFlag("--retry-seconds"),
    backfill: process.argv.includes("--backfill"),
    backfillLimit: readNumberFlag("--backfill-limit"),
  };
}

async function main() {
  const args = readArgs();

  let enqueued = 0;
  if (args.backfill) {
    enqueued = await enqueueMissingSheetPreviewRepairs(args.backfillLimit ?? 5000);
  }

  const result = await processSheetPreviewRepairQueue({
    limit: args.limit,
    retrySeconds: args.retrySeconds,
    workerId: "script:run-sheet-preview-repair",
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        enqueued,
        ...result,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : "Sheet preview repair script failed.";
  console.error(message);
  process.exitCode = 1;
});
