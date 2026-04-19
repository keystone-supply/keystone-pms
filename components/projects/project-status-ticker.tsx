"use client";

import { AlertTriangle } from "lucide-react";

import {
  TICKER_AMBER_DAYS,
  TICKER_RED_DAYS,
  TICKER_STAGE_LABELS,
  type TickerStageId,
  type ProjectStatusTicker,
} from "@/lib/projectStatusTicker";
import { cn } from "@/lib/utils";

type ProjectStatusTickerProps = {
  ticker: ProjectStatusTicker;
  variant?: "compact" | "full";
  className?: string;
  interactive?: boolean;
  onAdvanceStage?: (stage: TickerStageId) => void;
};

const COMPACT_STAGE_LABELS: Record<TickerStageId, string> = {
  rfq_in: "RFQ in",
  rfq_out: "RFQ out",
  quoted: "Quoted",
  approved: "Approved",
  materials_ordered: "Mat. ord.",
  materials_in: "Mat. in",
  labor_complete: "Labor done",
  ready_to_ship: "RTS",
  delivered: "Delivered",
  invoiced: "Invoiced",
};

function lifecycleLabel(lifecycle: ProjectStatusTicker["lifecycle"]): string | null {
  switch (lifecycle) {
    case "active":
      return null;
    case "lost":
      return "LOST";
    case "cancelled":
      return "CANCELLED";
    default: {
      const exhaustiveCheck: never = lifecycle;
      return exhaustiveCheck;
    }
  }
}

function agingTone(staleDays: number): "none" | "amber" | "red" {
  if (staleDays > TICKER_RED_DAYS) return "red";
  if (staleDays > TICKER_AMBER_DAYS) return "amber";
  return "none";
}

function stageTitle(label: string, reached: boolean, reachedAt: string | null): string {
  if (!reached) return `${label}: pending`;
  if (!reachedAt) return `${label}: reached`;
  const d = new Date(reachedAt);
  if (Number.isNaN(d.getTime())) return `${label}: reached`;
  return `${label}: ${d.toLocaleString()}`;
}

export function ProjectStatusTicker({
  ticker,
  variant = "compact",
  className,
  interactive = false,
  onAdvanceStage,
}: ProjectStatusTickerProps) {
  const isFull = variant === "full";
  const lifecycleBadge = lifecycleLabel(ticker.lifecycle);
  const tone = agingTone(ticker.staleDays);

  return (
    <div
      className={cn(
        "rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-3",
        isFull && "p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {ticker.stages.map((stage) => {
          const label = TICKER_STAGE_LABELS[stage.id];
          const showAgingDot = stage.isCurrent && tone !== "none";

          const content = (
            <>
              {showAgingDot && (
                <span
                  className={cn(
                    "inline-block size-1.5 rounded-full",
                    tone === "red" ? "bg-red-400" : "bg-amber-400",
                  )}
                />
              )}
              <span>{isFull ? label : COMPACT_STAGE_LABELS[stage.id]}</span>
            </>
          );

          const pillClassName = cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium tracking-tight",
            isFull && "px-2.5 py-1.5 text-xs",
            ticker.lifecycle !== "active"
              ? "border-red-500/50 bg-red-950/40 text-red-200"
              : stage.reached
                ? "border-emerald-500/45 bg-emerald-950/35 text-emerald-200"
                : "border-zinc-700 bg-zinc-900/70 text-zinc-400",
            stage.isCurrent &&
              ticker.lifecycle === "active" &&
              "border-blue-400/70 text-blue-200 ring-1 ring-blue-400/50",
          );

          if (
            interactive &&
            !stage.reached &&
            ticker.lifecycle === "active" &&
            onAdvanceStage
          ) {
            return (
              <button
                key={stage.id}
                type="button"
                title={stageTitle(label, stage.reached, stage.reachedAt)}
                className={cn(pillClassName, "hover:bg-blue-950/40")}
                onClick={() => onAdvanceStage(stage.id)}
              >
                {content}
              </button>
            );
          }

          return (
            <div
              key={stage.id}
              title={stageTitle(label, stage.reached, stage.reachedAt)}
              className={pillClassName}
            >
              {content}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
        <div className="flex items-center gap-2">
          {lifecycleBadge && (
            <span className="rounded-md border border-red-500/50 bg-red-950/50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-red-200">
              {lifecycleBadge}
            </span>
          )}
          <span>
            Current:{" "}
            <span className="text-zinc-300">{TICKER_STAGE_LABELS[ticker.current]}</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          {tone !== "none" && <AlertTriangle className="size-3" />}
          <span>{ticker.staleDays}d idle</span>
        </div>
      </div>
    </div>
  );
}
