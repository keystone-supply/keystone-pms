/**
 * One-off: replace all `projects` rows from Book1.csv (repo root).
 * Requires: npm run db:push (migration with project_status + text project_number + unique index)
 * Env: .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE
 *
 * Usage: npx tsx scripts/import-book1.ts
 * Optional: BOOK1_CSV=./path/to.csv
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: path.join(process.cwd(), ".env.local") });

const NIL = "00000000-0000-0000-0000-000000000000";

function parseMoney(raw: string | undefined): number {
  if (raw == null || raw === "") return 0;
  const s = String(raw).replace(/[$,\s]/g, "").trim();
  if (!s || s === "-" || s === "-$") return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function parseUsShortDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t || /^N\/A$/i.test(t)) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t);
  if (!m) return null;
  let y = parseInt(m[3], 10);
  if (y < 100) y += 2000;
  const mo = parseInt(m[1], 10);
  const d = parseInt(m[2], 10);
  const dt = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function extractBaseKey(projectNumRaw: string): string {
  const m = /^(\d+)/.exec(String(projectNumRaw ?? "").trim());
  return m ? m[1] : String(projectNumRaw ?? "").trim();
}

function normApproval(raw: string | undefined): string {
  const u = (raw || "").trim().toUpperCase();
  if (["PENDING", "ACCEPTED", "REJECTED", "CANCELLED"].includes(u)) return u;
  return "PENDING";
}

function mapLifecycle(projectCompleteCol: string | undefined): {
  project_complete: boolean;
  project_status: "in_process" | "done" | "cancelled" | null;
} {
  const v = (projectCompleteCol || "").trim().toUpperCase();
  if (v === "DONE") return { project_complete: true, project_status: "done" };
  if (v === "CANCELLED")
    return { project_complete: false, project_status: "cancelled" };
  if (v === "IN PROCESS")
    return { project_complete: false, project_status: "in_process" };
  return { project_complete: false, project_status: null };
}

function rowToPayload(
  row: Record<string, string>,
  project_number: string,
): Record<string, unknown> {
  const { project_complete, project_status } = mapLifecycle(
    row["PROJECT COMPLETE"],
  );

  const created_at = parseUsShortDate(row["CUSTOMER RFQ"]);

  return {
    project_number,
    customer: (row["CUSTOMER"] || "").trim().toUpperCase() || "UNKNOWN",
    project_name: (row["PROJECT NAME"] || "").trim().toUpperCase() || "UNNAMED",
    supply_industrial: (row["SUPPLY / INDUSTRIAL"] || "SUPPLY")
      .trim()
      .toUpperCase(),
    customer_approval: normApproval(row["CUSTOMER APPROVAL"]),
    customer_po: (row["CUSTOMER PO #"] || "").trim() || null,
    project_complete,
    project_status,
    materials_quoted: parseMoney(row["MATERIALS QUOTED"]),
    labor_quoted: parseMoney(row["LABOR QUOTED"]),
    engineering_quoted: parseMoney(row["ENGINEERING QUOTED"]),
    equipment_quoted: parseMoney(row["EQUIPMENT QUOTED"]),
    logistics_quoted: parseMoney(row["LOGISTICS QUOTED"]),
    taxes_quoted: parseMoney(row["TAXES QUOTED"]),
    material_cost: parseMoney(row["MATERIAL COST"]),
    labor_cost: parseMoney(row["LABOR COST"]),
    engineering_cost: parseMoney(row["ENGINEERING COST"]),
    equipment_cost: parseMoney(row["EQUIPMENT COST"]),
    logistics_cost: parseMoney(row["LOGISTICS COST"]),
    additional_costs: parseMoney(row["ADDITIONAL COSTS"]),
    total_quoted: parseMoney(row["TOTAL QUOTED"]),
    invoiced_amount: parseMoney(row["INVOICED AMOUNT"]),
    ...(created_at ? { created_at } : {}),
  };
}

async function main() {
  const csvPath =
    process.env.BOOK1_CSV || path.join(process.cwd(), "Book1.csv");
  if (!existsSync(csvPath)) {
    console.error("Missing CSV:", csvPath);
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) {
    console.error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE in .env.local",
    );
    process.exit(1);
  }

  const buf = readFileSync(csvPath, "utf8");
  const rows = parse(buf, {
    columns: (header: string[]) => header.map((h) => h.trim()),
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const byBase = new Map<string, number[]>();
  rows.forEach((row, idx) => {
    const base = extractBaseKey(row["PROJECT #"] || "");
    if (!base) {
      console.warn("Skipping row without project #, index", idx);
      return;
    }
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base)!.push(idx);
  });

  const projectNumberByIndex = new Map<number, string>();
  for (const [, indices] of byBase) {
    indices.forEach((rowIdx, i) => {
      const base = extractBaseKey(rows[rowIdx]["PROJECT #"] || "");
      const num = i === 0 ? base : `${base}-${i + 1}`;
      projectNumberByIndex.set(rowIdx, num);
    });
  }

  const payloads: Record<string, unknown>[] = [];
  rows.forEach((row, idx) => {
    const pn = projectNumberByIndex.get(idx);
    if (!pn) return;
    payloads.push(rowToPayload(row, pn));
  });

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("Deleting existing projects…");
  const { error: delErr } = await client
    .from("projects")
    .delete()
    .neq("id", NIL);
  if (delErr) {
    console.error("Delete failed:", delErr.message);
    process.exit(1);
  }

  const chunk = 150;
  for (let i = 0; i < payloads.length; i += chunk) {
    const part = payloads.slice(i, i + chunk);
    const { error } = await client.from("projects").insert(part);
    if (error) {
      console.error(`Insert chunk ${i} failed:`, error.message);
      process.exit(1);
    }
    console.log(`Inserted ${Math.min(i + chunk, payloads.length)} / ${payloads.length}`);
  }

  console.log("Done. Rows:", payloads.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
