/** Shared defaults and helpers for project financials / quote costing. */

import type { ProjectRow } from "@/lib/projectTypes";

/** Subset of `ProjectRow` used by quote/cost formulas (dashboard rows may omit unrelated columns). */
export type ProjectFinancialsInput = Pick<
  ProjectRow,
  | "materials_vendor_cost"
  | "material_markup_pct"
  | "engineering_markup_pct"
  | "equipment_markup_pct"
  | "logistics_markup_pct"
  | "labor_quoted"
  | "labor_hours_quoted"
  | "labor_cost_per_hr"
  | "labor_sell_per_hr"
  | "labor_hours_actual"
  | "labor_cost_per_hr_actual"
  | "labor_cost"
  | "engineering_quoted"
  | "equipment_quoted"
  | "logistics_quoted"
  | "taxes_quoted"
>;

export const DEFAULT_MATERIAL_MARKUP_PCT = 30;

/** Markup % columns that use `DEFAULT_MATERIAL_MARKUP_PCT` when null in DB. */
export const PROJECT_MARKUP_PCT_KEYS = [
  "material_markup_pct",
  "engineering_markup_pct",
  "equipment_markup_pct",
  "logistics_markup_pct",
] as const satisfies readonly (keyof ProjectRow)[];

export type ProjectMarkupPctKey = (typeof PROJECT_MARKUP_PCT_KEYS)[number];

/** Align stored markups with what the project detail UI displays (30 when null/NaN). */
export function normalizeProjectMarkupPctsForEditor(row: ProjectRow): ProjectRow {
  const next = { ...row };
  for (const k of PROJECT_MARKUP_PCT_KEYS) {
    const v = next[k];
    if (v == null || Number.isNaN(v)) {
      (next as Record<string, number | null | undefined>)[k] =
        DEFAULT_MATERIAL_MARKUP_PCT;
    }
  }
  return next;
}

export function effectiveMaterialMarkupPct(
  pct: number | null | undefined,
): number {
  if (pct == null || Number.isNaN(pct)) return DEFAULT_MATERIAL_MARKUP_PCT;
  return pct;
}

/**
 * Customer line from internal basis: basis × (1 + markup/100).
 * Markup applies to materials, engineering, equipment, logistics — not labor or taxes.
 */
export function customerLineFromBasis(basis: number, markupPct: number): number {
  const b = Math.max(0, basis);
  const m = Math.max(0, markupPct);
  return Math.round(b * (1 + m / 100) * 100) / 100;
}

/** Dollar markup on a line: customer line − basis (rounded to cents). */
export function markupDollarsFromBasis(basis: number, customerLine: number): number {
  const b = Math.max(0, basis);
  const c = Math.max(0, customerLine);
  return Math.round((c - b) * 100) / 100;
}

/** @deprecated Prefer customerLineFromBasis for customer line; kept for any legacy callers. */
export function materialsQuotedFromBasis(
  basis: number,
  markupPct: number,
): number {
  return customerLineFromBasis(basis, markupPct);
}

/** Materials internal basis: vendor / purchase cost only. */
export function quotedMaterialsInternalBasis(project: ProjectFinancialsInput): number {
  const vendor = project.materials_vendor_cost;
  if (vendor == null || Number.isNaN(vendor)) return 0;
  return Math.max(0, vendor);
}

function num(n: number | null | undefined): number {
  if (n == null || Number.isNaN(n)) return 0;
  return n;
}

/** Quoted internal labor cost: hours × cost/hr when breakdown present, else labor_quoted. */
export function quotedLaborInternalCost(project: ProjectFinancialsInput): number {
  const h = project.labor_hours_quoted;
  const rate = project.labor_cost_per_hr;
  if (h != null && rate != null && !Number.isNaN(h) && !Number.isNaN(rate)) {
    return Math.round(Math.max(0, h) * Math.max(0, rate) * 100) / 100;
  }
  return Math.max(0, num(project.labor_quoted));
}

/** Customer-side quoted labor revenue: hours × sell/hr; legacy rows without breakdown → 0. */
export function quotedLaborCustomerLine(project: ProjectFinancialsInput): number {
  const h = project.labor_hours_quoted;
  const sell = project.labor_sell_per_hr;
  if (h != null && sell != null && !Number.isNaN(h) && !Number.isNaN(sell)) {
    return Math.round(Math.max(0, h) * Math.max(0, sell) * 100) / 100;
  }
  return 0;
}

/**
 * Sum of estimated internal job costs (basis): materials + labor + eng + equip + log + taxes.
 */
