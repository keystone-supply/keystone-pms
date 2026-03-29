/**
 * Sales command board: dnd-kit drop ids and Supabase row patches after a column move.
 * Column classification lives in salesCommandBoardColumn.ts (shared with metrics).
 */

import type { DashboardProjectRow } from "@/lib/dashboardMetrics";
import { boardColumnForProject, type SalesProjectColumn } from "@/lib/salesCommandBoardColumn";
import { normalizeProjectLifecycle, type ProjectRow } from "@/lib/projectTypes";

export type { SalesProjectColumn };

/** Drag target includes two Lost drop zones (rejected vs cancelled). */
export type SalesBoardMoveTarget =
  | Exclude<SalesProjectColumn, "lost">
  | "lost_rejected"
  | "lost_cancelled";

export { boardColumnForProject };

/** Droppable ids for dnd-kit (project pipeline + lost zones). */
export const SALES_BOARD_DROP = {
  rfq_customer: "sb-rfq",
  rfq_vendors: "sb-vendors",
  quote_sent: "sb-quote",
  po_issued: "sb-po",
  in_process: "sb-wip",
  complete: "sb-complete",
  delivered: "sb-delivered",
  invoiced: "sb-invoiced",
  lost_rejected: "sb-lost-rejected",
  lost_cancelled: "sb-lost-cancelled",
} as const;

export type SalesBoardDropId =
  (typeof SALES_BOARD_DROP)[keyof typeof SALES_BOARD_DROP];

function toProjectRow(p: DashboardProjectRow): ProjectRow {
  return { ...p } as ProjectRow;
}

function stamp(
  row: ProjectRow,
  key: keyof ProjectRow,
  iso: string,
): void {
  const cur = row[key];
  if (cur == null || String(cur).trim() === "") {
    (row as Record<string, unknown>)[key as string] = iso;
  }
}

/**
 * Apply column semantics to a row, stamp milestone timestamps once, then normalize lifecycle.
 */
export function rowAfterMoveToColumn(
  row: DashboardProjectRow,
  target: SalesBoardMoveTarget,
  now: Date = new Date(),
): ProjectRow {
  const iso = now.toISOString();
  const next: ProjectRow = { ...toProjectRow(row) };

  const clearLostStatus = () => {
    if (next.project_status === "cancelled") {
      next.project_status = "in_process";
    }
  };

  switch (target) {
    case "rfq_customer":
      next.sales_command_stage = "rfq_customer";
      next.customer_approval = "PENDING";
      next.project_complete = false;
      clearLostStatus();
      if (next.project_status === "done") next.project_status = "in_process";
      break;

    case "rfq_vendors":
      next.sales_command_stage = "rfq_vendors";
      stamp(next, "rfq_vendors_sent_at", iso);
      next.customer_approval = "PENDING";
      next.project_complete = false;
      clearLostStatus();
      if (next.project_status === "done") next.project_status = "in_process";
      break;

    case "quote_sent":
      next.sales_command_stage = "quote_sent";
      stamp(next, "quote_sent_at", iso);
      next.customer_approval = "PENDING";
      next.project_complete = false;
      clearLostStatus();
      if (next.project_status === "done") next.project_status = "in_process";
      break;

    case "po_issued":
      next.sales_command_stage = "po_issued";
      stamp(next, "po_issued_at", iso);
      next.customer_approval = "ACCEPTED";
      next.project_complete = false;
      clearLostStatus();
      if (next.project_status === "done") next.project_status = "in_process";
      break;

    case "in_process":
      next.sales_command_stage = "in_process";
      stamp(next, "in_process_at", iso);
      next.customer_approval = "ACCEPTED";
      next.project_complete = false;
      clearLostStatus();
      next.project_status = "in_process";
      break;

    case "complete":
      next.sales_command_stage = "complete";
      stamp(next, "completed_at", iso);
      next.customer_approval = "ACCEPTED";
      clearLostStatus();
      next.project_status = "done";
      break;

    case "delivered":
      next.sales_command_stage = "delivered";
      stamp(next, "delivered_at", iso);
      next.customer_approval = "ACCEPTED";
      clearLostStatus();
      break;

    case "invoiced":
      next.sales_command_stage = "invoiced";
      stamp(next, "invoiced_at", iso);
      next.customer_approval = "ACCEPTED";
      clearLostStatus();
      break;

    case "lost_rejected":
      next.sales_command_stage = "lost";
      next.customer_approval = "REJECTED";
      next.project_complete = false;
      if (next.project_status === "cancelled") {
        next.project_status = "in_process";
      }
      break;

    case "lost_cancelled":
      next.sales_command_stage = "lost";
      next.customer_approval = "CANCELLED";
      next.project_complete = false;
      if (next.project_status === "cancelled") {
        next.project_status = "in_process";
      }
      break;

    default:
      break;
  }

  return normalizeProjectLifecycle(next);
}

/** Effective drag target for a row (lost is split into rejected vs cancelled). */
export function moveTargetFromRow(row: DashboardProjectRow): SalesBoardMoveTarget {
  const col = boardColumnForProject(row);
  if (col !== "lost") {
    return col as Exclude<SalesProjectColumn, "lost">;
  }
  const a = String(row.customer_approval || "").toUpperCase();
  if (a === "CANCELLED" || row.project_status === "cancelled") {
    return "lost_cancelled";
  }
  return "lost_rejected";
}

export function dropIdToMoveTarget(
  id: string | undefined | null,
): SalesBoardMoveTarget | null {
  if (!id) return null;
  switch (id) {
    case SALES_BOARD_DROP.rfq_customer:
      return "rfq_customer";
    case SALES_BOARD_DROP.rfq_vendors:
      return "rfq_vendors";
    case SALES_BOARD_DROP.quote_sent:
      return "quote_sent";
    case SALES_BOARD_DROP.po_issued:
      return "po_issued";
    case SALES_BOARD_DROP.in_process:
      return "in_process";
    case SALES_BOARD_DROP.complete:
      return "complete";
    case SALES_BOARD_DROP.delivered:
      return "delivered";
    case SALES_BOARD_DROP.invoiced:
      return "invoiced";
    case SALES_BOARD_DROP.lost_rejected:
      return "lost_rejected";
    case SALES_BOARD_DROP.lost_cancelled:
      return "lost_cancelled";
    default:
      return null;
  }
}
