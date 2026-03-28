import Link from "next/link";
import { FolderKanban } from "lucide-react";

import type { DashboardMetrics } from "@/lib/dashboardMetrics";

function formatUsd(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatCreatedAt(raw: string | null): string {
  if (raw == null || raw === "") return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

type SecondaryPanelsProps = {
  metrics: DashboardMetrics;
};

export function SecondaryPanels({ metrics }: SecondaryPanelsProps) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/60 p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white">
              Top customers by invoiced revenue
            </h2>
            <p className="mt-1 max-w-xl text-xs text-zinc-500">
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
          <FolderKanban className="size-5 text-sky-400/90" aria-hidden />
          <h2 className="text-base font-semibold text-white">
            Open quotes (pending approval)
          </h2>
        </div>
        <p className="mb-4 text-xs text-zinc-500">
          Jobs where customer approval is still pending (same set as the Open
          quotes KPI), oldest RFQ first.
        </p>
        <ul className="space-y-3">
          {metrics.needsAttention.length > 0 ? (
            metrics.needsAttention.map((item) => (
              <li key={item.id} className="text-sm">
                <Link
                  href={`/projects/${item.id}`}
                  className="group flex flex-col rounded-xl border border-zinc-800/60 bg-zinc-950/50 px-3 py-2 transition-colors hover:border-sky-500/30 hover:bg-zinc-950"
                >
                  <span className="font-mono font-medium text-white group-hover:text-sky-100">
                    {item.project_number || "—"} — {item.project_name}
                  </span>
                  <span className="mt-1 truncate text-xs uppercase text-zinc-400">
                    {item.customer}
                  </span>
                  <span className="text-xs text-zinc-500">
                    RFQ date:{" "}
                    <span className="font-mono text-zinc-400 tabular-nums">
                      {formatCreatedAt(item.created_at)}
                    </span>
                  </span>
                  <span className="mt-0.5 text-xs font-mono text-zinc-400">
                    Est. quoted margin: {item.estimatedMarginPct}%
                  </span>
                </Link>
              </li>
            ))
          ) : (
            <li className="py-8 text-center text-sm text-zinc-500">
              No open quotes pending approval
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
