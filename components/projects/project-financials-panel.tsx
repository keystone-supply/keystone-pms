"use client";

import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";
import {
  computeLaborCostFromActualBreakdown,
  customerLineFromBasis,
  computeQuotedInternalCostTotal,
  computeQuoteCustomerTotal,
  DEFAULT_MATERIAL_MARKUP_PCT,
  effectiveMaterialMarkupPct,
  markupDollarsFromBasis,
  quotedLaborCustomerLine,
  quotedLaborInternalCost,
  quotedMaterialsInternalBasis,
} from "@/lib/projectFinancials";
import type { ProjectRow } from "@/lib/projectTypes";

const detailFieldMono =
  "w-full rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 font-mono tabular-nums text-white placeholder:text-zinc-500 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/30";
const topMetricCardClass =
  "flex min-h-[132px] h-full flex-col rounded-2xl border border-zinc-700/80 bg-zinc-950 px-4 py-4";

const moneyFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatMoney(value: number): string {
  return `$${moneyFormatter.format(roundToCents(value))}`;
}

function formatPercent(value: number): string {
  return `${roundToCents(value).toFixed(2)}%`;
}

function parseMoneyInput(raw: string): number | null {
  const normalized = raw.replace(/[$,\s]/g, "");
  if (normalized === "") return null;
  const parsed = parseFloat(normalized);
  if (Number.isNaN(parsed)) return 0;
  return roundToCents(parsed);
}

function InfoHintButton({ detail }: { detail: string }) {
  return (
    <button
      type="button"
      className="inline-flex size-5 items-center justify-center rounded-full border border-zinc-700 text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
      aria-label={detail}
      title={detail}
    >
      <HelpCircle className="size-3.5" />
    </button>
  );
}

type QuoteBasisBucketConfig = {
  basisKey: keyof ProjectRow;
  markupKey: keyof ProjectRow;
  title: string;
};

const QUOTE_BASIS_BUCKETS: QuoteBasisBucketConfig[] = [
  {
    basisKey: "engineering_quoted",
    markupKey: "engineering_markup_pct",
    title: "Engineering",
  },
  {
    basisKey: "equipment_quoted",
    markupKey: "equipment_markup_pct",
    title: "Equipment",
  },
  {
    basisKey: "logistics_quoted",
    markupKey: "logistics_markup_pct",
    title: "Logistics",
  },
];

function QuoteLineCostMarkupReadouts({
  internalBasis,
  customerLine,
}: {
  internalBasis: number;
  customerLine: number;
}) {
  const markup$ = markupDollarsFromBasis(internalBasis, customerLine);
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-zinc-700/80 bg-zinc-950 px-4 py-3">
        <div className="text-xs text-zinc-500">Internal cost (basis)</div>
        <div className="font-mono text-lg text-zinc-200">
          {formatMoney(internalBasis)}
        </div>
      </div>
      <div className="rounded-xl border border-zinc-700/80 bg-zinc-950 px-4 py-3">
        <div className="text-xs text-zinc-500">Markup $</div>
        <div className="font-mono text-lg text-zinc-200">
          {formatMoney(markup$)}
        </div>
      </div>
      <div className="rounded-xl border border-zinc-700/80 bg-zinc-950 px-4 py-3">
        <div className="text-xs text-zinc-500">Customer line</div>
        <div className="font-mono text-lg text-zinc-200">
          {formatMoney(customerLine)}
        </div>
      </div>
    </div>
  );
}

const REALIZED_FIELDS: (keyof ProjectRow)[] = [
  "material_cost",
  "engineering_cost",
  "equipment_cost",
  "logistics_cost",
  "additional_costs",
];

const REALIZED_LABELS: Partial<Record<keyof ProjectRow, string>> = {
  material_cost: "Actual material cost",
  engineering_cost: "Actual engineering cost",
  equipment_cost: "Actual equipment cost",
  logistics_cost: "Actual logistics cost",
  additional_costs: "Additional costs",
};

export type ProjectFinancialsPanelProps = {
  project: ProjectRow;
  applyFinancialPatch: (patch: Partial<ProjectRow>) => void;
};

