import { NextRequest, NextResponse } from "next/server";

import { requireApiRole } from "@/lib/auth/api-guard";
import { hasCapability } from "@/lib/auth/roles";
import { adminSupabase } from "@/lib/supabaseAdmin";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; fileId: string }> },
) {
  const authResult = await requireApiRole(
    request,
    (role) => hasCapability(role, "read_projects"),
    "Your role cannot open project files.",
  );
  if (!authResult.ok) return authResult.response;
  if (!adminSupabase) {
    return NextResponse.json(
      { error: "Files API is not configured." },
      { status: 500 },
    );
  }

  const params = await context.params;
  const { data, error } = await adminSupabase
    .from("project_files")
    .select("web_url")
    .eq("project_id", params.id)
    .eq("id", params.fileId)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
  const webUrl = (data as { web_url?: string | null }).web_url ?? null;
  if (!webUrl) {
    return NextResponse.json({ error: "File does not have web URL." }, { status: 409 });
  }
  return NextResponse.json({ webUrl });
}
