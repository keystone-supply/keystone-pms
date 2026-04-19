/** Projects list: dashboard-aligned shell, KPIs, TanStack table with search & filters. */
"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  Activity,
  DollarSign,
  FolderKanban,
  Percent,
  TrendingUp,
} from "lucide-react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { QuickLinksBar } from "@/components/dashboard/quick-links-bar";
import { ProjectsDataTable } from "@/components/projects/projects-data-table";
import { canViewFinancials, normalizeAppRole } from "@/lib/auth/roles";
import { supabase } from "@/lib/supabaseClient";
import {
  aggregateDashboardMetrics,
  type DashboardMetrics,
  type DashboardProjectRow,
} from "@/lib/dashboardMetrics";
import { withProjectSelectFallback } from "@/lib/projectQueries";

function formatUsd(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function ProjectsPage() {
  const [rows, setRows] = useState<DashboardProjectRow[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>(() =>
    aggregateDashboardMetrics([]),
  );
  const [loading, setLoading] = useState(true);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const { data: session, status } = useSession();

  const fetchProjects = useCallback(async () => {
    const { data, error } = await withProjectSelectFallback((select) =>
      supabase
        .from("projects")
        .select(select)
        .order("project_number", { ascending: false }),
    );

    if (error) {
      console.error("[Projects] query failed:", error.message, error);
      setQueryError(error.message);
    } else if (data) {
      const list = data as DashboardProjectRow[];
      setRows(list);
      setMetrics(aggregateDashboardMetrics(list));
      setLastUpdated(new Date());
      setQueryError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    void Promise.resolve().then(() => fetchProjects());

    const channel = supabase
      .channel("projects-realtime")
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
  }, [status, fetchProjects]);

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-white">
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center text-zinc-400">
        <p className="mb-6 text-lg text-zinc-300">Sign in to view all projects.</p>
        <button
          type="button"
          onClick={() => signIn()}
          className="rounded-2xl bg-blue-600 px-8 py-3 text-sm font-medium text-white hover:bg-blue-700"
        >
          Sign in
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-10 text-center text-lg text-white">
        Loading projects…
      </div>
    );
  }

  if (queryError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 p-10 text-center text-white">
        <p className="text-sm font-medium text-red-400">
          Failed to load projects
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
          title="All projects"
          subtitle="Search, filter, and open any job — financial columns match dashboard and project detail formulas."
        />

        <div className="mt-8">
          <QuickLinksBar
            openQuotesCount={metrics.openQuotes}
            activeHref="/projects"
            newProjectHref="/new-project?returnTo=%2Fprojects"
            role={role}
          />
        </div>

        <section
          aria-label="Project portfolio KPIs"
          className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <KpiCard
            label="Pipeline (incomplete)"
            value={formatUsd(metrics.pipelineDollars)}
            hint="Sum of quoted $ on open jobs"
            icon={TrendingUp}
          />
          <KpiCard
            label="YTD invoiced"
            value={formatUsd(metrics.ytdInvoiced)}
            hint="Invoiced this calendar year"
            icon={DollarSign}
          />
          <KpiCard
            label="Open quotes"
            value={metrics.openQuotes}
            hint="Awaiting customer approval"
            icon={FolderKanban}
          />
          <KpiCard
            label="Active jobs"
            value={metrics.activeProjects}
            hint={`${metrics.completedProjects} completed (lifetime)`}
            icon={Activity}
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
              valueClassName={
                metrics.totalPl >= 0 ? "text-emerald-400" : "text-red-400"
              }
            />
            <KpiCard
              label="Avg margin (invoiced jobs)"
              value={marginDisplay}
              icon={Percent}
            />
          </section>
        ) : null}

        <section className="mt-10" aria-label="Project list">
          <ProjectsDataTable
            data={rows}
            canViewFinancialColumns={showFinancials}
          />
        </section>
      </div>
    </div>
  );
}
