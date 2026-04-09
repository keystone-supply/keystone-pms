/** Dashboard: manufacturing metrics from Supabase, drill-downs to projects & tools. */
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Activity,
  DollarSign,
  FolderKanban,
  Percent,
  TrendingUp,
} from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { QuickLinksBar } from "@/components/dashboard/quick-links-bar";
import { RoleZones } from "@/components/dashboard/role-zones";
import { SecondaryPanels } from "@/components/dashboard/secondary-panels";
import {
  canManageSheetStock,
  canViewFinancials,
  normalizeAppRole,
} from "@/lib/auth/roles";
import {
  aggregateDashboardMetrics,
  type DashboardMetrics,
  type DashboardProjectRow,
} from "@/lib/dashboardMetrics";
import { PROJECT_SELECT } from "@/lib/projectQueries";

function formatUsd(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics>(() =>
    aggregateDashboardMetrics([]),
  );
  const [loading, setLoading] = useState(true);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sheetStockCount, setSheetStockCount] = useState<number | null>(null);
  const [sheetStockLoading, setSheetStockLoading] = useState(true);

  const { data: session, status } = useSession();

  const fetchProjects = useCallback(async () => {
    const { data, error } = await supabase.from("projects").select(PROJECT_SELECT);
    if (error) {
      console.error("[Dashboard] projects query failed:", error.message, error);
      setQueryError(error.message);
    } else {
      const rows = (data ?? []) as DashboardProjectRow[];
      setMetrics(aggregateDashboardMetrics(rows));
      setLastUpdated(new Date());
      setQueryError(null);
    }
    setLoading(false);
  }, []);

  const fetchSheetStockCount = useCallback(async () => {
    setSheetStockLoading(true);
    const { count, error } = await supabase
      .from("sheet_stock")
      .select("*", { count: "exact", head: true })
      .or("is_archived.is.null,is_archived.eq.false");
    if (error) setSheetStockCount(null);
    else setSheetStockCount(count ?? 0);
    setSheetStockLoading(false);
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    const role = normalizeAppRole(session?.role);
    void Promise.resolve().then(() => fetchProjects());
    if (canManageSheetStock(role)) {
      void Promise.resolve().then(() => fetchSheetStockCount());
    } else {
      queueMicrotask(() => setSheetStockCount(null));
      queueMicrotask(() => setSheetStockLoading(false));
    }

    const channel = supabase
      .channel("dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        () => {
          void Promise.resolve().then(() => fetchProjects());
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [status, session?.role, fetchProjects, fetchSheetStockCount]);

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-white">
        Loading Keystone PMS...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-white">
        <div className="text-center">
          <p className="mb-2 bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-sm font-semibold uppercase tracking-[0.25em] text-transparent">
            Keystone PMS
          </p>
          <h1 className="mb-3 text-4xl font-bold tracking-tight sm:text-5xl">
            Keystone Supply
          </h1>
          <p className="mb-12 text-lg text-zinc-400">
            Project management &amp; shop operations
          </p>
          <button
            type="button"
            onClick={() => signIn()}
            className="rounded-2xl bg-blue-600 px-10 py-3.5 text-base font-medium hover:bg-blue-700"
          >
            Sign in
          </button>
          <p className="mt-8 text-sm text-zinc-500">
            Microsoft and credentials sign-in are supported
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-10 text-center text-lg text-white">
        Loading dashboard…
      </div>
    );
  }

  if (queryError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 p-10 text-center text-white">
        <p className="text-sm font-medium text-red-400">
          Failed to load dashboard data
        </p>
        <p className="max-w-md text-xs text-zinc-400">{queryError}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void fetchProjects();
          }}
          className="rounded-lg bg-zinc-800 px-4 py-2 text-xs hover:bg-zinc-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const marginDisplay =
    metrics.avgMarginPct === null ? "—" : `${metrics.avgMarginPct}%`;
  const role = normalizeAppRole(session.role);
  const showFinancials = canViewFinancials(role);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <DashboardHeader
          userName={session?.user?.name}
          lastUpdated={lastUpdated}
          onSignOut={() => signOut({ callbackUrl: "/" })}
        />

        <div className="mt-8">
          <QuickLinksBar
            openQuotesCount={metrics.openQuotes}
            activeHref="/"
            role={role}
          />
        </div>

        <section
          aria-label="Primary KPIs"
          className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <KpiCard
            label="Pipeline (incomplete)"
            value={formatUsd(metrics.pipelineDollars)}
            hint="Sum of quoted $ on open jobs"
            icon={TrendingUp}
            href="/projects"
          />
          <KpiCard
            label="YTD invoiced"
            value={formatUsd(metrics.ytdInvoiced)}
            hint="Invoiced this calendar year"
            icon={DollarSign}
            href="/projects"
          />
          <KpiCard
            label="Open quotes"
            value={metrics.openQuotes}
            hint="Awaiting customer approval"
            icon={FolderKanban}
            href="/projects"
          />
          <KpiCard
            label="Active jobs"
            value={metrics.activeProjects}
            hint={`${metrics.completedProjects} completed (lifetime)`}
            icon={Activity}
            href="/projects"
          />
        </section>

        {showFinancials ? (
          <section
            aria-label="Profitability snapshot"
            className="mt-4 grid gap-4 sm:grid-cols-2"
          >
            <KpiCard
              label="Total P&L (realized)"
              value={formatUsd(metrics.totalPl)}
              icon={TrendingUp}
              href="/projects"
              valueClassName={
                metrics.totalPl >= 0 ? "text-emerald-400" : "text-red-400"
              }
            />
            <KpiCard
              label="Avg margin (invoiced jobs)"
              value={marginDisplay}
              icon={Percent}
              href="/projects"
            />
          </section>
        ) : null}

        <div className="mt-10 space-y-10">
          <RoleZones
            metrics={metrics}
            sheetStockCount={sheetStockCount}
            sheetStockLoading={sheetStockLoading}
            role={role}
          />
          <SecondaryPanels metrics={metrics} />
        </div>
      </div>
    </div>
  );
}
