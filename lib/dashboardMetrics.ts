/**
 * Dashboard KPIs derived from Supabase `projects` rows.
 * Definitions are documented inline so Finance / Sales interpret numbers consistently.
 */

import {
  boardColumnForProject,
  SALES_PROJECT_COLUMNS,
  type SalesProjectColumn,
} from "@/lib/salesCommandBoardColumn";
import { computeQuotedInternalCostTotal } from "@/lib/projectFinancials";

export type CustomerApproval =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "CANCELLED"
  | string;

/** Fields required for dashboard aggregation (subset of full project row). */
export type DashboardProjectRow = {
  id: string;
  project_number?: string | number | null;
  project_name?: string | null;
  customer?: string | null;
  customer_id?: string | null;
  customer_approval?: CustomerApproval | null;
  project_complete?: boolean | null;
  /** Ops lifecycle: in_process, done, cancelled (distinct from customer_approval). */
  project_status?: "in_process" | "done" | "cancelled" | string | null;
  supply_industrial?: string | null;
  created_at?: string | null;
  total_quoted?: number | null;
  invoiced_amount?: number | null;
  material_cost?: number | null;
  labor_cost?: number | null;
  engineering_cost?: number | null;
  equipment_cost?: number | null;
  logistics_cost?: number | null;
  additional_costs?: number | null;
  materials_vendor_cost?: number | null;
  material_markup_pct?: number | null;
  engineering_markup_pct?: number | null;
  equipment_markup_pct?: number | null;
  logistics_markup_pct?: number | null;
  materials_quoted?: number | null;
  labor_quoted?: number | null;
  labor_hours_quoted?: number | null;
  labor_cost_per_hr?: number | null;
  labor_sell_per_hr?: number | null;
  labor_hours_actual?: number | null;
  labor_cost_per_hr_actual?: number | null;
  engineering_quoted?: number | null;
  equipment_quoted?: number | null;
  logistics_quoted?: number | null;
  taxes_quoted?: number | null;
  sales_command_stage?: string | null;
  rfq_vendors_sent_at?: string | null;
  quote_sent_at?: string | null;
  po_issued_at?: string | null;
  in_process_at?: string | null;
  payment_received?: boolean | null;
  materials_ordered_at?: string | null;
  material_received_at?: string | null;
  labor_completed_at?: string | null;
  completed_at?: string | null;
  delivered_at?: string | null;
  invoiced_at?: string | null;
};

export type AttentionItem = {
  id: string;
  project_number: string;
  project_name: string;
  /** Free-text customer on the job row */
  customer: string;
  /** RFQ / job created time from `projects.created_at` */
  created_at: string | null;
  /** Human-readable reason shown on dashboard */
  reason: string;
  /** Estimated margin % on quoted basis (matches project detail “estimated” P&L) */
  estimatedMarginPct: number;
};

export type DashboardMetrics = {
  /** customer_approval === "PENDING" */
  openQuotes: number;
  /** Jobs with created_at in calendar YTD; sum total_quoted */
  ytdQuoted: number;
  /** Same YTD window as ytdQuoted; sum invoiced_amount */
  ytdInvoiced: number;
  /** Sum over all rows: invoiced − sum(cost fields) */
  totalPl: number;
  /** Mean of per-project realized margin % where invoiced_amount > 0; null if none */
  avgMarginPct: number | null;
  /** Sum total_quoted for rows where project_complete is false (open / WIP pipeline) */
  pipelineDollars: number;
  /**
   * 100 * ACCEPTED / (ACCEPTED + REJECTED). Cancellations are excluded from the denominator.
   * null if denominator is 0.
   */
  winRatePct: number | null;
  quotesAccepted: number;
  quotesRejected: number;
  /** customer_approval === "CANCELLED" (distinct from rejected quotes). */
  quotesCancelled: number;
  /** Count of projects per sales command board column (includes lost). */
  pipelineColumnCounts: Record<SalesProjectColumn, number>;
  activeProjects: number;
  completedProjects: number;
  /** Rows where supply_industrial (uppercased) starts with or equals "SUPPLY" */
  supplyActiveCount: number;
  /** Rows where supply_industrial (uppercased) starts with or equals "INDUSTRIAL" */
  industrialActiveCount: number;
  /** Sum engineering_quoted for active (incomplete) jobs — proxy for engineering load */
  engineeringLoadQuoted: number;
  /** Invoiced revenue by customer, calendar YTD (same `created_at` window as ytdInvoiced). */
  topCustomers: Array<{ rank: number; customer: string; revenue: number }>;
  /** Open quotes: non-cancelled rows with customer_approval PENDING (oldest created_at first). */
  needsAttention: AttentionItem[];
};

