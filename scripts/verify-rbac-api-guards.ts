type GuardCheck = {
  name: string;
  path: string;
  method: "GET" | "POST";
  expectedStatuses: readonly number[];
  body?: string;
};

function normalizeBaseUrl(input: string): string {
  return input.endsWith("/") ? input.slice(0, -1) : input;
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

  console.log("RBAC API guard verification passed.");
}

void main();
