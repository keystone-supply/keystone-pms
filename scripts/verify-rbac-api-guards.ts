import { readFile } from "node:fs/promises";
import { join } from "node:path";

type GuardCheck = {
  name: string;
  path: string;
  method: "GET" | "POST";
  expectedStatuses: readonly number[];
  body?: string;
};

type StaticGuardCheck = {
  name: string;
  path: string;
  requiredPattern: RegExp;
};

function normalizeBaseUrl(input: string): string {
  return input.endsWith("/") ? input.slice(0, -1) : input;
}

async function runStaticGuardChecks(): Promise<boolean> {
  const checks: StaticGuardCheck[] = [
    {
      name: "admin users route has guard",
      path: "app/api/admin/users/route.ts",
      requiredPattern: /requireApiCapability|requireApiRole/,
    },
    {
      name: "admin user detail route has guard",
      path: "app/api/admin/users/[id]/route.ts",
      requiredPattern: /requireApiCapability|requireApiRole/,
    },
    {
      name: "admin user capabilities route has guard",
      path: "app/api/admin/users/[id]/capabilities/route.ts",
      requiredPattern: /requireApiCapability|requireApiRole/,
    },
    {
      name: "admin project access route has guard",
      path: "app/api/admin/users/[id]/project-access/route.ts",
      requiredPattern: /requireApiCapability|requireApiRole/,
    },
  ];

  let hasFailure = false;
  for (const check of checks) {
    const absolutePath = join(process.cwd(), check.path);
    const content = await readFile(absolutePath, "utf8").catch(() => "");
    const ok = check.requiredPattern.test(content);
    console.log(
      `[${ok ? "PASS" : "FAIL"}] ${check.name} :: ${check.path}`,
    );
    if (!ok) hasFailure = true;
  }
  return !hasFailure;
}

async function main() {
  const baseUrl = normalizeBaseUrl(
    process.env.RBAC_VERIFY_BASE_URL ?? "http://127.0.0.1:3000",
  );

  const checks: GuardCheck[] = [
    {
      name: "supabase token unauth denied",
      path: "/api/auth/supabase-token",
      method: "GET",
      expectedStatuses: [401],
    },
    {
      name: "tv summary unauth denied",
      path: "/api/tv/summary",
      method: "GET",
      expectedStatuses: [401],
    },
    {
      name: "nest run unauth denied",
      path: "/api/nest",
      method: "POST",
      expectedStatuses: [401],
      body: JSON.stringify({}),
    },
    {
      name: "nest progress unauth denied",
      path: "/api/nest/progress",
      method: "GET",
      expectedStatuses: [401],
    },
    {
      name: "nest stop unauth denied",
      path: "/api/nest/stop",
      method: "POST",
      expectedStatuses: [401],
    },
  ];

  let hasFailure = false;
  for (const check of checks) {
    const response = await fetch(`${baseUrl}${check.path}`, {
      method: check.method,
      headers: check.body
        ? {
            "Content-Type": "application/json",
          }
        : undefined,
      body: check.body,
    }).catch((error: unknown) => {
      hasFailure = true;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[FAIL] ${check.name} :: request error :: ${message}`);
      return null;
    });

    if (!response) continue;

    const ok = check.expectedStatuses.includes(response.status);
    console.log(
      `[${ok ? "PASS" : "FAIL"}] ${check.name} :: status=${response.status} expected=${check.expectedStatuses.join("/")}`,
    );
    if (!ok) {
      hasFailure = true;
    }
  }

  if (hasFailure) {
    process.exit(1);
  }

  const staticChecksOk = await runStaticGuardChecks();
  if (!staticChecksOk) {
    process.exit(1);
  }

  console.log("RBAC API guard verification passed.");
}

void main();
