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
      setIsReady(true);
      return;
    }
    const tokenData = await requestSupabaseToken();
    setSupabaseBridgeAccessToken(tokenData.accessToken);
    setIsReady(true);
    clearRefreshTimeout();
    const msUntilExpiry = tokenData.expiresAt * 1000 - Date.now();
    const refreshInMs = Math.max(msUntilExpiry - 60_000, 15_000);
    refreshTimeoutRef.current = setTimeout(() => {
      void refreshFnRef.current();
    }, refreshInMs);
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
      queueMicrotask(() => setIsReady(true));
      return;
    }
    queueMicrotask(() => setIsReady(false));
    queueMicrotask(() => {
      void refreshFnRef.current().catch(() => {
        setSupabaseBridgeAccessToken(null);
        setIsReady(true);
      });
    });
    return () => {
      clearRefreshTimeout();
    };
  }, [clearRefreshTimeout, refresh, status]);

  const value = useMemo<SupabaseBridgeContextValue>(
    () => ({
      isReady,
      refresh,
    }),
    [isReady, refresh],
  );

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-200">
        <p className="text-sm">Establishing secure database session...</p>
      </div>
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
