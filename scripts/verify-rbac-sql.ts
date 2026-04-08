import { createClient } from "@supabase/supabase-js";

type AuditRow = {
  check_name: string;
  ok: boolean;
  detail: string;
};

function fail(message: string): never {
  console.error(`RBAC SQL verification failed: ${message}`);
  process.exit(1);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;

  if (!url) fail("NEXT_PUBLIC_SUPABASE_URL is required.");
  if (!serviceRoleKey) fail("SUPABASE_SERVICE_ROLE_KEY is required.");

  const client = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await client.rpc("rbac_policy_audit");
  if (error) {
    fail(error.message ?? "Could not run rbac_policy_audit().");
  }

  const rows = (Array.isArray(data) ? data : []) as AuditRow[];
  if (rows.length === 0) {
    fail("rbac_policy_audit() returned no checks.");
  }

  let hasFailure = false;
  for (const row of rows) {
    const icon = row.ok ? "PASS" : "FAIL";
    console.log(`[${icon}] ${row.check_name} :: ${row.detail}`);
    if (!row.ok) {
      hasFailure = true;
    }
  }

  if (hasFailure) {
    process.exit(1);
  }

  console.log("RBAC SQL verification passed.");
}

void main();
