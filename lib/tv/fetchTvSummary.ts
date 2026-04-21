import type { CommandBoardTVSummary } from "@/lib/dashboardMetrics";

type TvSummaryResponse = {
  summary?: Omit<CommandBoardTVSummary, "lastUpdated"> & { lastUpdated: string };
  error?: string;
};

export async function fetchTvSummary(): Promise<CommandBoardTVSummary> {
  const response = await fetch("/api/tv/summary", {
    method: "GET",
    cache: "no-store",
  });
  const payload = (await response
    .json()
    .catch(() => ({ error: "Invalid TV summary response." }))) as TvSummaryResponse;
  if (!response.ok || !payload.summary) {
    throw new Error(payload.error ?? "Failed to load project data");
  }
  return {
    ...payload.summary,
    lastUpdated: new Date(payload.summary.lastUpdated),
  };
}
