"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSession } from "next-auth/react";

import { setSupabaseBridgeAccessToken } from "@/lib/supabaseClient";

type SupabaseTokenResponse = {
  accessToken: string;
  expiresAt: number;
};

type SupabaseBridgeContextValue = {
  isReady: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const SupabaseBridgeContext = createContext<SupabaseBridgeContextValue | null>(null);

async function requestSupabaseToken(): Promise<SupabaseTokenResponse> {
  const response = await fetch("/api/auth/supabase-token", {
    method: "GET",
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as
    | SupabaseTokenResponse
    | { error?: string };
  const errorMessage =
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof data.error === "string"
      ? data.error
      : "Could not establish a Supabase session.";
  if (!response.ok || !("accessToken" in data) || !("expiresAt" in data)) {
    throw new Error(errorMessage);
  }
  return data;
}

export function SupabaseBridgeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useSession();
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshFnRef = useRef<() => Promise<void>>(async () => {});

  const clearRefreshTimeout = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (status !== "authenticated") {
      setSupabaseBridgeAccessToken(null);
      setError(null);
      setIsReady(true);
      return;
    }
    try {
      const tokenData = await requestSupabaseToken();
      setSupabaseBridgeAccessToken(tokenData.accessToken);
      setError(null);
      setIsReady(true);
      clearRefreshTimeout();
      const msUntilExpiry = tokenData.expiresAt * 1000 - Date.now();
      const refreshInMs = Math.max(msUntilExpiry - 60_000, 15_000);
      refreshTimeoutRef.current = setTimeout(() => {
        void refreshFnRef.current();
      }, refreshInMs);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not establish a Supabase session.";
      console.error("[SupabaseBridge] Token acquisition failed:", message);
      setSupabaseBridgeAccessToken(null);
      setError(message);
      setIsReady(true);
    }
  }, [clearRefreshTimeout, status]);

  useEffect(() => {
    refreshFnRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    clearRefreshTimeout();
    if (status === "loading") {
      queueMicrotask(() => setIsReady(false));
      return;
    }
    if (status !== "authenticated") {
      setSupabaseBridgeAccessToken(null);
      setError(null);
      queueMicrotask(() => setIsReady(true));
      return;
    }
    queueMicrotask(() => setIsReady(false));
    queueMicrotask(() => {
      void refreshFnRef.current();
    });
    return () => {
      clearRefreshTimeout();
    };
  }, [clearRefreshTimeout, refresh, status]);

  const value = useMemo<SupabaseBridgeContextValue>(
    () => ({
      isReady,
      error,
      refresh,
    }),
    [isReady, error, refresh],
  );

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-200">
        <p className="text-sm">Establishing secure database session...</p>
      </div>
    );
  }

  if (error) {
    return (
      <SupabaseBridgeContext.Provider value={value}>
        <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-200">
          <div className="max-w-md space-y-3 text-center">
            <p className="text-sm font-medium text-red-400">
              Database session failed
            </p>
            <p className="text-xs text-zinc-400">{error}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-xs hover:bg-zinc-700"
            >
              Retry
            </button>
          </div>
        </div>
      </SupabaseBridgeContext.Provider>
    );
  }

  return (
    <SupabaseBridgeContext.Provider value={value}>
      {children}
    </SupabaseBridgeContext.Provider>
  );
}

export function useSupabaseBridge(): SupabaseBridgeContextValue {
  const context = useContext(SupabaseBridgeContext);
  if (!context) {
    throw new Error("useSupabaseBridge must be used within SupabaseBridgeProvider.");
  }
  return context;
}
