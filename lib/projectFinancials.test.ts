import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeQuotedInternalCostTotal,
  computeQuoteCustomerTotal,
  customerLineFromBasis,
  markupDollarsFromBasis,
  syncQuoteDerivations,
} from "@/lib/projectFinancials";
import type { ProjectRow } from "@/lib/projectTypes";

function p(row: Partial<ProjectRow>): ProjectRow {
  return { id: "t", ...row };
}

describe("customerLineFromBasis", () => {
  it("applies markup and rounds cents", () => {
    assert.equal(customerLineFromBasis(100, 30), 130);
    assert.equal(customerLineFromBasis(10, 12.5), 11.25);
  });
});

describe("markupDollarsFromBasis", () => {
  it("returns customer minus basis", () => {
    assert.equal(markupDollarsFromBasis(100, 130), 30);
    assert.equal(markupDollarsFromBasis(100, 100), 0);
  });
});

describe("computeQuoteCustomerTotal", () => {
  it("marks up materials and passes taxes through", () => {
    const total = computeQuoteCustomerTotal(
      p({
        materials_vendor_cost: 1000,
        material_markup_pct: 30,
        engineering_quoted: 0,
        equipment_quoted: 0,
        logistics_quoted: 0,
        taxes_quoted: 50,
        labor_hours_quoted: 0,
        labor_sell_per_hr: 0,
      }),
    );
    assert.equal(total, 1000 * 1.3 + 50);
  });

  it("uses labor hours × sell/hr without markup", () => {
    const total = computeQuoteCustomerTotal(
      p({
        materials_vendor_cost: 0,
        material_markup_pct: 30,
        labor_hours_quoted: 10,
        labor_cost_per_hr: 40,
        labor_sell_per_hr: 95,
        engineering_quoted: 0,
        equipment_quoted: 0,
        logistics_quoted: 0,
        taxes_quoted: 0,
      }),
    );
    assert.equal(total, 950);
  });

  it("uses per-line markup for engineering, equipment, logistics", () => {
    const total = computeQuoteCustomerTotal(
      p({
        materials_vendor_cost: 100,
        material_markup_pct: 10,
        engineering_quoted: 100,
        engineering_markup_pct: 20,
        equipment_quoted: 100,
        equipment_markup_pct: 50,
        logistics_quoted: 100,
        logistics_markup_pct: 0,
        taxes_quoted: 0,
        labor_hours_quoted: 0,
        labor_sell_per_hr: 0,
      }),
    );
    assert.equal(total, 110 + 120 + 150 + 100);
  });
});

describe("computeQuotedInternalCostTotal", () => {
  it("sums vendor materials and internal labor", () => {
    const internal = computeQuotedInternalCostTotal(
      p({
        materials_vendor_cost: 200,
        labor_hours_quoted: 5,
        labor_cost_per_hr: 45,
        engineering_quoted: 100,
        equipment_quoted: 0,
        logistics_quoted: 0,
        taxes_quoted: 20,
      }),
    );
    assert.equal(internal, 200 + 225 + 100 + 20);
  });

  it("uses vendor cost only for materials (ignores legacy materials_quoted on row)", () => {
    assert.equal(
      computeQuotedInternalCostTotal(
        p({ materials_quoted: 999, materials_vendor_cost: null }),
      ),
      0,
    );
    assert.equal(
      computeQuotedInternalCostTotal(
        p({ materials_quoted: 999, materials_vendor_cost: 50 }),
      ),
      50,
    );
  });
});

describe("syncQuoteDerivations", () => {
  it("writes labor_quoted and total_quoted from breakdown", () => {
    const patch = syncQuoteDerivations(
      p({
        materials_vendor_cost: 100,
        material_markup_pct: 30,
        labor_hours_quoted: 2,
        labor_cost_per_hr: 50,
        labor_sell_per_hr: 120,
        engineering_quoted: 0,
        equipment_quoted: 0,
        logistics_quoted: 0,
        taxes_quoted: 0,
      }),
    );
    assert.equal(patch.labor_quoted, 100);
    assert.equal(patch.total_quoted, 130 + 240);
  });
});
