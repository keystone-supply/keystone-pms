"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Monitor } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";

import { TvProjectTickers } from "@/components/tv/tv-project-tickers";
import {
  getCommandBoardTVSummary,
  type CommandBoardTVSummary,
} from "@/lib/dashboardMetrics";
import { canViewShopTv } from "@/lib/auth/roles";
import { getSessionCapabilitySet } from "@/lib/auth/session-capabilities";

type TvSummaryResponse = {
  summary?: Omit<CommandBoardTVSummary, "lastUpdated"> & { lastUpdated: string };
  error?: string;
};

export default function ShopTVPage() {
  const { data: session, status } = useSession();
  const capabilities = getSessionCapabilitySet(session);
  const [summary, setSummary] = useState<CommandBoardTVSummary>(() =>
    getCommandBoardTVSummary([]),
  );
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch("/api/tv/summary", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response
        .json()
        .catch(() => ({ error: "Invalid TV summary response." }))) as TvSummaryResponse;
      if (!response.ok || !payload.summary) {
        setError(payload.error ?? "Failed to load project data");
        return;
      }
      setSummary({
        ...payload.summary,
        lastUpdated: new Date(payload.summary.lastUpdated),
      });
    } catch (err) {
      console.error("Unexpected error fetching projects:", err);
      setError("Failed to load project data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    setLoading(true);
    fetchSummary();

    // Polling fallback for TV reliability (every 30s)
    const pollInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchSummary();
      }
    }, 30000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [fetchSummary, status]);

  useEffect(() => {
    if (summary.projects.length <= 8) {
      setPageIndex(0);
      return;
    }
    const pages = Math.ceil(summary.projects.length / 8);
    const id = setInterval(() => {
      setPageIndex((prev) => (prev + 1) % pages);
    }, 15000);
    return () => clearInterval(id);
  }, [summary.projects.length]);

  // TV auto-refresh on visibility change (for screen savers / power management)
  useEffect(() => {
    if (status !== "authenticated") return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchSummary();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchSummary, status]);

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-white">
        Loading Shop TV...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center text-zinc-400">
        <p className="mb-6 text-lg text-zinc-300">Sign in to open Shop TV.</p>
        <button
          type="button"
          onClick={() => signIn()}
          className="rounded-2xl bg-blue-600 px-10 py-3.5 text-base font-medium text-white hover:bg-blue-700"
        >
          Sign in
        </button>
      </div>
    );
  }

  if (!canViewShopTv(capabilities)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center text-zinc-400">
        <p className="mb-2 text-lg text-zinc-200">Shop TV access required.</p>
        <p className="mb-6 text-sm text-zinc-500">
          Your role does not have permission to view this surface.
        </p>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="rounded-2xl border border-zinc-700 px-8 py-3 text-sm font-medium text-white hover:bg-zinc-900"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-white">
        <div className="flex flex-col items-center gap-4">
          <Monitor className="size-12 animate-pulse text-zinc-400" />
          <div className="text-xl">Loading Shop TV...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 p-8 text-center text-white">
        <div>
          <div className="mx-auto mb-6 text-6xl">⚠️</div>
          <h2 className="mb-4 text-3xl font-semibold">Connection Issue</h2>
          <p className="text-zinc-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-8 rounded-xl border border-white/30 px-8 py-3 text-sm hover:bg-white/5"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-hidden bg-zinc-950 text-white">
      <div className="mx-auto max-w-[1800px] px-8 py-6">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-6">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10">
              <Activity className="size-7 text-emerald-400" />
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[3px] text-emerald-400/70">
                KEYSTONE SUPPLY
              </div>
              <h1 className="text-4xl font-bold tracking-tighter">SHOP FLOOR TV</h1>
              <p className="text-sm text-zinc-500">Command Board • Live Job Status</p>
            </div>
          </div>

          <div className="flex items-center gap-8 text-sm">
            <div className="flex items-center gap-2 font-mono text-xs text-zinc-400">
              LIVE
              <div className="size-2 animate-pulse rounded-full bg-emerald-400"></div>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <p className="text-xs uppercase tracking-widest text-zinc-500">
              ACTIVE JOBS
            </p>
            <p className="mt-2 font-mono text-5xl text-white">
              {summary.activeProjects.toLocaleString()}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-5">
            <p className="text-xs uppercase tracking-widest text-emerald-300/70">
              IN PROCESS
            </p>
            <p className="mt-2 font-mono text-5xl text-emerald-300">
              {summary.inProcessCount.toLocaleString()}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5">
            <p className="text-xs uppercase tracking-widest text-amber-300/80">
              NEEDS ATTENTION
            </p>
            <p className="mt-2 font-mono text-5xl text-amber-200">
              {summary.recentAttention.length.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <TvProjectTickers projects={summary.projects} pageIndex={pageIndex} />
        </div>

        {summary.recentAttention.length > 0 ? (
          <div className="mt-6 rounded-2xl border border-amber-500/30 bg-zinc-900/70 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300">
              <AlertTriangle className="size-4" />
              Needs attention
            </div>
            <div className="grid gap-2 lg:grid-cols-3">
              {summary.recentAttention.slice(0, 3).map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-amber-500/20 bg-zinc-950/60 px-3 py-2"
                >
                  <p className="font-mono text-sm text-amber-100">
                    #{item.project_number}
                  </p>
                  <p className="text-xs text-zinc-300">{item.project_name}</p>
                  <p className="text-[11px] text-zinc-500">{item.reason}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="fixed bottom-3 right-6 text-[10px] font-mono text-zinc-600">
        Keystone PMS • Updates every 30s • {summary.lastUpdated.toLocaleTimeString()}
      </div>
    </div>
  );
}
