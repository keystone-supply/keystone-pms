"use client";

import { ArrowUpRight } from "lucide-react";

import { ProjectStatusTicker } from "@/components/projects/project-status-ticker";
import type { TvProjectTickerRow } from "@/lib/dashboardMetrics";
import {
  TICKER_AMBER_DAYS,
  TICKER_RED_DAYS,
} from "@/lib/projectStatusTicker";

type TvProjectTickersProps = {
  projects: TvProjectTickerRow[];
  pageSize?: number;
  pageIndex?: number;
};

function staleTone(staleDays: number): string {
  if (staleDays > TICKER_RED_DAYS) return "border-red-500/60 bg-red-950/30 text-red-200";
  if (staleDays > TICKER_AMBER_DAYS) {
    return "border-amber-500/60 bg-amber-950/30 text-amber-200";
  }
  return "border-zinc-700 bg-zinc-900/60 text-zinc-300";
}

export function TvProjectTickers({
  projects,
  pageSize = 8,
  pageIndex = 0,
}: TvProjectTickersProps) {
  const start = pageIndex * pageSize;
  const rows = projects.slice(start, start + pageSize);

  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-3 flex items-center justify-between px-2">
        <h2 className="text-lg font-semibold text-white">Active project tickers</h2>
        <p className="text-xs text-zinc-500">
          Showing {rows.length} of {projects.length}
        </p>
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <div
            key={`${row.project_number}-${row.project_name}`}
            className="grid items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3 lg:grid-cols-[300px_1fr_150px]"
          >
            <div>
              <div className="font-mono text-xl font-semibold text-emerald-300">
                #{row.project_number}
              </div>
              <div className="text-sm text-zinc-300">
                {row.customer.toUpperCase()} — {row.project_name.toUpperCase()}
              </div>
            </div>
            <ProjectStatusTicker ticker={row.ticker} variant="full" />
            <div className="flex items-center justify-end gap-2">
              <span
                className={`rounded-full border px-2 py-1 text-xs font-medium ${staleTone(row.ticker.staleDays)}`}
              >
                {row.ticker.staleDays}d idle
              </span>
              {row.moved_in_last_24h ? (
                <ArrowUpRight className="size-4 text-emerald-300" />
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
