import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import type { DashboardMetrics } from "@/lib/dashboardMetrics";

function formatUsd(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

type SecondaryPanelsProps = {
  metrics: DashboardMetrics;
};

export function SecondaryPanels({ metrics }: SecondaryPanelsProps) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/60 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">
            Top customers by invoiced revenue
          </h2>
          <Link
            href="/projects"
            className="text-xs font-medium text-blue-400 hover:text-blue-300"
          >
            Projects →
          </Link>
        </div>
        <ul className="space-y-3">
          {metrics.topCustomers.length > 0 ? (
            metrics.topCustomers.map((c) => (
              <li
                key={`${c.rank}-${c.customer}`}
                className="flex items-center justify-between gap-4 border-b border-zinc-800/50 pb-3 last:border-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-950 font-mono text-xs text-zinc-400">
                    {c.rank}
                  </span>
                  <span className="truncate font-medium uppercase text-zinc-200">
                    {c.customer}
                  </span>
                </div>
                <span className="shrink-0 font-mono text-sm text-emerald-400">
                  {formatUsd(c.revenue)}
                </span>
              </li>
            ))
          ) : (
            <li className="py-8 text-center text-sm text-zinc-500">
              No invoiced revenue yet
            </li>
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/60 p-6">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="size-5 text-amber-500/90" aria-hidden />
          <h2 className="text-base font-semibold text-white">
            Needs attention
          </h2>
        </div>
        <p className="mb-4 text-xs text-zinc-500">
          Active jobs with quoted margin under 15%, or quotes pending over 14
          days.
        </p>
        <ul className="space-y-3">
          {metrics.needsAttention.length > 0 ? (
            metrics.needsAttention.map((item) => (
              <li key={item.id} className="text-sm">
                <Link
                  href={`/projects/${item.id}`}
                  className="group flex flex-col rounded-xl border border-zinc-800/60 bg-zinc-950/50 px-3 py-2 transition-colors hover:border-amber-500/30 hover:bg-zinc-950"
                >
                  <span className="font-mono font-medium text-white group-hover:text-amber-100">
                    {item.project_number || "—"} — {item.project_name}
                  </span>
                  <span className="text-xs text-zinc-500">{item.reason}</span>
                  <span className="mt-1 text-xs font-mono text-zinc-400">
                    Est. quoted margin: {item.estimatedMarginPct}%
                  </span>
                </Link>
              </li>
            ))
          ) : (
            <li className="py-8 text-center text-sm text-zinc-500">
              Nothing flagged right now
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
