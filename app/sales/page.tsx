/** Sales hub: pipeline KPIs from projects + customer CRM directory. */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  Activity,
  DollarSign,
  FolderKanban,
  Percent,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { QuickLinksBar } from "@/components/dashboard/quick-links-bar";
import {
  CustomersDataTable,
  type CustomerStatusFilter,
} from "@/components/sales/customers-data-table";
import { SalesCommandBoard } from "@/components/sales/sales-command-board";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import {
  CUSTOMER_LIST_SELECT,
  type CustomerRow,
} from "@/lib/customerQueries";
import {
  aggregateDashboardMetrics,
  type AttentionItem,
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

const MS_DAY = 86400000;

function followUpBucket(
  followUpAt: string | null,
  now: Date,
): "overdue" | "week" | null {
  if (!followUpAt) return null;
  const t = new Date(followUpAt).getTime();
  if (Number.isNaN(t)) return null;
  if (t < now.getTime()) return "overdue";
  if (t <= now.getTime() + 7 * MS_DAY) return "week";
  return null;
}

export default function SalesPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [projectRows, setProjectRows] = useState<DashboardProjectRow[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>(() =>
    aggregateDashboardMetrics([]),
  );
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<CustomerStatusFilter>("all");
  const [search, setSearch] = useState("");

  const { data: session, status } = useSession();

  const fetchAll = useCallback(async () => {
    const [projRes, custRes] = await Promise.all([
      supabase.from("projects").select(PROJECT_SELECT),
      supabase
        .from("customers")
        .select(CUSTOMER_LIST_SELECT)
        .order("legal_name", { ascending: true }),
    ]);

    if (!projRes.error && projRes.data) {
      const rows = projRes.data as DashboardProjectRow[];
      setProjectRows(rows);
      setMetrics(aggregateDashboardMetrics(rows));
    }
    if (!custRes.error && custRes.data) {
      setCustomers(custRes.data as CustomerRow[]);
    }
    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    void Promise.resolve().then(() => fetchAll());

    const ch = supabase
      .channel("sales-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        () => {
          void fetchAll();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        () => {
          void fetchAll();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [status, fetchAll]);

  const attentionByProjectId = useMemo(() => {
    const m = new Map<string, AttentionItem>();
    for (const a of metrics.needsAttention) {
      m.set(a.id, a);
    }
    return m;
  }, [metrics.needsAttention]);

  const followUpAccounts = useMemo(() => {
    const now = new Date();
    const out: { row: CustomerRow; kind: "overdue" | "week" }[] = [];
    for (const c of customers) {
      const b = followUpBucket(c.follow_up_at, now);
      if (b) out.push({ row: c, kind: b });
    }
    out.sort((a, b) => {
      const ta = a.row.follow_up_at
        ? new Date(a.row.follow_up_at).getTime()
        : 0;
      const tb = b.row.follow_up_at
        ? new Date(b.row.follow_up_at).getTime()
        : 0;
      return ta - tb;
    });
    return out.slice(0, 12);
  }, [customers]);

  const winDisplay =
    metrics.winRatePct === null ? "—" : `${metrics.winRatePct}%`;
  const marginDisplay =
    metrics.avgMarginPct === null ? "—" : `${metrics.avgMarginPct}%`;

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
        <p className="mb-6 text-lg text-zinc-300">Sign in to open Sales.</p>
        <button
          type="button"
          onClick={() => signIn("azure-ad")}
          className="rounded-2xl bg-blue-600 px-8 py-3 text-sm font-medium text-white hover:bg-blue-700"
        >
          Sign in with Microsoft
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-10 text-center text-lg text-white">
        Loading sales hub…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <DashboardHeader
          userName={session?.user?.name}
          lastUpdated={lastUpdated}
          onSignOut={() => signOut({ callbackUrl: "/" })}
          title="Sales hub"
          subtitle="Pipeline and quote metrics from jobs, plus customer master data, ship-tos, and AP terms — one place for commercial sales."
        />

        <div className="mt-8">
          <QuickLinksBar
            openQuotesCount={metrics.openQuotes}
            activeHref="/sales"
            newProjectHref="/new-project?returnTo=%2Fsales"
          />
        </div>

        <section
          aria-label="Sales KPIs"
          className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <KpiCard
            label="Pipeline (incomplete)"
            value={formatUsd(metrics.pipelineDollars)}
            hint="Quoted $ on open jobs"
            icon={TrendingUp}
            href="/projects"
          />
          <KpiCard
            label="Open quotes"
            value={metrics.openQuotes}
            hint="Pending customer approval"
            icon={FolderKanban}
            href="/projects"
          />
          <KpiCard
            label="Win rate"
            value={winDisplay}
            hint={`${metrics.quotesAccepted} accepted · ${metrics.quotesRejected} rejected`}
            icon={Percent}
            href="/projects"
          />
          <KpiCard
            label="YTD invoiced"
            value={formatUsd(metrics.ytdInvoiced)}
            hint="Calendar year"
            icon={DollarSign}
            href="/projects"
          />
        </section>

        <section
          aria-label="Quote funnel"
          className="mt-4 grid gap-4 lg:grid-cols-3"
        >
          <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/60 p-5">
            <h2 className="text-sm font-semibold text-white">Quote funnel</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Counts from job records (customer approval).
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Pending</dt>
                <dd className="font-mono tabular-nums text-amber-300">
                  {metrics.openQuotes}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Accepted</dt>
                <dd className="font-mono tabular-nums text-emerald-400">
                  {metrics.quotesAccepted}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Rejected</dt>
                <dd className="font-mono tabular-nums text-red-400">
                  {metrics.quotesRejected}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/60 p-5">
            <h2 className="text-sm font-semibold text-white">Top accounts</h2>
            <p className="mt-1 text-xs text-zinc-500">
              By invoiced revenue (project customer field).
            </p>
            <ol className="mt-4 space-y-2 text-sm">
              {metrics.topCustomers.length === 0 ? (
                <li className="text-zinc-500">No invoiced jobs yet.</li>
              ) : (
                metrics.topCustomers.map((t) => (
                  <li
                    key={t.rank}
                    className="flex justify-between gap-2 border-b border-zinc-800/80 py-1 last:border-0"
                  >
                    <span className="truncate text-zinc-300">{t.customer}</span>
                    <span className="shrink-0 font-mono text-zinc-400">
                      {formatUsd(t.revenue)}
                    </span>
                  </li>
                ))
              )}
            </ol>
            <Link
              href="/projects"
              className="mt-3 inline-block text-xs font-medium text-blue-400 hover:text-blue-300"
            >
              Open jobs →
            </Link>
          </div>

          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-5">
            <div className="flex items-start gap-3">
              <Wallet className="size-8 shrink-0 text-zinc-500" aria-hidden />
              <div>
                <h2 className="text-sm font-semibold text-white">
                  AR & collections
                </h2>
                <p className="mt-2 text-sm text-zinc-500">
                  Aging buckets and collection workflows are not wired yet. When
                  invoicing syncs here, this panel can show open AR by account
                  and terms.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-label="Ops crossover"
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          <KpiCard
            label="Active jobs"
            value={metrics.activeProjects}
            hint={`${metrics.completedProjects} completed (lifetime)`}
            icon={Activity}
            href="/projects"
          />
          <KpiCard
            label="Avg margin (invoiced)"
            value={marginDisplay}
            icon={Percent}
            href="/projects"
          />
        </section>

        <SalesCommandBoard
          projects={projectRows}
          setProjects={setProjectRows}
          customers={customers}
          setCustomers={setCustomers}
          attentionByProjectId={attentionByProjectId}
          formatUsd={formatUsd}
        />

        <section className="mt-10" aria-label="Customer directory">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-3">
              <Users className="size-8 text-blue-400" aria-hidden />
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Customer directory
                </h2>
                <p className="text-sm text-zinc-500">
                  {customers.length} account{customers.length === 1 ? "" : "s"}{" "}
                  on file · legal entity, contacts, billing, AP, ship-tos on the
                  account page.
                </p>
              </div>
            </div>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/sales/customers/new">Add account</Link>
            </Button>
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Search
              </label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Legal name, code, contact, city, terms…"
                className="w-full rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as CustomerStatusFilter)
                }
                className="w-full rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-zinc-100"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="prospect">Prospect</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="mb-10 grid gap-6 lg:grid-cols-[1fr_280px]">
            <CustomersDataTable
              data={customers}
              statusFilter={statusFilter}
              search={search}
            />
            <aside className="rounded-2xl border border-zinc-800/90 bg-zinc-900/50 p-5">
              <h3 className="text-sm font-semibold text-white">Follow-ups</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Overdue or due within 7 days.
              </p>
              <ul className="mt-4 space-y-3 text-sm">
                {followUpAccounts.length === 0 ? (
                  <li className="text-zinc-500">None scheduled.</li>
                ) : (
                  followUpAccounts.map(({ row, kind }) => (
                    <li key={row.id}>
                      <Link
                        href={`/sales/customers/${row.id}`}
                        className="font-medium text-blue-400 hover:text-blue-300"
                      >
                        {row.legal_name}
                      </Link>
                      <p
                        className={
                          kind === "overdue"
                            ? "text-xs text-red-400"
                            : "text-xs text-amber-400"
                        }
                      >
                        {kind === "overdue" ? "Overdue" : "Due this week"}
                        {row.follow_up_at
                          ? ` · ${new Intl.DateTimeFormat(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            }).format(new Date(row.follow_up_at))}`
                          : ""}
                      </p>
                    </li>
                  ))
                )}
              </ul>
            </aside>
          </div>
        </section>
      </div>
    </div>
  );
}
