import type { UnifiedTapeLine } from "@/lib/unifiedTapeTypes";
import {
  LEGACY_PIPAD_STORAGE_KEY,
  type SavedTapeRecord as LegacySavedTapeRecord,
} from "@/lib/pipadTapeStorage";
import { getMaterialTapeLineSummaryRows } from "@/lib/weightCalculationText";

const STORAGE_KEY = "keystone-unified-tape-saved";

export type SavedUnifiedTapeRecord = {
  id: string;
  savedAt: number;
  lines: UnifiedTapeLine[];
};

function isUnifiedTapeLine(x: unknown): x is UnifiedTapeLine {
  if (x === null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.kind !== "string") return false;
  if (o.kind === "math") return typeof o.expr === "string";
  if (o.kind === "weight") {
    if (o.item === null || typeof o.item !== "object") return false;
    if (typeof o.calculationText !== "string") return false;
    const it = o.item as Record<string, unknown>;
    return (
      typeof it.id === "string" &&
      typeof it.material === "string" &&
      typeof it.shape === "string"
    );
  }
  return false;
}

function isSavedUnifiedRecord(x: unknown): x is SavedUnifiedTapeRecord {
  if (x === null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.savedAt !== "number") return false;
  if (!Array.isArray(o.lines)) return false;
  return o.lines.every(isUnifiedTapeLine);
}

function isLegacySavedRecord(x: unknown): x is LegacySavedTapeRecord {
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

function migrateLegacyTapes(): SavedUnifiedTapeRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LEGACY_PIPAD_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const legacy = parsed.filter(isLegacySavedRecord);
    return legacy.map((rec) => ({
      id: rec.id,
      savedAt: rec.savedAt,
      lines: rec.lines.map((row) => ({
        id: crypto.randomUUID(),
        kind: "math" as const,
        expr: row.expr,
      })),
    }));
  } catch {
    return [];
  }
}

function runMigrationIfNeeded(): void {
  if (typeof window === "undefined") return;
  try {
    const cur = window.localStorage.getItem(STORAGE_KEY);
    if (cur) {
      try {
        const parsed = JSON.parse(cur) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) return;
      } catch {
        return;
      }
    }
    const migrated = migrateLegacyTapes();
    if (migrated.length === 0) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
  } catch {
    /* ignore */
  }
}

export function loadSavedUnifiedTapes(): SavedUnifiedTapeRecord[] {
  if (typeof window === "undefined") return [];
  runMigrationIfNeeded();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedUnifiedRecord);
  } catch {
    return [];
  }
}

function saveUnifiedTapes(tapes: SavedUnifiedTapeRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tapes));
  } catch {
    /* quota */
  }
}

export function addSavedUnifiedTape(
  lines: UnifiedTapeLine[],
): SavedUnifiedTapeRecord[] {
  const record: SavedUnifiedTapeRecord = {
    id: crypto.randomUUID(),
    savedAt: Date.now(),
    lines: lines.map((l) =>
      l.kind === "math"
        ? { ...l }
        : { ...l, item: { ...l.item } },
    ),
  };
  const next = [record, ...loadSavedUnifiedTapes()];
  saveUnifiedTapes(next);
  return next;
}

export function deleteSavedUnifiedTape(id: string): SavedUnifiedTapeRecord[] {
  const next = loadSavedUnifiedTapes().filter((t) => t.id !== id);
  saveUnifiedTapes(next);
  return next;
}

/** Label for saved tapes: reflects tape line #1 (same idea as the first row in the tape). */
export function unifiedSavedTapeTitle(lines: UnifiedTapeLine[]): string {
  if (lines.length === 0) return "(empty tape)";
  const first = lines[0];
  if (first.kind === "math") {
    const e = first.expr.trim();
    return e || "(empty math line)";
  }
  const { typeShape } = getMaterialTapeLineSummaryRows(first.item);
  return typeShape || first.item.materialName || "(material line)";
}