export function computeQuotedInternalCostTotal(project: ProjectFinancialsInput): number {
  const m = quotedMaterialsInternalBasis(project);
  const lab = quotedLaborInternalCost(project);
  const sum =
    m +
    lab +
    Math.max(0, num(project.engineering_quoted)) +
    Math.max(0, num(project.equipment_quoted)) +
    Math.max(0, num(project.logistics_quoted)) +
    Math.max(0, num(project.taxes_quoted));
  return Math.round(sum * 100) / 100;
}

/**
 * Auto customer quote total: marked-up non-labor lines + pass-through taxes + labor sell.
 */
export function computeQuoteCustomerTotal(project: ProjectFinancialsInput): number {
  const matPct = effectiveMaterialMarkupPct(project.material_markup_pct);
  const matBasis = quotedMaterialsInternalBasis(project);
  const materials = customerLineFromBasis(matBasis, matPct);
  const eng = customerLineFromBasis(
    Math.max(0, num(project.engineering_quoted)),
    effectiveMaterialMarkupPct(project.engineering_markup_pct),
  );
  const equip = customerLineFromBasis(
    Math.max(0, num(project.equipment_quoted)),
    effectiveMaterialMarkupPct(project.equipment_markup_pct),
  );
  const log = customerLineFromBasis(
    Math.max(0, num(project.logistics_quoted)),
    effectiveMaterialMarkupPct(project.logistics_markup_pct),
  );
  const taxes = Math.max(0, num(project.taxes_quoted));
  const laborSell = quotedLaborCustomerLine(project);
  const total =
    materials + eng + equip + log + taxes + laborSell;
  return Math.round(total * 100) / 100;
}

/** Actual labor cost from hours × rate when both set; else existing labor_cost. */
export function computeLaborCostFromActualBreakdown(
  project: ProjectFinancialsInput,
): number {
  const h = project.labor_hours_actual;
  const rate = project.labor_cost_per_hr_actual;
  if (h != null && rate != null && !Number.isNaN(h) && !Number.isNaN(rate)) {
    return Math.round(Math.max(0, h) * Math.max(0, rate) * 100) / 100;
  }
  return Math.max(0, num(project.labor_cost));
}

export type QuoteDerivationPatch = Pick<
  ProjectRow,
  "total_quoted" | "labor_quoted" | "materials_quoted"
>;

/** Patches to persist so aggregates and Supabase stay aligned with formulas. */
export function syncQuoteDerivations(project: ProjectFinancialsInput): QuoteDerivationPatch {
  const matPct = effectiveMaterialMarkupPct(project.material_markup_pct);
  const matBasis = quotedMaterialsInternalBasis(project);
  const materialsCustomerLine = customerLineFromBasis(matBasis, matPct);
  return {
    labor_quoted: quotedLaborInternalCost(project),
    total_quoted: computeQuoteCustomerTotal(project),
    materials_quoted: materialsCustomerLine,
  };
}

export type ActualLaborPatch = Pick<ProjectRow, "labor_cost">;

export function syncActualLaborCost(project: ProjectFinancialsInput): ActualLaborPatch {
  return { labor_cost: computeLaborCostFromActualBreakdown(project) };
}

/** Non-zero customer quote lines for PDFs (extended amounts match `computeQuoteCustomerTotal`). */
export function buildQuoteCustomerLineExtendeds(project: ProjectFinancialsInput): {
  key: string;
  label: string;
  extended: number;
}[] {
  const out: { key: string; label: string; extended: number }[] = [];

  const mat = customerLineFromBasis(
    quotedMaterialsInternalBasis(project),
    effectiveMaterialMarkupPct(project.material_markup_pct),
  );
  if (mat > 0) out.push({ key: "materials", label: "Materials", extended: mat });

  const eng = customerLineFromBasis(
    Math.max(0, num(project.engineering_quoted)),
    effectiveMaterialMarkupPct(project.engineering_markup_pct),
  );
  if (eng > 0)
    out.push({ key: "engineering", label: "Engineering", extended: eng });

  const equip = customerLineFromBasis(
    Math.max(0, num(project.equipment_quoted)),
    effectiveMaterialMarkupPct(project.equipment_markup_pct),
  );
  if (equip > 0) out.push({ key: "equipment", label: "Equipment", extended: equip });

  const log = customerLineFromBasis(
    Math.max(0, num(project.logistics_quoted)),
    effectiveMaterialMarkupPct(project.logistics_markup_pct),
  );
  if (log > 0)
    out.push({ key: "logistics", label: "Logistics", extended: log });

  const taxes = Math.max(0, num(project.taxes_quoted));
  if (taxes > 0)
    out.push({ key: "taxes", label: "Taxes & fees", extended: taxes });

  const labor = quotedLaborCustomerLine(project);
  if (labor > 0) out.push({ key: "labor", label: "Labor", extended: labor });

  return out;
}
