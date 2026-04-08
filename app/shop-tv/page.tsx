"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Monitor } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";

import { TVCommandMetrics } from "@/components/tv/tv-command-metrics";
import {
  getCommandBoardTVSummary,
  type CommandBoardTVSummary,
} from "@/lib/dashboardMetrics";
import { canViewShopTv, normalizeAppRole } from "@/lib/auth/roles";

type TvSummaryResponse = {
  summary?: Omit<CommandBoardTVSummary, "lastUpdated"> & { lastUpdated: string };
  error?: string;
};

export default function ShopTVPage() {
  const { data: session, status } = useSession();
  const role = normalizeAppRole(session?.role);
  const [summary, setSummary] = useState<CommandBoardTVSummary>(() =>
    getCommandBoardTVSummary([]),
  );
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

  if (!canViewShopTv(role)) {
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
    <div className="min-h-screen bg-zinc-950 text-white overflow-hidden">
      <div className="mx-auto max-w-[1600px] px-8 py-6">
        {/* TV Header - Minimal */}
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

        <TVCommandMetrics summary={summary} className="mt-10" />

        {/* Network Access Guide - Visible on TV */}
        <div className="mt-12 rounded-3xl border border-blue-500/30 bg-zinc-900/80 p-8">
          <div className="flex items-center gap-4 mb-6">
            <Monitor className="size-8 text-blue-400" />
            <div>
              <h3 className="text-2xl font-semibold text-blue-300">Access from Shop TV / Monitor</h3>
              <p className="text-zinc-400">On another device on the same network</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8 text-sm">
            <div>
              <div className="font-mono text-xs uppercase tracking-widest text-zinc-500 mb-2">1. START TV SERVER</div>
              <div className="rounded-xl bg-zinc-950 p-4 font-mono text-emerald-300 text-xs leading-relaxed border border-emerald-500/20">
                npm run dev:tv
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                This runs on all network interfaces (0.0.0.0). Look for the IP in terminal.
              </p>
            </div>

            <div>
              <div className="font-mono text-xs uppercase tracking-widest text-zinc-500 mb-2">2. FIND LAPTOP IP (Windows 11)</div>
              <div className="rounded-xl bg-zinc-950 p-4 font-mono text-amber-300 text-xs leading-relaxed border border-amber-500/20">
                Open PowerShell or CMD and run:<br />
                ipconfig
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                Look for &quot;IPv4 Address&quot; under Wireless LAN or Ethernet adapter (e.g. 192.168.1.105)
              </p>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-zinc-700 text-center">
            <div className="text-xs text-zinc-400 mb-1">OPEN THIS URL ON THE TV BROWSER:</div>
            <div className="inline-flex items-center gap-3 rounded-2xl bg-zinc-950 px-8 py-4 font-mono text-lg text-white border border-blue-500/40">
              http://YOUR-LAPTOP-IP:3000/shop-tv
            </div>
            <p className="mt-4 text-[10px] text-zinc-500 max-w-md mx-auto">
              Replace YOUR-LAPTOP-IP with the address from ipconfig. The TV must be on the same WiFi/network.
            </p>
          </div>
        </div>
      </div>

      {/* Subtle footer for TV context */}
      <div className="fixed bottom-3 right-6 text-[10px] font-mono text-zinc-600">
        Keystone PMS • Updates every 30s • {summary.lastUpdated.toLocaleDateString()}
      </div>
    </div>
  );
}