function ytdStartIso(year: number): string {
  return `${year}-01-01`;
}

function totalCostActual(p: DashboardProjectRow): number {
  return (
    (p.material_cost || 0) +
    (p.labor_cost || 0) +
    (p.engineering_cost || 0) +
    (p.equipment_cost || 0) +
    (p.logistics_cost || 0) +
    (p.additional_costs || 0)
  );
}

function totalCostQuoted(p: DashboardProjectRow): number {
  return computeQuotedInternalCostTotal(p);
}

/** Realized P&L (matches project detail live P&L). */
export function realizedPl(p: DashboardProjectRow): number {
  return (p.invoiced_amount || 0) - totalCostActual(p);
}

/** Estimated P&L on quoted basis (matches project detail). */
export function estimatedPlQuoted(p: DashboardProjectRow): number {
  return (p.total_quoted || 0) - totalCostQuoted(p);
}

export function realizedMarginPct(p: DashboardProjectRow): number | null {
  const inv = p.invoiced_amount || 0;
  if (inv <= 0) return null;
  return (realizedPl(p) / inv) * 100;
}

export function estimatedMarginPctQuoted(p: DashboardProjectRow): number | null {
  const q = p.total_quoted || 0;
  if (q <= 0) return null;
  return (estimatedPlQuoted(p) / q) * 100;
}

const MS_PER_DAY = 86400000;

/** Pending quotes older than this (days) are flagged as stale (list + dashboard). */
export const STALE_QUOTE_DAYS = 14;

export function classifySupplyIndustrial(
  raw: string | null | undefined,
): "supply" | "industrial" | "other" {
  const u = (raw || "").toUpperCase().trim();
  if (u.includes("INDUSTRIAL")) return "industrial";
  if (u.includes("SUPPLY")) return "supply";
  return "other";
}

/** Cancelled jobs (ops or approval) are excluded from active / pipeline counts. */
export function isCancelledProject(p: DashboardProjectRow): boolean {
  return (
    p.project_status === "cancelled" || p.customer_approval === "CANCELLED"
  );
}

function isActivePipelineJob(p: DashboardProjectRow): boolean {
  return !p.project_complete && !isCancelledProject(p);
}

/**
 * Pure aggregation for the manufacturing dashboard.
 * @param projects - Full or partial rows from `projects`
 * @param now - Current time (injectable for tests)
 */
