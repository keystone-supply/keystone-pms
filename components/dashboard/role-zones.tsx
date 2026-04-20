import type { ReactNode } from "react";
import Link from "next/link";
import {
  Factory,
  Hammer,
  LineChart,
  Package2,
  ShoppingCart,
} from "lucide-react";

import type { DashboardMetrics } from "@/lib/dashboardMetrics";
import {
  canAccessSales,
  canManageSheetStock,
  canRunNesting,
  type AppCapabilitySet,
} from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

function formatUsd(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatShortDate(raw: string | null): string {
  if (raw == null || raw === "") return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
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
  capabilities: AppCapabilitySet;
};

export function RoleZones({
  metrics,
  sheetStockCount,
  sheetStockLoading,
  capabilities,
}: RoleZonesProps) {
  const winDisplay =
    metrics.winRatePct === null ? "—" : `${metrics.winRatePct}%`;
  const canUseNesting = canRunNesting(capabilities);
  const canUseSheetStock = canManageSheetStock(capabilities);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {canAccessSales(capabilities) ? (
        <ZoneCard
          title="Sales & quotes"
          icon={LineChart}
          subtitle="Pipeline and customer decisions"
          className="lg:col-span-2"
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

      <ZoneCard
        title="Shop & operations"
        icon={Factory}
        subtitle="Work in progress and job mix"
        className="lg:col-span-2"
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

      {canUseSheetStock ? (
        <div className="space-y-5 lg:col-span-2">
          <ZoneCard
            title="Purchasing"
            icon={ShoppingCart}
            subtitle="Jobs with materials ordered but not yet received"
          >
            {metrics.purchasingQueue.length > 0 ? (
              <div className="max-h-[10.5rem] overflow-y-auto pr-1">
                <ul className="space-y-2">
                  {metrics.purchasingQueue.map((item) => (
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
                            Ordered: {formatShortDate(item.materials_ordered_at)}
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
                  ))}
                </ul>
              </div>
            ) : (
              <p className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-8 text-center text-sm text-zinc-500">
                No jobs are waiting on material receipt
              </p>
            )}
          </ZoneCard>

          <ZoneCard
            title="Active sheet records"
            icon={Package2}
            subtitle="Current on-hand sheets in Nest inventory"
          >
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Active sheet records
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold text-white">
                {sheetStockLoading
                  ? "…"
                  : sheetStockCount === null
                    ? "—"
                    : sheetStockCount}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Count from non-archived <code className="text-zinc-500">sheet_stock</code> rows.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/nest-remnants"
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:border-blue-500/50 hover:bg-zinc-900"
              >
                <Hammer className="size-4 text-amber-400" aria-hidden />
                Open Nest &amp; remnants
              </Link>
            </div>
          </ZoneCard>
        </div>
      ) : null}
    </div>
  );
}
