/**
 * Classify projects into sales command board columns (single source for UI + metrics).
 *
 * Lifecycle is now represented only by `sales_command_stage`.
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
  | "lost"
  | "cancelled";

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
  "cancelled",
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
  lost: "Lost (rejected)",
  cancelled: "Cancelled",
};

const STAGE_SET = new Set<string>(SALES_PROJECT_COLUMNS);

export function isLostProject(p: DashboardProjectRow): boolean {
  return p.sales_command_stage === "lost";
}

export function isCancelledProject(p: DashboardProjectRow): boolean {
  return p.sales_command_stage === "cancelled";
}

export function boardColumnForProject(p: DashboardProjectRow): SalesProjectColumn {
  const stage = p.sales_command_stage;
  if (stage && STAGE_SET.has(stage)) return stage as SalesProjectColumn;
  return "rfq_customer";
}