/** Quote / estimate: markup, materials, labor hours, other bases, auto quote total. */
export function ProjectQuoteFinancialsPanel({
  project,
  applyFinancialPatch,
}: ProjectFinancialsPanelProps) {
  const matBasis = quotedMaterialsInternalBasis(project);
  const matMarkupPct = effectiveMaterialMarkupPct(project.material_markup_pct);
  const materialsCustomerLine = customerLineFromBasis(matBasis, matMarkupPct);

  const totalQuoted = computeQuoteCustomerTotal(project);
  const totalQuotedCosts = computeQuotedInternalCostTotal(project);

  const estimatedPl = totalQuoted - totalQuotedCosts;
  const estimatedMarginPct = totalQuoted > 0 ? (estimatedPl / totalQuoted) * 100 : 0;

  const costsExceedQuote =
    totalQuoted > 0 && totalQuotedCosts > totalQuoted + 0.005;

  const quoteLaborBreakdown =
    project.labor_hours_quoted != null &&
    project.labor_cost_per_hr != null &&
    !Number.isNaN(project.labor_hours_quoted) &&
    !Number.isNaN(project.labor_cost_per_hr);

  const laborSellPreview = quotedLaborCustomerLine(project);
  const laborInternalPreview = quotedLaborInternalCost(project);

  const taxesBasis = Math.max(0, project.taxes_quoted ?? 0);

  return (
    <div className="space-y-6 rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
      <div>
        <h2 className="text-xl font-semibold">Project financials</h2>
        <div className="mt-1 flex items-center gap-2 text-sm text-zinc-500">
          <p>Estimate math and markup controls.</p>
          <InfoHintButton detail="Each markable line has its own markup %. Labor uses sell $/hr, and taxes pass through without markup." />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 text-sm">
        <div className={`${topMetricCardClass} border-sky-800/60 bg-sky-950/40`}>
          <div className="flex items-center justify-between gap-2 text-sm text-zinc-500">
            <span>Customer quote total</span>
            <InfoHintButton detail="Auto-calculated from all quote lines and stored on save." />
          </div>
          <div className="mt-2 text-2xl font-mono font-bold text-sky-100 sm:text-3xl">
            {formatMoney(totalQuoted)}
          </div>
        </div>
        <div className={topMetricCardClass}>
          <div className="flex items-center justify-between gap-2 text-sm text-zinc-500">
            <span>Estimated internal costs</span>
            <InfoHintButton detail="Sum of vendor materials, labor at cost/hr, taxes, and other basis costs." />
          </div>
          <div className="mt-2 text-2xl font-mono font-bold text-zinc-200 sm:text-3xl">
            {formatMoney(totalQuotedCosts)}
          </div>
        </div>
        <div className={`${topMetricCardClass} border-sky-800/60 bg-sky-950/30`}>
          <div className="flex items-center justify-between gap-2 text-sm text-sky-400">
            <span>Estimated P&amp;L</span>
            <InfoHintButton detail="Quote total minus estimated internal costs." />
          </div>
          <div className="mt-2 text-2xl font-mono font-bold text-sky-200 sm:text-3xl">
            {formatMoney(estimatedPl)}
          </div>
          <div className="mt-1 text-sm text-sky-400">{formatPercent(estimatedMarginPct)} margin</div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Materials (vendor / purchase)
        </h4>
        <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
          <p>Vendor spend plus markup for customer pricing.</p>
          <InfoHintButton detail="Internal cost is vendor spend. Customer line = basis × (1 + markup%)." />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">
              Vendor / materials (internal basis)
            </label>
            <input
              type="number"
              value={project.materials_vendor_cost ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                applyFinancialPatch({
                  materials_vendor_cost: parseMoneyInput(raw),
                });
              }}
              className={detailFieldMono}
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">
              Markup % (materials)
            </label>
            <input
              type="number"
              value={
                project.material_markup_pct != null
                  ? project.material_markup_pct
                  : DEFAULT_MATERIAL_MARKUP_PCT
              }
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                applyFinancialPatch({
                  material_markup_pct: Number.isNaN(v) ? null : roundToCents(v),
                });
              }}
              className={detailFieldMono}
            />
          </div>
        </div>
        <QuoteLineCostMarkupReadouts
          internalBasis={matBasis}
          customerLine={materialsCustomerLine}
        />
      </div>

      {costsExceedQuote ? (
        <div
          className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
          role="status"
        >
          Estimated internal costs exceed the customer quote total — margin on
          this estimate is negative unless the quote is raised.
        </div>
      ) : null}

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Labor (hours)
        </h4>
        <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
          <p>Hours drive internal and customer labor lines.</p>
          <InfoHintButton detail="Internal labor = hours × internal cost/hr. Customer labor = hours × sell/hr, with no markup %." />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Hours</label>
            <input
              type="number"
              value={project.labor_hours_quoted ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                applyFinancialPatch({
                  labor_hours_quoted: parseMoneyInput(raw),
                });
              }}
              className={detailFieldMono}
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">
              Cost $/hr (internal)
            </label>
            <input
              type="number"
              value={project.labor_cost_per_hr ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                applyFinancialPatch({
                  labor_cost_per_hr: parseMoneyInput(raw),
                });
              }}
              className={detailFieldMono}
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">
              Sell $/hr (customer)
            </label>
            <input
              type="number"
              value={project.labor_sell_per_hr ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                applyFinancialPatch({
                  labor_sell_per_hr: parseMoneyInput(raw),
                });
              }}
              className={detailFieldMono}
              placeholder="0"
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-700/80 bg-zinc-950 px-4 py-3">
            <div className="text-xs text-zinc-500">Internal labor (est.)</div>
            <div className="font-mono text-lg text-zinc-200">
              {formatMoney(laborInternalPreview)}
            </div>
            {!quoteLaborBreakdown ? (
              <p className="mt-1 text-xs text-amber-200/80">
                Enter hours and cost/hr, or set internal labor below.
              </p>
            ) : null}
          </div>
          <div className="rounded-xl border border-zinc-700/80 bg-zinc-950 px-4 py-3">
            <div className="text-xs text-zinc-500">Customer labor line</div>
            <div className="font-mono text-lg text-zinc-200">
              {formatMoney(laborSellPreview)}
            </div>
          </div>
        </div>
        {!quoteLaborBreakdown ? (
          <div className="mt-4">
            <label className="mb-1 block text-xs text-zinc-500">
              Internal labor $ (legacy — if hours/cost not set)
            </label>
            <input
              type="number"
              value={project.labor_quoted ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                applyFinancialPatch({
                  labor_quoted: parseMoneyInput(raw),
                });
              }}
              className={detailFieldMono}
              placeholder="0"
            />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 text-sm">
        {QUOTE_BASIS_BUCKETS.map(({ basisKey, markupKey, title }) => {
          const basisRaw =
            (project[basisKey] as number | null | undefined) ?? 0;
          const basis = Math.max(0, basisRaw);
          const pct = effectiveMaterialMarkupPct(
            project[markupKey] as number | null | undefined,
          );
          const customerLine = customerLineFromBasis(basis, pct);
          return (
            <div
              key={basisKey}
              className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4"
            >
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {title} (internal / cost basis)
              </h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">
                    Internal basis ($)
                  </label>
                  <input
                    type="number"
                    value={
                      (project[basisKey] as number | null | undefined) ?? ""
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      applyFinancialPatch({
                        [basisKey]: parseMoneyInput(raw),
                      } as Partial<ProjectRow>);
                    }}
                    className={detailFieldMono}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-500">
                    Markup %
                  </label>
                  <input
                    type="number"
                    value={
                      project[markupKey] != null
                        ? (project[markupKey] as number)
                        : DEFAULT_MATERIAL_MARKUP_PCT
                    }
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      applyFinancialPatch({
                        [markupKey]: Number.isNaN(v) ? null : roundToCents(v),
                      } as Partial<ProjectRow>);
                    }}
                    className={detailFieldMono}
                  />
                </div>
              </div>
              <QuoteLineCostMarkupReadouts
                internalBasis={basis}
                customerLine={customerLine}
              />
            </div>
          );
        })}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Taxes &amp; fees (pass-through)
          </h4>
          <label className="mb-1 block text-xs text-zinc-500">
            Amount (internal = customer, no markup)
          </label>
          <input
            type="number"
            value={project.taxes_quoted ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              applyFinancialPatch({
                taxes_quoted: parseMoneyInput(raw),
              });
            }}
            className={detailFieldMono}
            placeholder="0"
          />
          <QuoteLineCostMarkupReadouts
            internalBasis={taxesBasis}
            customerLine={taxesBasis}
          />
        </div>
      </div>
    </div>
  );
}

