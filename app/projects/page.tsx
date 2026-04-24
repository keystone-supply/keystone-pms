/** Projects list: dashboard-aligned shell, KPIs, TanStack table with search & filters. */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  Activity,
  ChevronDown,
  FolderKanban,
  Truck,
  Users,
} from "lucide-react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { MetricTile } from "@/components/dashboard/metric-tile";
import { QuickLinksBar } from "@/components/dashboard/quick-links-bar";
import {
  CustomersDataTable,
  type CustomerStatusFilter,
} from "@/components/sales/customers-data-table";
import {
  VendorsDataTable,
  type VendorStatusFilter,
} from "@/components/sales/vendors-data-table";
import { Button } from "@/components/ui/button";
import { ProjectsDataTable } from "@/components/projects/projects-data-table";
import { canViewFinancials } from "@/lib/auth/roles";
import { getSessionCapabilitySet } from "@/lib/auth/session-capabilities";
import { CUSTOMER_LIST_SELECT, type CustomerRow } from "@/lib/customerQueries";
import { supabase } from "@/lib/supabaseClient";
import {
  aggregateDashboardMetrics,
  isCancelledProject,
  type DashboardMetrics,
  type DashboardProjectRow,
} from "@/lib/dashboardMetrics";
import { withProjectSelectFallback } from "@/lib/projectQueries";
import { boardColumnForProject } from "@/lib/salesCommandBoardColumn";
import { VENDOR_LIST_SELECT, type VendorRow } from "@/lib/vendorQueries";

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
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>(() =>
    aggregateDashboardMetrics([]),
  );
  const [loading, setLoading] = useState(true);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<CustomerStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [vendorStatusFilter, setVendorStatusFilter] =
    useState<VendorStatusFilter>("all");
  const [vendorSearch, setVendorSearch] = useState("");
  const [customerDirectoryOpen, setCustomerDirectoryOpen] = useState(false);
  const [vendorDirectoryOpen, setVendorDirectoryOpen] = useState(false);

  const { data: session, status } = useSession();

  const fetchProjects = useCallback(async () => {
    const [projectsRes, customersRes, vendorsRes] = await Promise.all([
      withProjectSelectFallback((select) =>
        supabase
          .from("projects")
          .select(select)
          .order("project_number", { ascending: false }),
      ),
      supabase
        .from("customers")
        .select(CUSTOMER_LIST_SELECT)
        .order("legal_name", { ascending: true }),
      supabase
        .from("vendors")
        .select(VENDOR_LIST_SELECT)
        .order("legal_name", { ascending: true }),
    ]);

    if (projectsRes.error) {
      console.error(
        "[Projects] query failed:",
        projectsRes.error.message,
        projectsRes.error,
      );
      setQueryError(projectsRes.error.message);
    } else if (projectsRes.data) {
      const list = projectsRes.data as DashboardProjectRow[];
      setRows(list);
      setMetrics(aggregateDashboardMetrics(list));
      setLastUpdated(new Date());
      setQueryError(null);
    }
    if (!customersRes.error && customersRes.data) {
      setCustomers(customersRes.data as CustomerRow[]);
    }
    if (!vendorsRes.error && vendorsRes.data) {
      setVendors(vendorsRes.data as VendorRow[]);
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        () => {
          void Promise.resolve().then(() => fetchProjects());
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vendors" },
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

  const capabilities = getSessionCapabilitySet(session);
  const showFinancials = canViewFinancials(capabilities);
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
  const customerActiveCount = customers.filter((row) => row.status === "active").length;
  const customerProspectCount = customers.filter((row) => row.status === "prospect").length;
  const customerInactiveCount = customers.filter((row) => row.status === "inactive").length;
  const vendorActiveCount = vendors.filter((row) => row.status === "active").length;
  const vendorInactiveCount = vendors.filter((row) => row.status === "inactive").length;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-[132rem] px-4 py-8 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 lg:py-10">
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
            capabilities={capabilities}
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

        <section
          className="mt-14 rounded-2xl border border-zinc-800/90 bg-zinc-900/60 p-6"
          aria-label="Customer directory"
        >
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCustomerDirectoryOpen((prev) => !prev)}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-950 ring-1 ring-zinc-800 transition hover:bg-zinc-900"
                aria-label={
                  customerDirectoryOpen
                    ? "Collapse customer directory"
                    : "Expand customer directory"
                }
                aria-expanded={customerDirectoryOpen}
              >
                <Users className="size-5 text-blue-400" aria-hidden />
              </button>
              <div>
                <h2 className="text-base font-semibold text-white">
                  Customer directory
                </h2>
                <p className="text-xs text-zinc-500">
                  {customers.length} account{customers.length === 1 ? "" : "s"}{" "}
                  on file - legal entity, contacts, billing, AP, and ship-tos on
                  the account page.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <p className="hidden max-w-xs text-right text-xs text-zinc-500 lg:block">
                Contact, billing, AP, and ship-to details remain on each account profile.
              </p>
              <Button variant="secondary" size="sm" asChild>
                <Link href="/sales/customers/new">Add account</Link>
              </Button>
              <button
                type="button"
                onClick={() => setCustomerDirectoryOpen((prev) => !prev)}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800"
                aria-expanded={customerDirectoryOpen}
              >
                {customerDirectoryOpen ? "Collapse" : "Expand"}
                <ChevronDown
                  className={`size-4 transition ${customerDirectoryOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
            </div>
          </div>

          {customerDirectoryOpen ? (
            <>
              <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricTile
                  label="Accounts"
                  value={customers.length}
                  hint="Total records"
                  tone="info"
                />
                <MetricTile
                  label="Active"
                  value={customerActiveCount}
                  hint="Ready for work"
                  tone="positive"
                />
                <MetricTile
                  label="Prospect"
                  value={customerProspectCount}
                  hint="Pipeline accounts"
                  tone="warning"
                />
                <MetricTile
                  label="Inactive"
                  value={customerInactiveCount}
                  hint="Not in rotation"
                />
              </div>

              <div className="mb-6 grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Search
                  </label>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Legal name, code, contact, city, terms..."
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-zinc-100 placeholder:text-zinc-600"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Status
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as CustomerStatusFilter)
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

              <CustomersDataTable
                data={customers}
                statusFilter={statusFilter}
                search={search}
              />
            </>
          ) : null}
        </section>

        <section
          className="mt-10 rounded-2xl border border-zinc-800/90 bg-zinc-900/60 p-6"
          aria-label="Vendor directory"
        >
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setVendorDirectoryOpen((prev) => !prev)}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-950 ring-1 ring-zinc-800 transition hover:bg-zinc-900"
                aria-label={
                  vendorDirectoryOpen
                    ? "Collapse vendor directory"
                    : "Expand vendor directory"
                }
                aria-expanded={vendorDirectoryOpen}
              >
                <Truck className="size-5 text-amber-400" aria-hidden />
              </button>
              <div>
                <h2 className="text-base font-semibold text-white">
                  Vendor directory
                </h2>
                <p className="text-xs text-zinc-500">
                  {vendors.length} vendor{vendors.length === 1 ? "" : "s"} on
                  file - for RFQs and purchase orders.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" asChild>
                <Link href="/sales/vendors/new">Add vendor</Link>
              </Button>
              <button
                type="button"
                onClick={() => setVendorDirectoryOpen((prev) => !prev)}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800"
                aria-expanded={vendorDirectoryOpen}
              >
                {vendorDirectoryOpen ? "Collapse" : "Expand"}
                <ChevronDown
                  className={`size-4 transition ${vendorDirectoryOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
            </div>
          </div>

          {vendorDirectoryOpen ? (
            <>
              <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricTile
                  label="Vendors"
                  value={vendors.length}
                  hint="Total records"
                  tone="info"
                />
                <MetricTile
                  label="Active"
                  value={vendorActiveCount}
                  hint="Available for RFQs"
                  tone="positive"
                />
                <MetricTile
                  label="Inactive"
                  value={vendorInactiveCount}
                  hint="Not currently sourcing"
                />
                <MetricTile
                  label="Coverage"
                  value={
                    vendors.length === 0
                      ? "0%"
                      : `${Math.round((vendorActiveCount / vendors.length) * 100)}%`
                  }
                  hint="Active share"
                />
              </div>

              <div className="mb-6 grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Search
                  </label>
                  <input
                    value={vendorSearch}
                    onChange={(event) => setVendorSearch(event.target.value)}
                    placeholder="Legal name, code, contact, city, terms..."
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-zinc-100 placeholder:text-zinc-600"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Status
                  </label>
                  <select
                    value={vendorStatusFilter}
                    onChange={(event) =>
                      setVendorStatusFilter(event.target.value as VendorStatusFilter)
                    }
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-zinc-100"
                  >
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <VendorsDataTable
                data={vendors}
                statusFilter={vendorStatusFilter}
                search={vendorSearch}
              />
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
