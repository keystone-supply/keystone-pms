"use client";

import { Button } from "@/components/ui/button";
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
          ${internalBasis.toLocaleString()}
        </div>
      </div>
      <div className="rounded-xl border border-zinc-700/80 bg-zinc-950 px-4 py-3">
        <div className="text-xs text-zinc-500">Markup $</div>
        <div className="font-mono text-lg text-zinc-200">
          ${markup$.toLocaleString()}
        </div>
      </div>
      <div className="rounded-xl border border-zinc-700/80 bg-zinc-950 px-4 py-3">
        <div className="text-xs text-zinc-500">Customer line</div>
        <div className="font-mono text-lg text-zinc-200">
          ${customerLine.toLocaleString()}
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
  const estimatedMarginPct =
    totalQuoted > 0 ? Math.round((estimatedPl / totalQuoted) * 100) : 0;

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
        <p className="mt-1 text-sm text-zinc-500">
          Each markable line has its own markup %. Labor uses sell $/hr; taxes
          pass through with no markup.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 text-sm">
        <div className="rounded-2xl border border-sky-800/60 bg-sky-950/40 p-5">
          <div className="text-zinc-500 text-sm">Customer quote total</div>
          <div className="mt-2 text-3xl font-mono font-bold text-sky-100">
            ${totalQuoted.toLocaleString()}
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Auto from line math — save to store on the project row.
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-700 bg-zinc-950 p-5">
          <div className="text-zinc-500 text-sm">
            Sum of estimated internal job costs
          </div>
          <div className="mt-2 text-3xl font-mono font-bold text-zinc-200">
            ${totalQuotedCosts.toLocaleString()}
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Basis costs (vendor materials, labor at cost/hr, other bases,
            taxes).
          </p>
        </div>
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

      <div className="rounded-3xl border border-sky-800 bg-sky-950 p-6">
        <div className="text-sm font-medium text-sky-400">
          Estimated P&amp;L (quote total − internal costs)
        </div>
        <div className="mt-2 text-4xl font-mono font-bold text-sky-200 sm:text-5xl">
          ${estimatedPl.toLocaleString()}
        </div>
        <div className="mt-1 text-lg text-sky-400 sm:text-xl">
          {estimatedMarginPct}% margin on quote
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Materials (vendor / purchase)
        </h4>
        <p className="mt-1 text-xs text-zinc-500">
          Internal cost is vendor spend; customer line = basis × (1 + markup
          %).
        </p>
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
                  materials_vendor_cost:
                    raw === "" ? null : parseFloat(raw) || 0,
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
                  material_markup_pct: Number.isNaN(v) ? null : v,
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

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Labor (hours)
        </h4>
        <p className="mt-1 text-xs text-zinc-500">
          Internal cost = hours × cost/hr. Customer labor = hours × sell/hr
          (no markup %).
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Hours</label>
            <input
              type="number"
              value={project.labor_hours_quoted ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                applyFinancialPatch({
                  labor_hours_quoted:
                    raw === "" ? null : parseFloat(raw) || 0,
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
                  labor_cost_per_hr:
                    raw === "" ? null : parseFloat(raw) || 0,
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
                  labor_sell_per_hr:
                    raw === "" ? null : parseFloat(raw) || 0,
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
              ${laborInternalPreview.toLocaleString()}
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
              ${laborSellPreview.toLocaleString()}
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
                  labor_quoted: raw === "" ? null : parseFloat(raw) || 0,
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
                        [basisKey]:
                          raw === "" ? null : parseFloat(raw) || 0,
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
                        [markupKey]: Number.isNaN(v) ? null : v,
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
                taxes_quoted: raw === "" ? null : parseFloat(raw) || 0,
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

  const plMargin =
    (project.invoiced_amount || 0) > 0
      ? Math.round((pl / (project.invoiced_amount || 0)) * 100)
      : 0;

  const copyQuoteToInvoiced = () => {
    applyFinancialPatch({
      invoiced_amount: computeQuoteCustomerTotal(project),
    });
  };

  return (
    <div className="space-y-6 rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
      <div>
        <h2 className="text-xl font-semibold">Actuals (P&amp;L)</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Invoiced revenue and job costs as work completes. Labor cost follows
          hours × cost/hr when both are set.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 text-sm">
        <div className="rounded-2xl border border-zinc-700 bg-zinc-950 p-6">
          <div className="text-sm text-zinc-500">Invoiced amount</div>
          <input
            type="number"
            value={project.invoiced_amount ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              applyFinancialPatch({
                invoiced_amount: raw === "" ? null : parseFloat(raw) || 0,
              });
            }}
            className="mt-2 w-full bg-transparent text-3xl font-mono font-bold placeholder:text-zinc-500 focus:outline-none sm:text-4xl"
            placeholder="0"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={copyQuoteToInvoiced}
          >
            Copy quote total here
          </Button>
        </div>
        <div className="rounded-2xl border border-zinc-700 bg-zinc-950 p-6">
          <div className="text-sm text-zinc-500">Total actual costs</div>
          <div className="mt-2 text-3xl font-mono font-bold text-red-400 sm:text-4xl">
            ${totalActualCosts.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-emerald-800 bg-emerald-950 p-6 sm:p-8">
        <div className="text-sm font-medium text-emerald-400">Realized P&amp;L</div>
        <div className="mt-2 text-4xl font-mono font-bold text-emerald-300 sm:text-6xl">
          ${pl.toLocaleString()}
        </div>
        <div className="mt-1 text-xl text-emerald-400 sm:text-2xl">
          {plMargin}% margin
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
                  labor_hours_actual:
                    raw === "" ? null : parseFloat(raw) || 0,
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
                  labor_cost_per_hr_actual:
                    raw === "" ? null : parseFloat(raw) || 0,
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
                  [field]: raw === "" ? null : parseFloat(raw) || 0,
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
                ? computeLaborCostFromActualBreakdown(project)
                : (project.labor_cost as number | null | undefined) ?? ""
            }
            onChange={(e) => {
              if (laborCostComputed) return;
              const raw = e.target.value;
              applyFinancialPatch({
                labor_cost: raw === "" ? null : parseFloat(raw) || 0,
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