/** Actuals: invoiced amount, realized P&amp;L, labor hours, cost buckets. */
export function ProjectActualsFinancialsPanel({
  project,
  applyFinancialPatch,
}: ProjectFinancialsPanelProps) {
  const laborCostComputed = (() => {
    const h = project.labor_hours_actual;
    const r = project.labor_cost_per_hr_actual;
    return h != null && r != null && !Number.isNaN(h) && !Number.isNaN(r);
  })();

  const totalActualCosts =
    (project.material_cost || 0) +
    (project.labor_cost || 0) +
    (project.engineering_cost || 0) +
    (project.equipment_cost || 0) +
    (project.logistics_cost || 0) +
    (project.additional_costs || 0);

  const pl =
    (project.invoiced_amount || 0) -
    ((project.material_cost || 0) +
      (project.labor_cost || 0) +
      (project.engineering_cost || 0) +
      (project.equipment_cost || 0) +
      (project.logistics_cost || 0) +
      (project.additional_costs || 0));

  const plMargin = (project.invoiced_amount || 0) > 0 ? (pl / (project.invoiced_amount || 0)) * 100 : 0;

  const copyQuoteToInvoiced = () => {
    applyFinancialPatch({
      invoiced_amount: roundToCents(computeQuoteCustomerTotal(project)),
    });
  };

  return (
    <div className="space-y-6 rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
      <div>
        <h2 className="text-xl font-semibold">Actuals (P&amp;L)</h2>
        <div className="mt-1 flex items-center gap-2 text-sm text-zinc-500">
          <p>Realized revenue and cost tracking.</p>
          <InfoHintButton detail="Invoiced revenue and job costs as work completes. Labor cost follows hours × cost/hr when both are set." />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 text-sm">
        <div className={topMetricCardClass}>
          <div className="flex items-center justify-between gap-2 text-sm text-zinc-500">
            <span>Invoiced amount</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={copyQuoteToInvoiced}
            >
              Copy quote
            </Button>
          </div>
          <input
            type="text"
            inputMode="decimal"
            value={
              project.invoiced_amount == null
                ? ""
                : formatMoney(project.invoiced_amount)
            }
            onChange={(e) => {
              const raw = e.target.value;
              applyFinancialPatch({
                invoiced_amount: parseMoneyInput(raw),
              });
            }}
            className="mt-2 w-full bg-transparent text-2xl font-mono font-bold placeholder:text-zinc-500 focus:outline-none sm:text-3xl"
            placeholder="$0.00"
          />
        </div>
        <div className={topMetricCardClass}>
          <div className="text-sm text-zinc-500">Total actual costs</div>
          <div className="mt-2 text-2xl font-mono font-bold text-red-400 sm:text-3xl">
            {formatMoney(totalActualCosts)}
          </div>
        </div>
        <div className={`${topMetricCardClass} border-emerald-800/70 bg-emerald-950/30`}>
          <div className="text-sm text-emerald-400">Realized P&amp;L</div>
          <div className="mt-2 text-2xl font-mono font-bold text-emerald-300 sm:text-3xl">
            {formatMoney(pl)}
          </div>
          <div className="mt-1 text-sm text-emerald-400">{formatPercent(plMargin)} margin</div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Actual labor (hours)
        </h4>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Hours</label>
            <input
              type="number"
              value={project.labor_hours_actual ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                applyFinancialPatch({
                  labor_hours_actual: parseMoneyInput(raw),
                });
              }}
              className={detailFieldMono}
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">
              Cost $/hr (internal)
            </label>
            <input
              type="number"
              value={project.labor_cost_per_hr_actual ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                applyFinancialPatch({
                  labor_cost_per_hr_actual: parseMoneyInput(raw),
                });
              }}
              className={detailFieldMono}
              placeholder="0"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 text-sm">
        {REALIZED_FIELDS.map((field) => (
          <div key={field}>
            <label className="mb-1 block text-xs text-zinc-500">
              {REALIZED_LABELS[field] ?? field}
            </label>
            <input
              type="number"
              value={(project[field] as number | null | undefined) ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                applyFinancialPatch({
                  [field]: parseMoneyInput(raw),
                } as Partial<ProjectRow>);
              }}
              className={detailFieldMono}
              placeholder="0"
            />
          </div>
        ))}
        <div>
          <label className="mb-1 block text-xs text-zinc-500">
            Actual labor cost
            {laborCostComputed ? (
              <span className="ml-1 text-zinc-600">(from hours × $/hr)</span>
            ) : null}
          </label>
          <input
            type="number"
            value={
              laborCostComputed
                ? roundToCents(computeLaborCostFromActualBreakdown(project))
                : (project.labor_cost as number | null | undefined) ?? ""
            }
            onChange={(e) => {
              if (laborCostComputed) return;
              const raw = e.target.value;
              applyFinancialPatch({
                labor_cost: parseMoneyInput(raw),
              });
            }}
            className={detailFieldMono}
            placeholder={laborCostComputed ? undefined : "0"}
            readOnly={laborCostComputed}
            aria-readonly={laborCostComputed}
          />
        </div>
      </div>
    </div>
  );
}
