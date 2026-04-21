/** Dashboard: manufacturing metrics from Supabase, drill-downs to projects & tools. */
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { signIn, signOut, useSession } from "next-auth/react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { QuickLinksBar } from "@/components/dashboard/quick-links-bar";
import {
  RoleZones,
  type DashboardSheetRecord,
} from "@/components/dashboard/role-zones";
import { SecondaryPanels } from "@/components/dashboard/secondary-panels";
import {
  canManageSheetStock,
  canViewFinancials,
} from "@/lib/auth/roles";
import { getSessionCapabilitySet } from "@/lib/auth/session-capabilities";
import {
  aggregateDashboardMetrics,
  type DashboardMetrics,
  type DashboardProjectRow,
} from "@/lib/dashboardMetrics";
import { withProjectSelectFallback } from "@/lib/projectQueries";

export default function Dashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics>(() =>
    aggregateDashboardMetrics([], new Date(), "dashboard_ytd_except_open_quotes"),
  );
  const [loading, setLoading] = useState(true);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sheetStockCount, setSheetStockCount] = useState<number | null>(null);
  const [activeSheetRecords, setActiveSheetRecords] = useState<
    DashboardSheetRecord[]
  >([]);
  const [sheetStockLoading, setSheetStockLoading] = useState(true);

  const { data: session, status } = useSession();

  const fetchProjects = useCallback(async () => {
    const { data, error, usedLegacySelect } = await withProjectSelectFallback(
      (select) => supabase.from("projects").select(select),
    );
    if (error) {
      console.error("[Dashboard] projects query failed:", error.message, error);
      setQueryError(error.message);
    } else {
      if (usedLegacySelect) {
        console.warn(
          "[Dashboard] using legacy project select because ticker columns are missing. Run latest Supabase migrations.",
        );
      }
      const rows = (data ?? []) as DashboardProjectRow[];
      setMetrics(
        aggregateDashboardMetrics(
          rows,
          new Date(),
          "dashboard_ytd_except_open_quotes",
        ),
      );
      setLastUpdated(new Date());
      setQueryError(null);
    }
    setLoading(false);
  }, []);

  const fetchSheetStockCount = useCallback(async () => {
    setSheetStockLoading(true);
    const { data, count, error } = await supabase
      .from("sheet_stock")
      .select(
        "id,label,svg_path,material,length_in,width_in,thickness_in,est_weight_lbs,status,notes,is_archived,created_at",
        { count: "exact" },
      )
      .or("is_archived.is.null,is_archived.eq.false")
      .order("created_at", { ascending: false });
    if (error) {
      setSheetStockCount(null);
      setActiveSheetRecords([]);
    } else {
      setSheetStockCount(count ?? 0);
      const rows = (data ?? []) as Array<{
        id?: string | null;
        label?: string | null;
        svg_path?: string | null;
        material?: string | null;
        length_in?: number | string | null;
        width_in?: number | string | null;
        thickness_in?: number | string | null;
        est_weight_lbs?: number | string | null;
        status?: string | null;
        notes?: string | null;
        is_archived?: boolean | null;
      }>;
      const mapped: DashboardSheetRecord[] = rows.map((row) => {
        const statusRaw = String(row.status ?? "available").toLowerCase();
        const normalized = statusRaw === "scrapped" ? "scrap" : statusRaw;
        const status =
          row.is_archived === true
            ? "Archived"
            : normalized === "allocated"
              ? "Allocated"
              : normalized === "consumed"
                ? "Consumed"
                : normalized === "scrap"
                  ? "Scrap"
                  : "Available";
        return {
          id: String(row.id ?? ""),
          label: typeof row.label === "string" ? row.label : null,
          svgPath:
            typeof row.svg_path === "string" && row.svg_path.trim()
              ? row.svg_path.trim()
              : null,
          material:
            typeof row.material === "string" && row.material.trim()
              ? row.material
              : "Unknown",
          lengthIn: Number(row.length_in) || null,
          widthIn: Number(row.width_in) || null,
          thicknessIn: Number(row.thickness_in) || null,
          estWeightLbs: Number(row.est_weight_lbs) || null,
          status,
          notes: typeof row.notes === "string" ? row.notes : null,
        };
      });
      setActiveSheetRecords(mapped);
    }
    setSheetStockLoading(false);
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    const capabilities = getSessionCapabilitySet(session);
    void Promise.resolve().then(() => fetchProjects());
    if (canManageSheetStock(capabilities)) {
      void Promise.resolve().then(() => fetchSheetStockCount());
    } else {
      queueMicrotask(() => setSheetStockCount(null));
      queueMicrotask(() => setActiveSheetRecords([]));
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
  }, [status, session, fetchProjects, fetchSheetStockCount]);

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

  const capabilities = getSessionCapabilitySet(session);
  const showFinancials = canViewFinancials(capabilities);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-[92.4rem] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <DashboardHeader
          userName={session?.user?.name}
          lastUpdated={lastUpdated}
          onSignOut={() => signOut({ callbackUrl: "/" })}
        />

        <div className="mt-8">
          <QuickLinksBar
            openQuotesCount={metrics.openQuotes}
            activeHref="/"
            capabilities={capabilities}
          />
        </div>

        <div className="mt-10 space-y-10">
          <RoleZones
            metrics={metrics}
            sheetStockCount={sheetStockCount}
            activeSheetRecords={activeSheetRecords}
            sheetStockLoading={sheetStockLoading}
            capabilities={capabilities}
          />
          <SecondaryPanels metrics={metrics} showFinancials={showFinancials} />
        </div>
      </div>
    </div>
  );
}
