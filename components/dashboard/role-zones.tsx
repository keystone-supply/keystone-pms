import type { ReactNode } from "react";
import Link from "next/link";
import {
  DollarSign,
  Factory,
  Hammer,
  LineChart,
  ShoppingCart,
  Wrench,
} from "lucide-react";

import type { DashboardMetrics } from "@/lib/dashboardMetrics";
import {
  canAccessSales,
  canManageSheetStock,
  canRunNesting,
  canViewFinancials,
  type AppRole,
} from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

function formatUsd(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function ZoneCard({
  title,
  icon: Icon,
  subtitle,
  children,
  footer,
  className,
}: {
  title: string;
  icon: typeof Factory;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-2xl border border-zinc-800/90 bg-zinc-900/60 p-6 shadow-sm",
        className,
      )}
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-950 ring-1 ring-zinc-800">
          <Icon className="size-5 text-blue-400" aria-hidden />
        </div>
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <p className="text-xs text-zinc-500">{subtitle}</p>
        </div>
      </div>
      <div className="flex-1 space-y-3 text-sm">{children}</div>
      {footer ? (
        <div className="mt-4 border-t border-zinc-800/80 pt-4">{footer}</div>
      ) : null}
    </section>
  );
}

function StatRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-zinc-500">{label}</span>
      <span
        className={cn(
          "font-mono text-sm font-medium tabular-nums text-white",
          valueClassName,
        )}
      >
        {value}
      </span>
    </div>
  );
}

type RoleZonesProps = {
  metrics: DashboardMetrics;
  sheetStockCount: number | null;
  sheetStockLoading: boolean;
  role: AppRole;
};

export function RoleZones({
  metrics,
  sheetStockCount,
  sheetStockLoading,
  role,
}: RoleZonesProps) {
  const winDisplay =
    metrics.winRatePct === null ? "—" : `${metrics.winRatePct}%`;
  const marginDisplay =
    metrics.avgMarginPct === null ? "—" : `${metrics.avgMarginPct}%`;
  const canUseNesting = canRunNesting(role);
  const canUseSheetStock = canManageSheetStock(role);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {canAccessSales(role) ? (
        <ZoneCard
          title="Sales & quotes"
          icon={LineChart}
          subtitle="Pipeline and customer decisions"
        >
          <StatRow
            label="Open quotes (pending approval)"
            value={metrics.openQuotes}
          />
          <StatRow
            label="Accepted / rejected"
            value={`${metrics.quotesAccepted} / ${metrics.quotesRejected}`}
          />
          <StatRow label="Win rate (accepted ÷ closed)" value={winDisplay} />
          <StatRow
            label="Pipeline ($ quoted, incomplete jobs)"
            value={formatUsd(metrics.pipelineDollars)}
          />
          <p className="pt-1 text-xs text-zinc-600">
            Pipeline sums <code className="text-zinc-500">total_quoted</code>{" "}
            for jobs where complete = false.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2">
            <Link
              href="/sales"
              className="text-xs font-medium text-blue-400 hover:text-blue-300"
            >
              Sales hub &amp; accounts →
            </Link>
            <Link
              href="/projects"
              className="text-xs font-medium text-blue-400 hover:text-blue-300"
            >
              All projects →
            </Link>
          </div>
        </ZoneCard>
      ) : null}

      {canViewFinancials(role) ? (
        <ZoneCard
          title="Finance & accounting"
          icon={DollarSign}
          subtitle="Revenue, margin, and realized P&amp;L"
        >
          <StatRow label="YTD quoted" value={formatUsd(metrics.ytdQuoted)} />
          <StatRow
            label="YTD invoiced"
            value={formatUsd(metrics.ytdInvoiced)}
          />
          <StatRow
            label="Total P&amp;L (all jobs, realized)"
            value={formatUsd(metrics.totalPl)}
            valueClassName={
              metrics.totalPl >= 0 ? "text-emerald-400" : "text-red-400"
            }
          />
          <StatRow label="Avg margin % (invoiced jobs)" value={marginDisplay} />
          <div className="pt-2">
            <Link
              href="/projects"
              className="text-xs font-medium text-blue-400 hover:text-blue-300"
            >
              Open project P&amp;L detail →
            </Link>
          </div>
        </ZoneCard>
      ) : null}

      <ZoneCard
        title="Shop & operations"
        icon={Factory}
        subtitle="Work in progress and job mix"
      >
        <StatRow label="Active jobs" value={metrics.activeProjects} />
        <StatRow
          label="Completed jobs (lifetime)"
          value={metrics.completedProjects}
          valueClassName="text-emerald-400/90"
        />
        <StatRow
          label="Active — supply track"
          value={metrics.supplyActiveCount}
        />
        <StatRow
          label="Active — industrial track"
          value={metrics.industrialActiveCount}
        />
        {canUseNesting ? (
          <div className="pt-2">
            <Link
              href="/nest-remnants"
              className="text-xs font-medium text-blue-400 hover:text-blue-300"
            >
              Nesting &amp; sheet usage →
            </Link>
          </div>
        ) : null}
      </ZoneCard>

      <ZoneCard
        title="Engineering"
        icon={Wrench}
        subtitle="Quoted engineering load on open work"
      >
        <StatRow
          label="Σ Engineering quoted (active jobs)"
          value={formatUsd(metrics.engineeringLoadQuoted)}
        />
        <p className="text-xs text-zinc-600">
          Proxy for engineering backlog until tasks are tracked separately.
        </p>
        <div className="pt-2">
          <Link
            href="/projects"
            className="text-xs font-medium text-blue-400 hover:text-blue-300"
          >
            View jobs →
          </Link>
        </div>
      </ZoneCard>

      {canUseSheetStock ? (
        <ZoneCard
          title="Purchasing & materials"
          icon={ShoppingCart}
          subtitle="On-hand sheet stock (Nest)"
          className="lg:col-span-2"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <StatRow
                label="Active sheet records"
                value={
                  sheetStockLoading
                    ? "…"
                    : sheetStockCount === null
                      ? "—"
                      : sheetStockCount
                }
              />
              <p className="mt-2 text-xs text-zinc-600">
                Count from Nest inventory (non-archived{" "}
                <code className="text-zinc-500">sheet_stock</code> rows).
              </p>
            </div>
            <Link
              href="/nest-remnants"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:border-blue-500/50 hover:bg-zinc-900"
            >
              <Hammer className="size-4 text-amber-400" aria-hidden />
              Open Nest &amp; remnants
            </Link>
          </div>
        </ZoneCard>
      ) : null}
    </div>
  );
}
