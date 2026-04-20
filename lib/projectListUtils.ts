import {
  type DashboardProjectRow,
  STALE_QUOTE_DAYS,
  estimatedMarginPctQuoted,
  isCancelledProject,
} from "@/lib/dashboardMetrics";
import {
  boardColumnForProject,
  isLostProject,
} from "@/lib/salesCommandBoardColumn";

const MS_PER_DAY = 86400000;

/**
 * Compact lifecycle / health label for project list (PM-style status).
 * Aligns with dashboard “needs attention” rules where applicable.
 */
export function projectRowHealth(
  p: DashboardProjectRow,
  now: Date = new Date(),
): string {
  if (boardColumnForProject(p) === "invoiced") return "Complete";

  if (isCancelledProject(p)) return "Cancelled";

  if (isLostProject(p)) return "Rejected";

  const stage = boardColumnForProject(p);
  const isOpenQuote =
    stage === "rfq_customer" || stage === "rfq_vendors" || stage === "quote_sent";
  if (isOpenQuote && p.created_at) {
    const ageDays =
      (now.getTime() - new Date(p.created_at).getTime()) / MS_PER_DAY;
    if (ageDays >= STALE_QUOTE_DAYS) return "Stale quote";
    return "Open quote";
  }

  const est = estimatedMarginPctQuoted(p);
  if (est !== null && est < 15 && (p.total_quoted || 0) > 0) {
    return "Low quoted margin";
  }

  return "In progress";
}
