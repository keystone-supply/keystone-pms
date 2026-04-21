import type { SupabaseClient } from "@supabase/supabase-js";

import { calcRowToTapeLine, tapeLineToCalcRow } from "@/lib/calcLines/calcLineMapping";
import {
  PROJECT_CALC_LINE_SELECT,
  PROJECT_CALC_TAPE_SELECT,
  type ProjectCalcLineRow,
  type ProjectCalcTapeRow,
} from "@/lib/calcLines/types";
import { formatRiversideDateWithMt } from "@/lib/time/riversideDisplay";
import type { UnifiedTapeLine } from "@/lib/unifiedTapeTypes";

function toError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return new Error(message);
    }
  }
  return new Error(fallback);
}

function defaultTapeName(lines: UnifiedTapeLine[]): string {
  const dateLabel = formatRiversideDateWithMt(new Date());
  const firstWeight = lines.find((line) => line.kind === "weight");
  if (firstWeight?.kind === "weight") {
    const material = firstWeight.item.materialName || "Material";
    return `${material} tape ${dateLabel}`;
  }
  return `Tape ${dateLabel}`;
}

export async function saveTapeToProject(
  supabase: SupabaseClient,
  projectId: string,
  lines: UnifiedTapeLine[],
  name?: string,
): Promise<string> {
  const tapeName = (name ?? "").trim() || defaultTapeName(lines);
  const { data: insertedTape, error: tapeError } = await supabase
    .from("project_calc_tapes")
    .insert({
      project_id: projectId,
      name: tapeName,
      source: "weight_calc",
    })
    .select("id")
    .single();

  if (tapeError || !insertedTape) {
    throw toError(tapeError, "Could not create tape.");
  }

  const tapeId = insertedTape.id as string;
  const lineRows = lines.map((line, index) =>
    tapeLineToCalcRow(line, index, projectId, tapeId),
  );

  if (lineRows.length > 0) {
    const { error: linesError } = await supabase
      .from("project_calc_lines")
      .insert(lineRows);
    if (linesError) {
      await supabase.from("project_calc_tapes").delete().eq("id", tapeId);
      throw toError(linesError, "Could not save tape lines.");
    }
  }

  return tapeId;
}

export async function listProjectTapes(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectCalcTapeRow[]> {
  const { data, error } = await supabase
    .from("project_calc_tapes")
    .select(PROJECT_CALC_TAPE_SELECT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw toError(error, "Could not list project tapes.");
  return (data ?? []) as ProjectCalcTapeRow[];
}

export async function loadTapeFromProject(
  supabase: SupabaseClient,
  tapeId: string,
): Promise<{ tape: ProjectCalcTapeRow; lines: UnifiedTapeLine[] }> {
  const [{ data: tapeData, error: tapeError }, { data: lineData, error: lineError }] =
    await Promise.all([
      supabase
        .from("project_calc_tapes")
        .select(PROJECT_CALC_TAPE_SELECT)
        .eq("id", tapeId)
        .single(),
      supabase
        .from("project_calc_lines")
        .select(PROJECT_CALC_LINE_SELECT)
        .eq("tape_id", tapeId)
        .order("position", { ascending: true }),
    ]);

  if (tapeError || !tapeData) {
    throw toError(tapeError, "Tape not found.");
  }
  if (lineError) throw toError(lineError, "Could not load tape lines.");

  const lines = ((lineData ?? []) as ProjectCalcLineRow[]).map(calcRowToTapeLine);
  return { tape: tapeData as ProjectCalcTapeRow, lines };
}

export async function renameProjectTape(
  supabase: SupabaseClient,
  tapeId: string,
  name: string,
) {
  const next = name.trim();
  if (!next) throw new Error("Tape name is required.");
  const { error } = await supabase
    .from("project_calc_tapes")
    .update({ name: next })
    .eq("id", tapeId);
  if (error) throw toError(error, "Could not rename tape.");
}

export async function deleteProjectTape(
  supabase: SupabaseClient,
  tapeId: string,
) {
  const { error } = await supabase
    .from("project_calc_tapes")
    .delete()
    .eq("id", tapeId);
  if (error) throw toError(error, "Could not delete tape.");
}
