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
import type { ProjectStatusTicker } from "@/lib/projectStatusTicker";

/** Fields required for dashboard aggregation (subset of full project row). */
export type DashboardProjectRow = {
  id: string;
  project_number?: string | number | null;
  project_name?: string | null;
  customer?: string | null;
  customer_id?: string | null;
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
  rfq_received_at?: string | null;
  rfq_vendors_sent_at?: string | null;
  quote_sent_at?: string | null;
  po_issued_at?: string | null;
  in_process_at?: string | null;
  payment_received?: boolean | null;
  materials_ordered_at?: string | null;
  material_received_at?: string | null;
  labor_completed_at?: string | null;
  ready_to_ship_at?: string | null;
  completed_at?: string | null;
  delivered_at?: string | null;
  invoiced_at?: string | null;
  lost_at?: string | null;
  cancelled_at?: string | null;
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

export type PurchasingItem = {
  id: string;
  project_number: string;
  project_name: string;
  customer: string;
  materials_ordered_at: string | null;
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
  /** Jobs where materials have been ordered but not yet received (oldest ordered first). */
  purchasingQueue: PurchasingItem[];
  /** Median days RFQ received to PO issued. */
  quoteTurnaroundDaysMedian: number | null;
  /** Median days PO issued to invoiced. */
  cashToCashDaysMedian: number | null;
  /** Median days in process to complete. */
  shopThroughputDaysMedian: number | null;
  /** Median days materials ordered to material received. */
  materialsLeadTimeDaysMedian: number | null;
  /** Median days in process to materials ordered. */
  waitForMaterialsDaysMedian: number | null;
  /** Median days material received to labor completed. */
  pureLaborDaysMedian: number | null;
  /** Median days labor completed to stage complete. */
  shopToStageLagDaysMedian: number | null;
};

/** TV / shop floor specific summary focused on command board job stages. */
export type CommandBoardTVSummary = {
  stageCounts: Record<SalesProjectColumn, number>;
  inProcessCount: number;
  activeProjects: number;
  recentAttention: AttentionItem[];
  projects: TvProjectTickerRow[];
  lastUpdated: Date;
};

export type TvProjectTickerRow = {
  project_number: string;
  project_name: string;
  customer: string;
  ticker: ProjectStatusTicker;
  moved_in_last_24h: boolean;
};

export type DashboardMetricsAggregationMode =
  | "legacy"
  | "dashboard_ytd_except_open_quotes";

const OPEN_QUOTE_STAGES = new Set(["rfq_customer", "rfq_vendors", "quote_sent"]);
const ACTIVE_PIPELINE_STAGES = new Set([
  "rfq_customer",
  "rfq_vendors",
  "quote_sent",
  "po_issued",
  "in_process",
  "complete",
  "delivered",
]);
const ACCEPTED_STAGES = new Set([
  "po_issued",
  "in_process",
  "complete",
  "delivered",
  "invoiced",
  "cancelled",
]);

function stageOf(p: DashboardProjectRow): SalesProjectColumn {
  return boardColumnForProject(p);
}

function parseIso(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = Date.parse(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

function diffDays(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  const s = parseIso(start);
  const e = parseIso(end);
  if (s == null || e == null || e < s) return null;
  return (e - s) / (1000 * 60 * 60 * 24);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const raw =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  return Math.round(raw * 10) / 10;
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

export function isCancelledProject(p: DashboardProjectRow): boolean {
  return stageOf(p) === "cancelled";
}

function isActivePipelineJob(p: DashboardProjectRow): boolean {
  return ACTIVE_PIPELINE_STAGES.has(stageOf(p));
}

/**
 * Pure aggregation for the manufacturing dashboard.
 * @param projects - Full or partial rows from `projects`
 * @param now - Current time (injectable for tests)
 */
export function aggregateDashboardMetrics(
  projects: DashboardProjectRow[],
  now: Date = new Date(),
  mode: DashboardMetricsAggregationMode = "legacy",
): DashboardMetrics {
  const ytdStartMs = new Date(now.getFullYear(), 0, 1).getTime();
  const ytdEndMs = new Date(now.getFullYear() + 1, 0, 1).getTime();
  const shouldScopeNonOpenQuoteMetricsToYtd =
    mode === "dashboard_ytd_except_open_quotes";

  let openQuotes = 0;
  let ytdQuoted = 0;
  let ytdInvoiced = 0;
  let totalPl = 0;
  let pipelineDollars = 0;
  let quotesAccepted = 0;
  let quotesRejected = 0;
  let quotesCancelled = 0;
  const quoteTurnaroundSamples: number[] = [];
  const cashToCashSamples: number[] = [];
  const shopThroughputSamples: number[] = [];
  const materialsLeadTimeSamples: number[] = [];
  const waitForMaterialsSamples: number[] = [];
  const pureLaborSamples: number[] = [];
  const shopToStageLagSamples: number[] = [];

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
    const createdTs = parseIso(p.created_at);
    const isCreatedInYtd =
      createdTs !== null && createdTs >= ytdStartMs && createdTs < ytdEndMs;
    const includeNonOpenQuoteMetrics =
      !shouldScopeNonOpenQuoteMetricsToYtd || isCreatedInYtd;
    const stage = stageOf(p);
    pipelineColumnCounts[stage] += 1;
    if (OPEN_QUOTE_STAGES.has(stage)) openQuotes += 1;

    if (isCreatedInYtd) {
      ytdQuoted += p.total_quoted || 0;
      ytdInvoiced += p.invoiced_amount || 0;
    }

    if (includeNonOpenQuoteMetrics) totalPl += realizedPl(p);

    if (includeNonOpenQuoteMetrics && isActivePipelineJob(p)) {
      activeProjects += 1;
      pipelineDollars += p.total_quoted || 0;
      engineeringLoadQuoted += p.engineering_quoted || 0;

      const si = classifySupplyIndustrial(p.supply_industrial);
      if (si === "supply") supplyActiveCount += 1;
      else if (si === "industrial") industrialActiveCount += 1;
    } else if (includeNonOpenQuoteMetrics && stage === "invoiced") {
      completedProjects += 1;
    }

    if (includeNonOpenQuoteMetrics && ACCEPTED_STAGES.has(stage)) {
      quotesAccepted += 1;
    }
    if (includeNonOpenQuoteMetrics && stage === "lost") quotesRejected += 1;
    if (includeNonOpenQuoteMetrics && stage === "cancelled") {
      quotesCancelled += 1;
    }

    if (includeNonOpenQuoteMetrics) {
      const m = realizedMarginPct(p);
      if (m !== null) marginSamples.push(m);
    }

    const rev = p.invoiced_amount || 0;
    if (rev > 0 && p.customer && isCreatedInYtd) {
      const c = p.customer.toUpperCase();
      customerMap.set(c, (customerMap.get(c) || 0) + rev);
    }
    if (includeNonOpenQuoteMetrics) {
      const quoteTurnaround = diffDays(p.rfq_received_at, p.po_issued_at);
      if (quoteTurnaround != null) quoteTurnaroundSamples.push(quoteTurnaround);
      const cashToCash = diffDays(p.po_issued_at, p.invoiced_at);
      if (cashToCash != null) cashToCashSamples.push(cashToCash);
      const shopThroughput = diffDays(p.in_process_at, p.completed_at);
      if (shopThroughput != null) shopThroughputSamples.push(shopThroughput);
      const materialsLead = diffDays(p.materials_ordered_at, p.material_received_at);
      if (materialsLead != null) materialsLeadTimeSamples.push(materialsLead);
      const waitForMaterials = diffDays(p.in_process_at, p.materials_ordered_at);
      if (waitForMaterials != null) waitForMaterialsSamples.push(waitForMaterials);
      const pureLabor = diffDays(p.material_received_at, p.labor_completed_at);
      if (pureLabor != null) pureLaborSamples.push(pureLabor);
      const shopToStageLag = diffDays(p.labor_completed_at, p.completed_at);
      if (shopToStageLag != null) shopToStageLagSamples.push(shopToStageLag);
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
  const purchasingQueueRaw: PurchasingItem[] = [];
  for (const p of projects) {
    const createdTs = parseIso(p.created_at);
    const isCreatedInYtd =
      createdTs !== null && createdTs >= ytdStartMs && createdTs < ytdEndMs;
    const includeNonOpenQuoteMetrics =
      !shouldScopeNonOpenQuoteMetricsToYtd || isCreatedInYtd;
    const stage = stageOf(p);
    if (!OPEN_QUOTE_STAGES.has(stage)) continue;
    const est = estimatedMarginPctQuoted(p);
    pendingOpenQuotes.push({
      p,
      item: {
        id: p.id,
        project_number: String(p.project_number ?? ""),
        project_name: (p.project_name || "").toUpperCase() || "—",
        customer: (p.customer || "").toUpperCase() || "—",
        created_at: p.created_at ?? null,
        reason: "Open quote stage",
        estimatedMarginPct:
          est !== null ? Math.round(est * 10) / 10 : 0,
      },
    });

    if (
      includeNonOpenQuoteMetrics &&
      p.materials_ordered_at &&
      !p.material_received_at &&
      stage !== "cancelled" &&
      stage !== "lost" &&
      stage !== "invoiced"
    ) {
      purchasingQueueRaw.push({
        id: p.id,
        project_number: String(p.project_number ?? ""),
        project_name: (p.project_name || "").toUpperCase() || "—",
        customer: (p.customer || "").toUpperCase() || "—",
        materials_ordered_at: p.materials_ordered_at ?? null,
      });
    }
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
  purchasingQueueRaw.sort((a, b) => {
    const ta = a.materials_ordered_at
      ? new Date(a.materials_ordered_at).getTime()
      : Number.POSITIVE_INFINITY;
    const tb = b.materials_ordered_at
      ? new Date(b.materials_ordered_at).getTime()
      : Number.POSITIVE_INFINITY;
    return ta - tb;
  });

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
    purchasingQueue: purchasingQueueRaw,
    quoteTurnaroundDaysMedian: median(quoteTurnaroundSamples),
    cashToCashDaysMedian: median(cashToCashSamples),
    shopThroughputDaysMedian: median(shopThroughputSamples),
    materialsLeadTimeDaysMedian: median(materialsLeadTimeSamples),
    waitForMaterialsDaysMedian: median(waitForMaterialsSamples),
    pureLaborDaysMedian: median(pureLaborSamples),
    shopToStageLagDaysMedian: median(shopToStageLagSamples),
  };
}

/**
 * Creates TV/shop-floor focused summary emphasizing command board job stages.
 * Reuses existing aggregation for consistency with sales command board.
 */
export function getCommandBoardTVSummary(
  projects: DashboardProjectRow[],
  now: Date = new Date(),
): CommandBoardTVSummary {
  const metrics = aggregateDashboardMetrics(projects, now);
  const recentAttention = metrics.needsAttention.slice(0, 5);

  return {
    stageCounts: { ...metrics.pipelineColumnCounts },
    inProcessCount: metrics.pipelineColumnCounts.in_process || 0,
    activeProjects: metrics.activeProjects,
    recentAttention,
    projects: [],
    lastUpdated: now,
  };
}

export function getCommandBoardTVSummaryWithTickers(
  projects: DashboardProjectRow[],
  tickerRows: TvProjectTickerRow[],
  now: Date = new Date(),
): CommandBoardTVSummary {
  const base = getCommandBoardTVSummary(projects, now);
  const sortedRows = tickerRows
    .sort((a, b) => b.ticker.staleDays - a.ticker.staleDays)
    .slice(0, 50);

  return {
    ...base,
    projects: sortedRows,
  };
}
