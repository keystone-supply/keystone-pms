/**
 * Quick checks for nest strategy + grid expansion (run: npx tsx scripts/verify-nest-dual-lane.ts).
 */

import assert from "node:assert/strict";

import { rectOutline, type PartShape } from "../lib/utils";
import { expandModuleToGrid } from "../lib/nestGridExpand";
import {
  selectNestPlacementLane,
  partsUnitQuantities,
} from "../lib/nestStrategy";

function partRect(
  id: string,
  w: number,
  h: number,
  qty: number,
): PartShape {
  return {
    id,
    name: id,
    kind: "rect",
    outline: rectOutline(w, h),
    quantity: qty,
    canRotate: true,
  };
}

{
  const parts = [partRect("a", 2, 2, 50), partRect("b", 2, 2, 50)];
  const sheets = [{ width: 24, height: 24 }] as const;
  assert.equal(
    selectNestPlacementLane("tight", parts, [...sheets]).kind,
    "full",
  );
  const auto = selectNestPlacementLane("auto", parts, [...sheets]);
  assert.equal(auto.kind, "grid");
  if (auto.kind === "grid") assert.equal(auto.sheetKind, "rect");

  const polySheets = [
    {
      outline: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    },
  ];
  const autoPoly = selectNestPlacementLane("auto", parts, polySheets);
  assert.equal(autoPoly.kind, "full");

  const prodPoly = selectNestPlacementLane(
    "production_batch",
    parts,
    polySheets,
  );
  assert.equal(prodPoly.kind, "grid");
  if (prodPoly.kind === "grid") assert.equal(prodPoly.sheetKind, "polygon");
}

{
  const u = partsUnitQuantities([
    partRect("a", 1, 1, 99),
    partRect("b", 1, 1, 1),
  ]);
  assert.equal(u[0].quantity, 1);
  assert.equal(u[1].quantity, 1);
}

{
  const parts = [partRect("a", 2, 2, 4), partRect("b", 3, 2, 4)];
  const moduleResult = {
    fitness: 0,
    area: 10,
    totalarea: 100,
    mergedLength: 0,
    utilisation: 10,
    placements: [
      {
        sheet: 0,
        sheetid: 0,
        sheetplacements: [
          { source: 0, id: 0, x: 1, y: 1, rotation: 0, filename: "a" },
          { source: 1, id: 1, x: 5, y: 1, rotation: 0, filename: "b" },
        ],
      },
    ],
  };
  const expanded = expandModuleToGrid({
    moduleResult,
    parts,
    sheet: { width: 30, height: 20 },
    spacing: 0,
    sheetKind: "rect",
  });
  assert.ok(!("error" in expanded), String((expanded as { error?: string }).error));
  if (!("error" in expanded)) {
    const n = expanded.result.placements[0].sheetplacements.length;
    assert.ok(n >= 8, `expected >=8 placements, got ${n}`);
    assert.equal(expanded.meta.stampsPlaced, 4);
  }
}

console.log("verify-nest-dual-lane: ok");
