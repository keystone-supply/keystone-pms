import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  getCommandBoardTVSummaryWithTickers,
  type TvProjectTickerRow,
  type DashboardProjectRow,
  isCancelledProject,
} from "@/lib/dashboardMetrics";
import { boardColumnForProject } from "@/lib/salesCommandBoardColumn";
import { withProjectSelectFallback } from "@/lib/projectQueries";
import { requireApiRole } from "@/lib/auth/api-guard";
import { canViewShopTv } from "@/lib/auth/roles";
import { deriveProjectStatusTicker } from "@/lib/projectStatusTicker";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
const adminSupabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      })
    : null;

export async function GET(request: NextRequest) {
  const authResult = await requireApiRole(
    request,
    canViewShopTv,
    "Your role cannot view Shop TV data.",
  );
  if (!authResult.ok) {
    return authResult.response;
  }

  if (!adminSupabase) {
    return NextResponse.json(
      { error: "TV summary service is not configured." },
      { status: 500 },
    );
  }

  const { data, error } = await withProjectSelectFallback((select) =>
    adminSupabase
      .from("projects")
      .select(select)
      .order("updated_at", { ascending: false }),
  );

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Could not load TV summary." },
      { status: 500 },
    );
  }

  const now = new Date();
  const projects = (data ?? []) as DashboardProjectRow[];
  const dayAgoMs = now.getTime() - 24 * 60 * 60 * 1000;
  const tickerRows: TvProjectTickerRow[] = projects
    .filter((project) => {
      return (
        !isCancelledProject(project) &&
        boardColumnForProject(project) !== "invoiced"
      );
    })
    .map((project) => {
      const ticker = deriveProjectStatusTicker(project, now);
      const movedInLast24h = ticker.stages.some((stage) => {
        if (!stage.reachedAt) return false;
        const reachedMs = new Date(stage.reachedAt).getTime();
        return Number.isFinite(reachedMs) && reachedMs >= dayAgoMs;
      });
      return {
        project_number: String(project.project_number ?? ""),
        project_name: String(project.project_name ?? ""),
        customer: String(project.customer ?? ""),
        ticker,
        moved_in_last_24h: movedInLast24h,
      };
    });
  const summary = getCommandBoardTVSummaryWithTickers(projects, tickerRows, now);

  return NextResponse.json(
    {
      summary: {
        ...summary,
        lastUpdated: summary.lastUpdated.toISOString(),
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
