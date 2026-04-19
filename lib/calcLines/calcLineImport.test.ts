import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDocumentLinesFromCalc,
  roundCents,
} from "@/lib/calcLines/calcLineImport";
import type { ProjectCalcLineRow } from "@/lib/calcLines/types";

function materialRow(
  id: string,
  overrides: Partial<ProjectCalcLineRow> = {},
): ProjectCalcLineRow {
  return {
    id,
    project_id: "project-1",
    tape_id: "tape-1",
    position: 0,
    kind: "material",
    description: "Line",
    qty: 2,
    uom: "EA",
    notes: "",
    material_key: "cs",
    material_name: "Mild steel",
    shape: "square",
    length_in: 10,
    dim1: 2,
    dim2: 1,
    density: 0.284,
    cost_per_lb: 0.7,
    sell_per_lb: 1.05,
    unit_weight_lb: 10,
    unit_cost: 7,
    total_weight_lb: 20,
    total_cost: 14,
    total_sell: 21,
    expr: null,
    expr_display: null,
    expr_error: null,
    payload: {},
    created_at: "2026-04-20T00:00:00.000Z",
    updated_at: "2026-04-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("calc line import strategies", () => {
  it("maps oneToOne rows preserving totals", () => {
    const rows = [
      materialRow("a", { position: 0, total_sell: 20, qty: 2 }),
      materialRow("b", { position: 1, total_sell: 30, qty: 3 }),
    ];
    const lines = buildDocumentLinesFromCalc({
      selectedRows: rows,
      strategy: "oneToOne",
    });
    assert.equal(lines.length, 2);
    assert.equal(lines[0]?.extended, 20);
    assert.equal(lines[1]?.extended, 30);
  });

  it("collapses rows into one lump sum", () => {
    const rows = [
      materialRow("a", { total_sell: 12.34 }),
      materialRow("b", { total_sell: 45.67 }),
    ];
    const lines = buildDocumentLinesFromCalc({
      selectedRows: rows,
      strategy: "collapseLumpSum",
      collapseDescription: "Imported calc",
    });
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.description, "Imported calc");
    assert.equal(lines[0]?.extended, roundCents(12.34 + 45.67));
  });

  it("applies cost+markup strategy", () => {
    const rows = [materialRow("a", { total_cost: 100, qty: 4 })];
    const lines = buildDocumentLinesFromCalc({
      selectedRows: rows,
      strategy: "costPlusMarkup",
      markupPct: 20,
    });
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.extended, 120);
    assert.equal(lines[0]?.unitPrice, 30);
  });
});
