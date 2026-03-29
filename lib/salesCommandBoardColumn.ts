/**
 * Classify projects into sales command board columns (single source for UI + metrics).
 *
 * Canonical fields (avoid drifting sheet-era vs board-era data):
 * - Customer quote outcome: `customer_approval`.
 * - Pipeline position: `sales_command_stage` and milestone `*_at` timestamps (board updates in `lib/salesBoard.ts`).
 * - Ops sheet parity: `project_status` and `project_complete` — align on save via
 *   `normalizeProjectLifecycle` / `syncLifecycleFromNonLostStage` in `lib/projectTypes.ts`.
 * When `sales_command_stage` is null, `inferLegacyBoardColumn` mirrors the SQL backfill in migrations.
 *
 * Type-only imports from dashboardMetrics to avoid runtime circular deps.
 */

import type { DashboardProjectRow } from "@/lib/dashboardMetrics";

export type SalesProjectColumn =
  | "rfq_customer"
  | "rfq_vendors"
  | "quote_sent"
  | "po_issued"
  | "in_process"
  | "complete"
  | "delivered"
  | "invoiced"
  | "lost";

export const SALES_PROJECT_COLUMNS: readonly SalesProjectColumn[] = [
  "rfq_customer",
  "rfq_vendors",
  "quote_sent",
  "po_issued",
  "in_process",
  "complete",
  "delivered",
  "invoiced",
  "lost",
] as const;

/** Labels for metrics / admin (matches command board). */
export const PIPELINE_STAGE_LABELS: Record<SalesProjectColumn, string> = {
  rfq_customer: "RFQ (customer)",
  rfq_vendors: "RFQ → vendors",
  quote_sent: "Quote sent",
  po_issued: "Customer PO",
  in_process: "In process",
  complete: "Complete",
  delivered: "Delivered",
  invoiced: "Invoiced",
  lost: "Lost",
};

const STAGE_SET = new Set<string>(SALES_PROJECT_COLUMNS);

export function isLostProject(p: DashboardProjectRow): boolean {
  const approval = String(p.customer_approval || "").toUpperCase();
  return (
    p.project_status === "cancelled" ||
    approval === "CANCELLED" ||
    approval === "REJECTED"
  );
}

function normalizeStage(
  raw: string | null | undefined,
): SalesProjectColumn | null {
  if (raw == null || String(raw).trim() === "") return null;
  const s = String(raw).trim();
  if (STAGE_SET.has(s)) return s as SalesProjectColumn;
  return null;
}

/** When sales_command_stage is null, derive column from legacy fields (matches SQL backfill). */
export function inferLegacyBoardColumn(p: DashboardProjectRow): SalesProjectColumn {
  const approval = String(p.customer_approval || "PENDING").toUpperCase();
  const quoted = p.total_quoted || 0;
  const invoiced = p.invoiced_amount || 0;
  const isDone = !!(p.project_complete || p.project_status === "done");

  if (invoiced > 0 && isDone) return "invoiced";
  if (isDone) return "complete";
  if (approval === "ACCEPTED") return "in_process";
  if (quoted > 0 && approval === "PENDING") return "quote_sent";
  return "rfq_customer";
}

export function boardColumnForProject(p: DashboardProjectRow): SalesProjectColumn {
  if (isLostProject(p)) return "lost";
  const normalized = normalizeStage(p.sales_command_stage);
  if (normalized && normalized !== "lost") return normalized;
  return inferLegacyBoardColumn(p);
}
