"use client";

import { Activity, AlertTriangle } from "lucide-react";

import { KpiCard } from "@/components/dashboard/kpi-card";
import type { CommandBoardTVSummary } from "@/lib/dashboardMetrics";
import { PIPELINE_STAGE_LABELS } from "@/lib/salesCommandBoardColumn";
import { formatRiversideTimeWithMt } from "@/lib/time/riversideDisplay";
import { cn } from "@/lib/utils";

interface TVCommandMetricsProps {
  summary: CommandBoardTVSummary;
  className?: string;
}

export function TVCommandMetrics({ summary, className }: TVCommandMetricsProps) {
  const formatCount = (n: number) => n.toLocaleString();

  const stageEntries = Object.entries(summary.stageCounts)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => {
      const order = [
        "in_process",
        "po_issued",
        "quote_sent",
        "rfq_vendors",
        "rfq_customer",
        "complete",
        "delivered",
        "invoiced",
        "lost",
      ];
      return order.indexOf(a) - order.indexOf(b);
    })
    .slice(0, 6);

  return (
    <div className={cn("space-y-8", className)}>
      {/* Primary KPI Grid - Large for TV */}
      <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-3">
        <KpiCard
          label="ACTIVE JOBS"
          value={formatCount(summary.activeProjects)}
          hint="Total in pipeline"
          icon={Activity}
          valueClassName="text-6xl"
        />
        <KpiCard
          label="IN PROCESS"
          value={formatCount(summary.inProcessCount)}
          hint="Jobs in shop / fabrication"
          icon={Activity}
          valueClassName="text-6xl text-emerald-400"
        />
      </div>

      {/* Stage Breakdown */}
      <div className="rounded-3xl border border-zinc-800/90 bg-zinc-900/60 p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-semibold tracking-tight text-white">
              Command Board Pipeline
            </h3>
            <p className="text-zinc-500">Live job stage distribution</p>
          </div>
          <div className="text-right text-xs text-zinc-500">
            LAST UPDATED
            <div className="font-mono text-lg text-white tabular-nums">
              {formatRiversideTimeWithMt(summary.lastUpdated)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {stageEntries.map(([stage, count]) => {
            const label = PIPELINE_STAGE_LABELS[stage as keyof typeof PIPELINE_STAGE_LABELS] || stage;
            const isActive = stage === "in_process";
            return (
              <div
                key={stage}
                className={cn(
                  "rounded-2xl border border-zinc-800/80 bg-zinc-950/80 p-6 transition-colors",
                  isActive && "border-emerald-500/50 bg-emerald-950/30",
                )}
              >
                <div className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                  {label}
                </div>
                <div className={cn("mt-3 font-mono text-5xl font-semibold tabular-nums", isActive ? "text-emerald-400" : "text-white")}>
                  {formatCount(count)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Attention / Needs Action */}
      {summary.recentAttention.length > 0 && (
        <div className="rounded-3xl border border-amber-500/30 bg-zinc-900/60 p-8">
          <div className="mb-4 flex items-center gap-3">
            <AlertTriangle className="size-6 text-amber-400" />
            <h3 className="text-xl font-semibold text-amber-300">Needs Attention</h3>
          </div>
          <div className="space-y-3">
            {summary.recentAttention.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between rounded-2xl border border-amber-500/20 bg-zinc-950/50 px-5 py-4 text-sm"
              >
                <div>
                  <div className="font-mono text-amber-200">#{item.project_number}</div>
                  <div className="text-zinc-300">{item.project_name}</div>
                  <div className="text-xs text-zinc-500">{item.customer}</div>
                </div>
                <div className="text-right text-xs text-amber-400/90">
                  {item.reason}
                  <div className="mt-1 font-mono text-[10px] text-zinc-500">
                    {item.estimatedMarginPct}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
