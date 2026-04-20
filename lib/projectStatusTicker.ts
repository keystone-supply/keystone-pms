import type { DashboardProjectRow } from "@/lib/dashboardMetrics";

export type TickerStageId =
  | "rfq_in"
  | "rfq_out"
  | "quoted"
  | "approved"
  | "materials_ordered"
  | "materials_in"
  | "labor_complete"
  | "ready_to_ship"
  | "delivered"
  | "invoiced";

export type ProjectTickerLifecycle = "active" | "lost" | "cancelled";

export type TickerStage = {
  id: TickerStageId;
  reached: boolean;
  reachedAt: string | null;
  isCurrent: boolean;
};

export type ProjectStatusTicker = {
  lifecycle: ProjectTickerLifecycle;
  current: TickerStageId;
  stages: TickerStage[];
  staleDays: number;
};

export const TICKER_STAGES: readonly TickerStageId[] = [
  "rfq_in",
  "rfq_out",
  "quoted",
  "approved",
  "materials_ordered",
  "materials_in",
  "labor_complete",
  "ready_to_ship",
  "delivered",
  "invoiced",
] as const;

export const TICKER_STAGE_LABELS: Record<TickerStageId, string> = {
  rfq_in: "RFQ in",
  rfq_out: "RFQ out",
  quoted: "Quoted",
  approved: "Approved",
  materials_ordered: "Materials ordered",
  materials_in: "Materials in",
  labor_complete: "Labor complete",
  ready_to_ship: "Ready to ship",
  delivered: "Delivered",
  invoiced: "Invoiced",
};

export const TICKER_AMBER_DAYS = 7;
export const TICKER_RED_DAYS = 14;

type RowWithTickerFields = Omit<DashboardProjectRow, "id"> & {
  id?: string;
  ready_to_ship_at?: string | null;
  rfq_received_at?: string | null;
};

const SALES_STAGE_RANK: Record<string, number> = {
  rfq_customer: 0,
  rfq_vendors: 1,
  quote_sent: 2,
  po_issued: 3,
  in_process: 4,
  complete: 7,
  delivered: 8,
  invoiced: 9,
  cancelled: 9,
};

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isReachedBySalesStage(
  stage: string | null | undefined,
  minRank: number,
): boolean {
  if (!stage) return false;
  const rank = SALES_STAGE_RANK[stage];
  return typeof rank === "number" && rank >= minRank;
}

function deriveLifecycle(p: RowWithTickerFields): ProjectTickerLifecycle {
  if (p.sales_command_stage === "cancelled") {
    return "cancelled";
  }
  if (p.sales_command_stage === "lost") {
    return "lost";
  }
  return "active";
}

function reachedAtForStage(
  id: TickerStageId,
  p: RowWithTickerFields,
): string | null {
  switch (id) {
    case "rfq_in":
      return p.rfq_received_at ?? p.created_at ?? null;
    case "rfq_out":
      return p.rfq_vendors_sent_at ?? null;
    case "quoted":
      return p.quote_sent_at ?? null;
    case "approved":
      return p.po_issued_at ?? null;
    case "materials_ordered":
      return p.materials_ordered_at ?? null;
    case "materials_in":
      return p.material_received_at ?? null;
    case "labor_complete":
      return p.labor_completed_at ?? null;
    case "ready_to_ship":
      return p.ready_to_ship_at ?? p.completed_at ?? null;
    case "delivered":
      return p.delivered_at ?? null;
    case "invoiced":
      return p.invoiced_at ?? null;
    default: {
      const exhaustiveCheck: never = id;
      return exhaustiveCheck;
    }
  }
}

function isStageReached(id: TickerStageId, p: RowWithTickerFields): boolean {
  const stage = p.sales_command_stage ?? null;
  const reachedAt = reachedAtForStage(id, p);
  if (reachedAt) return true;

  switch (id) {
    case "rfq_in":
      return !!p.created_at || isReachedBySalesStage(stage, 0);
    case "rfq_out":
      return isReachedBySalesStage(stage, 1);
    case "quoted":
      return isReachedBySalesStage(stage, 2);
    case "approved":
      return isReachedBySalesStage(stage, 3);
    case "materials_ordered":
      return isReachedBySalesStage(stage, 4);
    case "materials_in":
      return false;
    case "labor_complete":
      return false;
    case "ready_to_ship":
      return isReachedBySalesStage(stage, 7);
    case "delivered":
      return isReachedBySalesStage(stage, 8);
    case "invoiced":
      return isReachedBySalesStage(stage, 9);
    default: {
      const exhaustiveCheck: never = id;
      return exhaustiveCheck;
    }
  }
}

function timestampForCurrentSalesStage(p: RowWithTickerFields): string | null {
  switch (p.sales_command_stage) {
    case "rfq_customer":
      return p.rfq_received_at ?? p.created_at ?? null;
    case "rfq_vendors":
      return p.rfq_vendors_sent_at ?? null;
    case "quote_sent":
      return p.quote_sent_at ?? null;
    case "po_issued":
      return p.po_issued_at ?? null;
    case "in_process":
      return p.in_process_at ?? null;
    case "complete":
      return p.completed_at ?? null;
    case "delivered":
      return p.delivered_at ?? null;
    case "invoiced":
      return p.invoiced_at ?? null;
    case "lost":
      return p.lost_at ?? null;
    case "cancelled":
      return p.cancelled_at ?? null;
    default:
      return null;
  }
}

function staleDaysForTicker(
  stages: TickerStage[],
  p: RowWithTickerFields,
  now: Date,
): number {
  const currentStageMs = parseIsoMs(timestampForCurrentSalesStage(p));
  if (currentStageMs !== null) {
    return Math.floor(Math.max(0, now.getTime() - currentStageMs) / 86400000);
  }

  let latestReachedMs: number | null = null;

  for (const stage of stages) {
    if (!stage.reached) continue;
    const ms = parseIsoMs(stage.reachedAt);
    if (ms !== null && (latestReachedMs === null || ms > latestReachedMs)) {
      latestReachedMs = ms;
    }
  }

  if (latestReachedMs === null) {
    latestReachedMs = parseIsoMs(p.created_at) ?? now.getTime();
  }

  const diffMs = Math.max(0, now.getTime() - latestReachedMs);
  return Math.floor(diffMs / 86400000);
}

export function deriveProjectStatusTicker(
  project: RowWithTickerFields,
  now: Date = new Date(),
): ProjectStatusTicker {
  const lifecycle = deriveLifecycle(project);
  const stagesWithoutCurrent = TICKER_STAGES.map((id) => ({
    id,
    reached: isStageReached(id, project),
    reachedAt: reachedAtForStage(id, project),
    isCurrent: false,
  }));

  const firstPending =
    stagesWithoutCurrent.find((stage) => !stage.reached)?.id ?? "invoiced";
  const stages = stagesWithoutCurrent.map((stage) => ({
    ...stage,
    isCurrent: stage.id === firstPending,
  }));

  return {
    lifecycle,
    current: firstPending,
    stages,
    staleDays: staleDaysForTicker(stages, project, now),
  };
}
