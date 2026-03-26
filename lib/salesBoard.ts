/**
 * Sales command board: classify projects into columns and compute Supabase patches.
 * Priority when fields conflict: no_bid (cancelled / rejected / lost) beats done beats active pipeline.
 */

import type { DashboardProjectRow } from "@/lib/dashboardMetrics";
import { isCancelledProject } from "@/lib/dashboardMetrics";
import { normalizeProjectLifecycle, type ProjectRow } from "@/lib/projectTypes";

export type SalesProjectColumn =
  | "quoted_pending"
  | "won_wip"
  | "done"
  | "no_bid";

/** Droppable ids for dnd-kit (projects + CRM qualify lane). */
export const SALES_BOARD_DROP = {
  touch: "sb-touch",
  qualify: "sb-qualify",
  quoted_pending: "sb-quoted",
  won_wip: "sb-won",
  done: "sb-done",
  no_bid: "sb-nobid",
} as const;

export type SalesBoardDropId =
  (typeof SALES_BOARD_DROP)[keyof typeof SALES_BOARD_DROP];

const MS_DAY = 86400000;

export function followUpBucket(
  followUpAt: string | null,
  now: Date,
): "overdue" | "week" | null {
  if (!followUpAt) return null;
  const t = new Date(followUpAt).getTime();
  if (Number.isNaN(t)) return null;
  if (t < now.getTime()) return "overdue";
  if (t <= now.getTime() + 7 * MS_DAY) return "week";
  return null;
}

/** Touch column: prospects ∪ accounts with follow-up overdue or within 7 days. */
export function isTouchBaseCustomer(
  c: { status: string; follow_up_at: string | null },
  now: Date,
): boolean {
  if (c.status === "prospect") return true;
  return followUpBucket(c.follow_up_at, now) !== null;
}

export function touchBaseSortKey(
  c: { status: string; follow_up_at: string | null; legal_name: string },
  now: Date,
): [number, number, string] {
  const bucket = followUpBucket(c.follow_up_at, now);
  const tier =
    bucket === "overdue" ? 0 : bucket === "week" ? 1 : c.status === "prospect" ? 2 : 3;
  const t = c.follow_up_at ? new Date(c.follow_up_at).getTime() : Number.POSITIVE_INFINITY;
  return [tier, Number.isNaN(t) ? Number.POSITIVE_INFINITY : t, c.legal_name];
}

export function boardColumnForProject(p: DashboardProjectRow): SalesProjectColumn {
  const approval = String(p.customer_approval || "PENDING").toUpperCase();

  if (isCancelledProject(p) || approval === "REJECTED" || approval === "CANCELLED") {
    return "no_bid";
  }
  if (p.project_complete || p.project_status === "done") {
    return "done";
  }
  if (approval === "ACCEPTED") {
    return "won_wip";
  }
  return "quoted_pending";
}

function toProjectRow(p: DashboardProjectRow): ProjectRow {
  return { ...p } as ProjectRow;
}

/**
 * Apply column semantics to a row, then align complete flag with status (project detail contract).
 */
export function rowAfterMoveToColumn(
  row: DashboardProjectRow,
  target: SalesProjectColumn,
): ProjectRow {
  let next: ProjectRow = { ...toProjectRow(row) };

  switch (target) {
    case "quoted_pending":
      next.customer_approval = "PENDING";
      next.project_complete = false;
      if (next.project_status === "done" || next.project_status === "cancelled") {
        next.project_status = "in_process";
      }
      break;
    case "won_wip":
      next.customer_approval = "ACCEPTED";
      next.project_complete = false;
      if (next.project_status === "done" || next.project_status === "cancelled") {
        next.project_status = "in_process";
      }
      break;
    case "done":
      if (
        next.customer_approval === "REJECTED" ||
        next.customer_approval === "CANCELLED"
      ) {
        next.customer_approval = "ACCEPTED";
      }
      next.project_status = "done";
      break;
    case "no_bid":
      next.customer_approval = "REJECTED";
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

export function dropIdToProjectColumn(
  id: string | undefined | null,
): SalesProjectColumn | null {
  if (!id) return null;
  switch (id) {
    case SALES_BOARD_DROP.quoted_pending:
      return "quoted_pending";
    case SALES_BOARD_DROP.won_wip:
      return "won_wip";
    case SALES_BOARD_DROP.done:
      return "done";
    case SALES_BOARD_DROP.no_bid:
      return "no_bid";
    default:
      return null;
  }
}
