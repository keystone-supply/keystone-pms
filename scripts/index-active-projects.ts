import "dotenv/config";

import { createClient } from "@supabase/supabase-js";

type Mode = "dogfood" | "all";

function parseMode(argv: string[]): Mode {
  if (argv.includes("--all")) return "all";
  return "dogfood";
}

function parseLimit(argv: string[]): number {
  const flag = argv.find((value) => value.startsWith("--limit="));
  if (!flag) return 10;
  const parsed = Number(flag.split("=")[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return 10;
  return Math.floor(parsed);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRole =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? "";
  if (!url || !serviceRole) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  }
  const mode = parseMode(process.argv.slice(2));
  const limit = parseLimit(process.argv.slice(2));
  const client = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  let query = client
    .from("projects")
    .select("id,project_number,project_name,project_status")
    .or("project_status.is.null,project_status.eq.in_process")
    .order("created_at", { ascending: false });

  if (mode === "dogfood") {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (rows.length === 0) {
    console.log("No active projects found.");
    return;
  }

  const ids = rows.map((row) => row.id as string);
  const { error: updateError } = await client
    .from("projects")
    .update({ files_phase1_enabled: true })
    .in("id", ids);
  if (updateError) throw new Error(updateError.message);

  console.log(
    `Enabled files_phase1_enabled for ${ids.length} active projects (${mode}).`,
  );
  for (const row of rows) {
    const projectNumber = String((row as { project_number?: string | null }).project_number ?? "");
    const projectName = String((row as { project_name?: string | null }).project_name ?? "");
    console.log(`- ${projectNumber} ${projectName}`.trim());
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(message);
  process.exit(1);
});
