import {
  type DashboardProjectRow,
  STALE_QUOTE_DAYS,
  estimatedMarginPctQuoted,
  isCancelledProject,
} from "@/lib/dashboardMetrics";

const MS_PER_DAY = 86400000;

/**
 * Compact lifecycle / health label for project list (PM-style status).
 * Aligns with dashboard “needs attention” rules where applicable.
 */
export function projectRowHealth(
  p: DashboardProjectRow,
  now: Date = new Date(),
): string {
  if (p.project_complete) return "Complete";

  if (isCancelledProject(p)) return "Cancelled";

  const approval = p.customer_approval || "";
  if (approval === "REJECTED") return "Rejected";

  if (approval === "PENDING" && p.created_at) {
    const ageDays =
      (now.getTime() - new Date(p.created_at).getTime()) / MS_PER_DAY;
    if (ageDays >= STALE_QUOTE_DAYS) return "Stale quote";
    return "Pending approval";
  }

  const est = estimatedMarginPctQuoted(p);
  if (est !== null && est < 15 && (p.total_quoted || 0) > 0) {
    return "Low quoted margin";
  }

  return "In progress";
}
