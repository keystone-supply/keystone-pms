/**
 * Sales command board: dnd-kit drop ids and Supabase row patches after a column move.
 * Column classification lives in salesCommandBoardColumn.ts (shared with metrics).
 */

import type { DashboardProjectRow } from "@/lib/dashboardMetrics";
import { boardColumnForProject, type SalesProjectColumn } from "@/lib/salesCommandBoardColumn";
import type { ProjectRow } from "@/lib/projectTypes";

export type { SalesProjectColumn };

export type SalesBoardMoveTarget = SalesProjectColumn;

export { boardColumnForProject };

/** Droppable ids for dnd-kit (project pipeline + terminal zones). */
export const SALES_BOARD_DROP = {
  rfq_customer: "sb-rfq",
  rfq_vendors: "sb-vendors",
  quote_sent: "sb-quote",
  po_issued: "sb-po",
  in_process: "sb-wip",
  complete: "sb-complete",
  delivered: "sb-delivered",
  invoiced: "sb-invoiced",
  lost: "sb-lost",
  cancelled: "sb-cancelled",
} as const;

export type SalesBoardDropId =
  (typeof SALES_BOARD_DROP)[keyof typeof SALES_BOARD_DROP];

function toProjectRow(p: DashboardProjectRow): ProjectRow {
  return { ...p } as ProjectRow;
}

/**
 * Stage is the single lifecycle source of truth.
 * DB trigger stamps stage timestamps; app writes only `sales_command_stage`.
 */
export function rowAfterMoveToColumn(
  row: DashboardProjectRow,
  target: SalesBoardMoveTarget,
): ProjectRow {
  return {
    ...toProjectRow(row),
    sales_command_stage: target,
  };
}

/** Effective drag target for a row. */
export function moveTargetFromRow(row: DashboardProjectRow): SalesBoardMoveTarget {
  return boardColumnForProject(row);
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
    case SALES_BOARD_DROP.lost:
      return "lost";
    case SALES_BOARD_DROP.cancelled:
      return "cancelled";
    default:
      return null;
  }
}
