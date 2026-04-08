/**
 * Persist quote-relevant project financial fields on saved quote/invoice documents
 * (`metadata.quoteFinancialsSnapshot`) so they can be re-applied to the project form.
 */

import type { ProjectRow } from "@/lib/projectTypes";

export const QUOTE_FINANCIALS_SNAPSHOT_VERSION = 1 as const;

/** Financial fields captured when saving a quote or invoice draft. */
const SNAPSHOT_KEYS = [
  "materials_vendor_cost",
  "materials_quoted",
  "material_markup_pct",
  "engineering_markup_pct",
  "equipment_markup_pct",
  "logistics_markup_pct",
  "labor_quoted",
  "labor_hours_quoted",
  "labor_cost_per_hr",
  "labor_sell_per_hr",
  "engineering_quoted",
  "equipment_quoted",
  "logistics_quoted",
  "taxes_quoted",
  "total_quoted",
] as const satisfies readonly (keyof ProjectRow)[];

export type QuoteFinancialsSnapshotKey = (typeof SNAPSHOT_KEYS)[number];

export type QuoteFinancialsSnapshotV1 = {
  version: typeof QUOTE_FINANCIALS_SNAPSHOT_VERSION;
  capturedAt: string;
} & Partial<Pick<ProjectRow, QuoteFinancialsSnapshotKey>>;

function isFiniteNumberOrNull(v: unknown): v is number | null {
  return v === null || (typeof v === "number" && Number.isFinite(v));
}

/** Build a snapshot from the current project row (as shown in Project financials). */
export function buildQuoteFinancialsSnapshot(project: ProjectRow): QuoteFinancialsSnapshotV1 {
  const out: QuoteFinancialsSnapshotV1 = {
    version: QUOTE_FINANCIALS_SNAPSHOT_VERSION,
    capturedAt: new Date().toISOString(),
  };
  for (const k of SNAPSHOT_KEYS) {
    const v = project[k];
    out[k] =
      v === undefined || v === null || (typeof v === "number" && Number.isNaN(v))
        ? null
        : v;
  }
  return out;
}

function parseSnapshotBody(raw: unknown): QuoteFinancialsSnapshotV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== QUOTE_FINANCIALS_SNAPSHOT_VERSION) return null;
  if (typeof o.capturedAt !== "string" || !o.capturedAt) return null;
  const out: QuoteFinancialsSnapshotV1 = {
    version: QUOTE_FINANCIALS_SNAPSHOT_VERSION,
    capturedAt: o.capturedAt,
  };
  let anyFinancial = false;
  for (const k of SNAPSHOT_KEYS) {
    if (!(k in o)) continue;
    const v = o[k];
    if (!isFiniteNumberOrNull(v)) return null;
    out[k] = v;
    anyFinancial = true;
  }
  return anyFinancial ? out : null;
}

/** Read `quoteFinancialsSnapshot` from document `metadata` jsonb. */
export function readQuoteFinancialsSnapshotFromMetadata(
  metadata: unknown,
): QuoteFinancialsSnapshotV1 | null {
  if (!metadata || typeof metadata !== "object") return null;
  const q = (metadata as { quoteFinancialsSnapshot?: unknown }).quoteFinancialsSnapshot;
  return parseSnapshotBody(q);
}

/** Map snapshot to project patch (fields present on the snapshot only). */
export function snapshotToProjectPatch(
  snapshot: QuoteFinancialsSnapshotV1,
): Partial<ProjectRow> {
  const patch: Partial<ProjectRow> = {};
  for (const k of SNAPSHOT_KEYS) {
    if (!(k in snapshot)) continue;
    const v = snapshot[k];
    if (v !== undefined) {
      patch[k] = v as ProjectRow[typeof k];
    }
  }
  return patch;
}

/** Document kinds that record and can restore a quote financials snapshot. */
export function documentKindSupportsQuoteFinancialsSnapshot(kind: string): boolean {
  return kind === "quote" || kind === "invoice";
}
