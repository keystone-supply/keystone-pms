import Link from "next/link";
import { DollarSign, FolderKanban } from "lucide-react";

import type { DashboardMetrics } from "@/lib/dashboardMetrics";
import { formatRiversideDateWithMt } from "@/lib/time/riversideDisplay";

import { MetricTile } from "./metric-tile";

function formatUsd(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatCreatedAt(raw: string | null): string {
  return formatRiversideDateWithMt(raw);
}

type SecondaryPanelsProps = {
  metrics: DashboardMetrics;
  showFinancials: boolean;
};

export function SecondaryPanels({
  metrics,
  showFinancials,
}: SecondaryPanelsProps) {
  const marginDisplay =
    metrics.avgMarginPct === null ? "—" : `${metrics.avgMarginPct}%`;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        {showFinancials ? (
          <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/60 p-6">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-950 ring-1 ring-zinc-800">
                <DollarSign className="size-5 text-blue-400" aria-hidden />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">
                  Finance &amp; accounting
                </h2>
                <p className="text-xs text-zinc-500">
                  Year-to-date revenue, margin, and realized P&amp;L
                </p>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <MetricTile
                  label="YTD quoted"
                  value={formatUsd(metrics.ytdQuoted)}
                  hint="Quoted this year"
                />
                <MetricTile
                  label="YTD invoiced"
                  value={formatUsd(metrics.ytdInvoiced)}
                  hint="Invoiced this year"
                />
                <MetricTile
                  label="Total P&L"
                  value={formatUsd(metrics.totalPl)}
                  hint="YTD jobs, realized"
                  tone={metrics.totalPl >= 0 ? "positive" : "negative"}
                />
                <MetricTile
                  label="Avg margin"
                  value={marginDisplay}
                  hint="YTD invoiced jobs"
                  tone={
                    metrics.avgMarginPct === null
                      ? "default"
                      : metrics.avgMarginPct >= 0
                        ? "positive"
                        : "negative"
                  }
                />
              </div>
              <div className="pt-2">
                <Link
                  href="/projects"
                  className="text-xs font-medium text-blue-400 hover:text-blue-300"
                >
                  Open project P&amp;L detail →
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/60 p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Top customers by invoiced revenue
              </p>
              <p className="max-w-xl text-xs text-zinc-500">
                {new Date().getFullYear()} only — same window as YTD invoiced
                (jobs with RFQ/created in this year).
              </p>
            </div>
            <Link
              href="/projects"
              className="shrink-0 text-xs font-medium text-blue-400 hover:text-blue-300"
            >
              Projects →
            </Link>
          </div>
          <ul className="space-y-2">
            {metrics.topCustomers.length > 0 ? (
              metrics.topCustomers.map((c) => (
                <li
                  key={`${c.rank}-${c.customer}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-zinc-900 font-mono text-xs text-zinc-400 ring-1 ring-zinc-800">
                      {c.rank}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-200">
                        {c.customer.toUpperCase()}
                      </p>
                      <p className="text-xs text-zinc-500">YTD invoiced revenue</p>
                    </div>
                  </div>
                  <p className="shrink-0 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 font-mono text-xs font-medium text-emerald-300">
                    {formatUsd(c.revenue)}
                  </p>
                </li>
              ))
            ) : (
              <li className="py-8 text-center text-sm text-zinc-500">
                No invoiced revenue yet
              </li>
            )}
          </ul>
        </section>
      </div>

      <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/60 p-6">
        <div className="mb-4 flex items-start gap-2.5">
          <FolderKanban className="mt-0.5 size-4 text-sky-400/90" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Open quotes (pending approval)
            </p>
            <p className="text-xs text-zinc-500">
              Jobs where customer approval is still pending (same set as the Open
              quotes KPI), oldest RFQ first.
            </p>
          </div>
        </div>
        <div className="max-h-[40rem] overflow-y-auto pr-1">
          <ul className="space-y-2">
            {metrics.needsAttention.length > 0 ? (
              metrics.needsAttention.map((item) => (
                <li key={item.id}>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-200">
                        {(item.project_number || "—") + " — " + item.project_name}
                      </p>
                      <p className="truncate text-xs text-zinc-500">
                        {(item.customer || "No customer").toUpperCase()}
                      </p>
                      <p className="truncate text-xs text-zinc-500">
                        RFQ: {formatCreatedAt(item.created_at)}
                      </p>
                    </div>
                    <Link
                      href={`/projects/${item.id}`}
                      className="shrink-0 rounded-md border border-blue-500/35 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-300 hover:bg-blue-500/20"
                    >
                      View
                    </Link>
                  </div>
                </li>
              ))
            ) : (
              <li className="py-8 text-center text-sm text-zinc-500">
                No open quotes pending approval
              </li>
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}
