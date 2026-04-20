/** Projects list: dashboard-aligned shell, KPIs, TanStack table with search & filters. */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  Activity,
  ChevronDown,
  FolderKanban,
} from "lucide-react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { QuickLinksBar } from "@/components/dashboard/quick-links-bar";
import { ProjectsDataTable } from "@/components/projects/projects-data-table";
import { canViewFinancials, normalizeAppRole } from "@/lib/auth/roles";
import { supabase } from "@/lib/supabaseClient";
import {
  aggregateDashboardMetrics,
  isCancelledProject,
  type DashboardMetrics,
  type DashboardProjectRow,
} from "@/lib/dashboardMetrics";
import { withProjectSelectFallback } from "@/lib/projectQueries";
import { boardColumnForProject } from "@/lib/salesCommandBoardColumn";

function projectDisplayName(project: DashboardProjectRow): string {
  const number = project.project_number ?? "—";
  const name = project.project_name?.trim() || "Untitled";
  return `${number} — ${name}`;
}

function ProjectStateDropdown({
  projects,
}: {
  projects: DashboardProjectRow[];
}) {
  return (
    <details className="group rounded-2xl border border-zinc-800/80 bg-zinc-900/80 p-5 shadow-sm">
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-zinc-400">View projects in this state</span>
          <ChevronDown className="size-4 text-zinc-500 transition group-open:rotate-180" />
        </div>
      </summary>
      <div className="mt-3 max-h-64 space-y-2 overflow-auto pr-1">
        {projects.length === 0 ? (
          <p className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-500">
            No projects in this state.
          </p>
        ) : (
          projects.map((project) => (
            <div
              key={project.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-200">
                  {projectDisplayName(project)}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {(project.customer || "No customer").toUpperCase()}
                </p>
              </div>
              <Link
                href={`/projects/${project.id}`}
                className="shrink-0 rounded-md border border-blue-500/35 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-300 hover:bg-blue-500/20"
              >
                View
              </Link>
            </div>
          ))
        )}
      </div>
    </details>
  );
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

  const role = normalizeAppRole(session.role);
  const showFinancials = canViewFinancials(role);
  const openQuoteProjects = rows.filter((project) => {
    const stage = boardColumnForProject(project);
    return (
      (stage === "rfq_customer" || stage === "rfq_vendors" || stage === "quote_sent") &&
      !isCancelledProject(project)
    );
  });
  const activeProjects = rows.filter(
    (project) =>
      !isCancelledProject(project) && boardColumnForProject(project) !== "invoiced",
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-[92.4rem] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
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
          className="mt-8 grid gap-4 sm:grid-cols-2"
        >
          <div className="space-y-3">
            <KpiCard
              label="Open quotes"
              value={metrics.openQuotes}
              hint="In RFQ / quote stages"
              icon={FolderKanban}
            />
            <ProjectStateDropdown projects={openQuoteProjects} />
          </div>
          <div className="space-y-3">
            <KpiCard
              label="Active jobs"
              value={metrics.activeProjects}
              hint={`${metrics.completedProjects} completed (lifetime)`}
              icon={Activity}
            />
            <ProjectStateDropdown projects={activeProjects} />
          </div>
        </section>

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
