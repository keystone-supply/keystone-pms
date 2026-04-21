import type { ReactNode } from "react";
import Link from "next/link";
import {
  Factory,
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
import { formatRiversideDateWithMt } from "@/lib/time/riversideDisplay";
import { svgPathToNestShape } from "@/lib/svgPathToOutline";
import { cn } from "@/lib/utils";

import { MetricTile } from "./metric-tile";

export type DashboardSheetRecord = {
  id: string;
  label: string | null;
  svgPath: string | null;
  material: string;
  lengthIn: number | null;
  widthIn: number | null;
  thicknessIn: number | null;
  estWeightLbs: number | null;
  status: "Available" | "Allocated" | "Consumed" | "Scrap" | "Archived";
  notes: string | null;
};

function formatUsd(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatShortDate(raw: string | null): string {
  return formatRiversideDateWithMt(raw);
}

function formatSheetDims(sheet: DashboardSheetRecord): string {
  if (!sheet.lengthIn || !sheet.widthIn) return "—";
  return `${sheet.lengthIn}x${sheet.widthIn}"`;
}

function sheetStatusClass(status: DashboardSheetRecord["status"]): string {
  if (status === "Available") {
    return "border-emerald-500/30 bg-emerald-500/15 text-emerald-300";
  }
  if (status === "Allocated") {
    return "border-amber-500/30 bg-amber-500/15 text-amber-300";
  }
  if (status === "Scrap") {
    return "border-red-500/30 bg-red-500/15 text-red-300";
  }
  return "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";
}

function CompactSheetWireframe({ sheet }: { sheet: DashboardSheetRecord }) {
  const vbW = 100;
  const vbH = 60;
  const pad = 7;
  const innerW = vbW - pad * 2;
  const innerH = vbH - pad * 2;
  const minSide = 7;

  const svgShape = sheet.svgPath ? svgPathToNestShape(sheet.svgPath) : null;
  if (svgShape?.outline?.length) {
    const rings = [svgShape.outline, ...(svgShape.holes ?? [])].filter(
      (ring) => ring.length >= 3,
    );
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const ring of rings) {
      for (const p of ring) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }

    const shapeW = maxX - minX;
    const shapeH = maxY - minY;
    if (
      Number.isFinite(shapeW) &&
      Number.isFinite(shapeH) &&
      shapeW > 0 &&
      shapeH > 0
    ) {
      const scale = Math.min(innerW / shapeW, innerH / shapeH);
      const normW = Math.max(shapeW * scale, minSide);
      const normH = Math.max(shapeH * scale, minSide);
      const x0 = (vbW - normW) / 2;
      const y0 = (vbH - normH) / 2;
      const mapPt = (p: { x: number; y: number }) =>
        `${x0 + (p.x - minX) * scale},${y0 + (maxY - p.y) * scale}`;
      const loopPath = (loop: { x: number; y: number }[]) => {
        const [first, ...rest] = loop;
        return [
          `M ${mapPt(first)}`,
          ...rest.map((pt) => `L ${mapPt(pt)}`),
          "Z",
        ].join(" ");
      };
      const d = rings.map(loopPath).join(" ");
      return (
        <svg
          viewBox="0 0 100 60"
          className="h-9 w-14 text-zinc-500"
          aria-hidden="true"
        >
          <path
            d={d}
            fill="currentColor"
            fillOpacity={0.08}
            fillRule="evenodd"
            stroke="currentColor"
            strokeWidth={1.4}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      );
    }
  }

  if (!sheet.lengthIn || !sheet.widthIn) return null;
  const scale = Math.min(innerW / sheet.lengthIn, innerH / sheet.widthIn);
  const normW = Math.max(sheet.lengthIn * scale, minSide);
  const normH = Math.max(sheet.widthIn * scale, minSide);
  const x = (vbW - normW) / 2;
  const y = (vbH - normH) / 2;
  return (
    <svg viewBox="0 0 100 60" className="h-9 w-14 text-zinc-500" aria-hidden="true">
      <rect
        x={x}
        y={y}
        width={normW}
        height={normH}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        rx={3}
        ry={3}
      />
    </svg>
  );
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

type RoleZonesProps = {
  metrics: DashboardMetrics;
  sheetStockCount: number | null;
  activeSheetRecords: DashboardSheetRecord[];
  sheetStockLoading: boolean;
  capabilities: AppCapabilitySet;
};

export function RoleZones({
  metrics,
  sheetStockCount,
  activeSheetRecords,
  sheetStockLoading,
  capabilities,
}: RoleZonesProps) {
  const winDisplay =
    metrics.winRatePct === null ? "—" : `${metrics.winRatePct}%`;
  const canUseNesting = canRunNesting(capabilities);
  const canUseSheetStock = canManageSheetStock(capabilities);
  const availableSheetRecords = activeSheetRecords.filter(
    (sheet) => sheet.status === "Available",
  );

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {canAccessSales(capabilities) ? (
        <ZoneCard
          title="Sales & quotes"
          icon={LineChart}
          subtitle="Pipeline and customer decisions"
        >
          <div className="grid grid-cols-2 gap-3">
            <MetricTile
              label="Open quotes"
              value={metrics.openQuotes}
              hint="Pending approval"
              tone="info"
            />
            <MetricTile
              label="Accepted / rejected"
              value={`${metrics.quotesAccepted} / ${metrics.quotesRejected}`}
              hint="YTD quote decisions"
            />
            <MetricTile
              label="Win rate"
              value={winDisplay}
              hint="YTD accepted ÷ closed"
              tone={
                metrics.winRatePct === null
                  ? "default"
                  : metrics.winRatePct >= 50
                    ? "positive"
                    : "warning"
              }
            />
            <MetricTile
              label="Pipeline"
              value={formatUsd(metrics.pipelineDollars)}
              hint="YTD jobs, quoted and incomplete"
            />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2">
            <Link
              href="/projects"
              className="text-xs font-medium text-blue-400 hover:text-blue-300"
            >
              Projects &amp; accounts →
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
        className={canAccessSales(capabilities) ? undefined : "lg:col-span-2"}
      >
        <div className="grid grid-cols-2 gap-3">
          <MetricTile
            label="Active jobs"
            value={metrics.activeProjects}
            hint="YTD jobs in progress"
            tone="info"
          />
          <MetricTile
            label="Completed"
            value={metrics.completedProjects}
            hint="YTD invoiced jobs"
            tone="positive"
          />
          <MetricTile
            label="Supply track"
            value={metrics.supplyActiveCount}
            hint="YTD active jobs"
          />
          <MetricTile
            label="Industrial track"
            value={metrics.industrialActiveCount}
            hint="YTD active jobs"
          />
        </div>
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
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
              <p className="text-xs text-zinc-500">
                Available on-hand records from{" "}
                <code className="text-zinc-500">sheet_stock</code>.
              </p>
            </div>
            {sheetStockLoading ? (
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-6">
                {Array.from({ length: 12 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-24 animate-pulse rounded-lg border border-zinc-800 bg-zinc-950/60"
                  />
                ))}
              </div>
            ) : availableSheetRecords.length > 0 ? (
              <div className="max-h-[13.75rem] overflow-y-auto pr-1">
                <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-6">
                  {availableSheetRecords.map((sheet) => (
                  <li key={sheet.id}>
                    <article className="rounded-lg border border-purple-800/40 bg-gradient-to-b from-zinc-800 to-zinc-900/50 px-2 py-2">
                      <div className="flex items-start justify-between gap-1.5">
                        <p className="truncate text-xs font-semibold text-white">
                          {sheet.label?.trim() || `#${sheet.id.slice(0, 8).toUpperCase()}`}
                        </p>
                        <span
                          className={cn(
                            "shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold",
                            sheetStatusClass(sheet.status),
                          )}
                        >
                          {sheet.status}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <CompactSheetWireframe sheet={sheet} />
                        <div className="min-w-0 text-right">
                          <p className="font-mono text-[11px] text-blue-200">
                            {formatSheetDims(sheet)}
                          </p>
                          <p className="truncate font-mono text-[10px] text-zinc-300">
                            {sheet.thicknessIn === null
                              ? "—"
                              : `${sheet.thicknessIn.toFixed(3)}"`}
                          </p>
                          <p className="font-mono text-[10px] text-emerald-300">
                            {sheet.estWeightLbs === null
                              ? "—"
                              : `${sheet.estWeightLbs.toFixed(1)} lbs`}
                          </p>
                        </div>
                      </div>
                      <p className="mt-1 truncate text-[10px] text-zinc-400">
                        {sheet.material}
                      </p>
                    </article>
                  </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-6 text-center text-sm text-zinc-500">
                No available sheet records found.
              </p>
            )}
            <div className="flex items-center justify-between gap-3 pt-2">
              <Link
                href="/nest-remnants"
                className="text-xs font-medium text-blue-400 hover:text-blue-300"
              >
                Open Nest &amp; remnants
              </Link>
              <div className="inline-flex shrink-0 items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/80 px-2.5 py-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  Active sheet records
                </span>
                <span className="font-mono text-sm font-semibold text-white">
                  {sheetStockLoading
                    ? "…"
                    : sheetStockCount === null
                      ? "—"
                      : sheetStockCount}
                </span>
              </div>
            </div>
          </ZoneCard>
        </div>
      ) : null}
    </div>
  );
}
