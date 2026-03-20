import { evaluateTapeLineExpressions } from "@/lib/tapeCalculator";

export type SavedTapeLine = { expr: string };

export type SavedTapeRecord = {
  id: string;
  savedAt: number;
  lines: SavedTapeLine[];
};

export const LEGACY_PIPAD_STORAGE_KEY = "keystone-pipad-calc-saved-tapes";
const STORAGE_KEY = LEGACY_PIPAD_STORAGE_KEY;

function isSavedTapeRecord(x: unknown): x is SavedTapeRecord {
  if (x === null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.savedAt !== "number") return false;
  if (!Array.isArray(o.lines)) return false;
  return o.lines.every(
    (row) =>
      row !== null &&
      typeof row === "object" &&
      typeof (row as { expr?: unknown }).expr === "string",
  );
}

export function loadSavedTapes(): SavedTapeRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedTapeRecord);
  } catch {
    return [];
  }
}

export function saveSavedTapes(tapes: SavedTapeRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tapes));
  } catch {
    /* quota */
  }
}

/** Newest first. */
export function addSavedTape(lines: SavedTapeLine[]): SavedTapeRecord[] {
  const record: SavedTapeRecord = {
    id: crypto.randomUUID(),
    savedAt: Date.now(),
    lines: lines.map((l) => ({ expr: l.expr })),
  };
  const next = [record, ...loadSavedTapes()];
  saveSavedTapes(next);
  return next;
}

export function deleteSavedTape(id: string): SavedTapeRecord[] {
  const next = loadSavedTapes().filter((t) => t.id !== id);
  saveSavedTapes(next);
  return next;
}

export function tapeDisplayTitle(lines: SavedTapeLine[]): string {
  const first = lines[0]?.expr?.trim() ?? "";
  return first || "(empty)";
}

export function buildTapeExportText(lines: SavedTapeLine[]): string {
  const exprs = lines.map((l) => l.expr);
  const evals = evaluateTapeLineExpressions(exprs);
  return exprs
    .map((expr, i) => {
      const e = evals[i];
      const r = e.error
        ? `=(error)`
        : e.display
          ? `=${e.display}`
          : "";
      return `${expr}\t${r}`;
    })
    .join("\n");
}

export function tapeExportFilename(lines: SavedTapeLine[]): string {
  const base = tapeDisplayTitle(lines);
  const sanitized = base
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const name =
    !sanitized || sanitized === "(empty)" ? "pipad-tape" : sanitized;
  return `${name}-${stamp}.txt`;
}
