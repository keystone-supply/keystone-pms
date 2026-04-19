import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateUnifiedTape } from "@/lib/tapeCalculator";
import type { UnifiedTapeLine } from "@/lib/unifiedTapeTypes";
import { costs, STANDARD_SELL_MULTIPLIER } from "@/lib/weightCalcConfig";
import type { TapeItem } from "@/lib/weightTapeTypes";

function mkItem(overrides: Partial<TapeItem> = {}): TapeItem {
  return {
    id: "item-1",
    notes: "",
    material: "cs",
    materialName: "Mild Steel",
    density: 0.284,
    shape: "square",
    lengthIn: 10,
    dim1: 2,
    dim2: 1,
    thickness: 1,
    costPerLb: costs.mild,
    sellPerLb: costs.mild * STANDARD_SELL_MULTIPLIER,
    quantity: 2,
    ...overrides,
  };
}

describe("evaluateUnifiedTape", () => {
  it("keeps ans/@N behavior stable with mixed lines", () => {
    const lines: UnifiedTapeLine[] = [
      { id: "m1", kind: "math", expr: "2 + 2" },
      {
        id: "w1",
        kind: "weight",
        item: mkItem(),
        calculationText: "material row",
      },
      { id: "m2", kind: "math", expr: "ans + 1" },
      { id: "m3", kind: "math", expr: "@2 + @1" },
    ];

    const actual = evaluateUnifiedTape(lines);
    assert.deepEqual(actual[0], { display: "4" });
    assert.match(actual[1]?.display ?? "", /^\$/);
    assert.match(actual[2]?.display ?? "", /^[0-9]/);
    assert.match(actual[3]?.display ?? "", /^[0-9]/);
  });

  it("reports invalid forward @N references", () => {
    const lines: UnifiedTapeLine[] = [
      { id: "m1", kind: "math", expr: "@2 + 1" },
      { id: "m2", kind: "math", expr: "3" },
    ];

    const actual = evaluateUnifiedTape(lines);
    assert.equal(actual[0]?.display, "");
    assert.match(actual[0]?.error ?? "", /only reference a line above/i);
    assert.equal(actual[1]?.display, "3");
  });
});