export function aggregateDashboardMetrics(
  projects: DashboardProjectRow[],
  now: Date = new Date(),
): DashboardMetrics {
  const ytdCutoff = ytdStartIso(now.getFullYear());

  let openQuotes = 0;
  let ytdQuoted = 0;
  let ytdInvoiced = 0;
  let totalPl = 0;
  let pipelineDollars = 0;
  let quotesAccepted = 0;
  let quotesRejected = 0;
  let quotesCancelled = 0;

  const pipelineColumnCounts = {} as Record<SalesProjectColumn, number>;
  for (const c of SALES_PROJECT_COLUMNS) pipelineColumnCounts[c] = 0;
  let activeProjects = 0;
  let completedProjects = 0;
  let supplyActiveCount = 0;
  let industrialActiveCount = 0;
  let engineeringLoadQuoted = 0;

  const marginSamples: number[] = [];
  const customerMap = new Map<string, number>();

  for (const p of projects) {
    const approval = String(p.customer_approval || "");
    const approvalU = approval.toUpperCase();
    pipelineColumnCounts[boardColumnForProject(p)] += 1;

    if (approvalU === "PENDING" && !isCancelledProject(p)) openQuotes += 1;

    const created = p.created_at || "";
    if (created >= ytdCutoff) {
      ytdQuoted += p.total_quoted || 0;
      ytdInvoiced += p.invoiced_amount || 0;
    }

    totalPl += realizedPl(p);

    if (isActivePipelineJob(p)) {
      activeProjects += 1;
      pipelineDollars += p.total_quoted || 0;
      engineeringLoadQuoted += p.engineering_quoted || 0;

      const si = classifySupplyIndustrial(p.supply_industrial);
      if (si === "supply") supplyActiveCount += 1;
      else if (si === "industrial") industrialActiveCount += 1;
    } else if (p.project_complete) {
      completedProjects += 1;
    }

    if (approvalU === "ACCEPTED") quotesAccepted += 1;
    if (approvalU === "REJECTED") quotesRejected += 1;
    if (approvalU === "CANCELLED") quotesCancelled += 1;

    const m = realizedMarginPct(p);
    if (m !== null) marginSamples.push(m);

    const rev = p.invoiced_amount || 0;
    if (rev > 0 && p.customer && created >= ytdCutoff) {
      const c = p.customer.toUpperCase();
      customerMap.set(c, (customerMap.get(c) || 0) + rev);
    }
  }

  const winDenom = quotesAccepted + quotesRejected;
  const winRatePct =
    winDenom > 0 ? Math.round((100 * quotesAccepted) / winDenom) : null;

  const avgMarginPct =
    marginSamples.length > 0
      ? Math.round(
          (marginSamples.reduce((a, b) => a + b, 0) / marginSamples.length) * 10,
        ) / 10
      : null;

  const topCustomers = Array.from(customerMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([customer, revenue], i) => ({
      rank: i + 1,
      customer,
      revenue,
    }));

  const pendingOpenQuotes: {
    p: DashboardProjectRow;
    item: AttentionItem;
  }[] = [];
  for (const p of projects) {
    const au = String(p.customer_approval || "").toUpperCase();
    if (au !== "PENDING" || isCancelledProject(p)) continue;
    const est = estimatedMarginPctQuoted(p);
    pendingOpenQuotes.push({
      p,
      item: {
        id: p.id,
        project_number: String(p.project_number ?? ""),
        project_name: (p.project_name || "").toUpperCase() || "—",
        customer: (p.customer || "").toUpperCase() || "—",
        created_at: p.created_at ?? null,
        reason: "Pending approval",
        estimatedMarginPct:
          est !== null ? Math.round(est * 10) / 10 : 0,
      },
    });
  }
  pendingOpenQuotes.sort((a, b) => {
    const ta = a.p.created_at
      ? new Date(a.p.created_at).getTime()
      : Number.POSITIVE_INFINITY;
    const tb = b.p.created_at
      ? new Date(b.p.created_at).getTime()
      : Number.POSITIVE_INFINITY;
    return ta - tb;
  });
  const needsAttention = pendingOpenQuotes.map((r) => r.item);

  return {
    openQuotes,
    ytdQuoted,
    ytdInvoiced,
    totalPl,
    avgMarginPct,
    pipelineDollars,
    winRatePct,
    quotesAccepted,
    quotesRejected,
    quotesCancelled,
    pipelineColumnCounts,
    activeProjects,
    completedProjects,
    supplyActiveCount,
    industrialActiveCount,
    engineeringLoadQuoted,
    topCustomers,
    needsAttention,
  };
}
