import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  getCommandBoardTVSummary,
  type DashboardProjectRow,
} from "@/lib/dashboardMetrics";
import { PROJECT_SELECT } from "@/lib/projectQueries";
import { requireApiRole } from "@/lib/auth/api-guard";
import { canViewShopTv } from "@/lib/auth/roles";

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

  const { data, error } = await adminSupabase
    .from("projects")
    .select(PROJECT_SELECT)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Could not load TV summary." },
      { status: 500 },
    );
  }

  const now = new Date();
  const summary = getCommandBoardTVSummary((data ?? []) as DashboardProjectRow[], now);

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
