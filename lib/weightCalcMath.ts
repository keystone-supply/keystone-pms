import {
  HIACE_SELL_PER_LB,
  STANDARD_SELL_MULTIPLIER,
  VIKING_SELL_PER_LB,
  costs,
  materialCostOptions,
  shapes,
} from "@/lib/weightCalcConfig";
import type { CostKey, ShapeValue, TapeItem } from "@/lib/weightTapeTypes";

export function computeArea(
  shapeVal: ShapeValue,
  d1: number,
  d2: number,
  hasDim2: boolean,
): number {
  const d2u = hasDim2 ? d2 : 0;
  let a = 0;
  if (shapeVal === "round") {
    const radius = d1 / 2;
    a = Math.PI * radius * radius;
  } else if (shapeVal === "square") {
    a = d1 * d2u;
  } else if (shapeVal === "tube") {
    const odRadius = d1 / 2;
    const wallThickness = d2u;
    const innerDia = d1 - 2 * wallThickness;
    if (innerDia > 0) {
      const idRadius = innerDia / 2;
      a = Math.PI * (odRadius * odRadius - idRadius * idRadius);
    }
  }
  return a;
}

export function shapeHasDim2(shapeVal: ShapeValue): boolean {
  return shapes.find((s) => s.value === shapeVal)?.hasDim2 ?? false;
}

export function computeUnitWeight(item: TapeItem): number {
  const hasDim2 = shapeHasDim2(item.shape);
  const a = computeArea(item.shape, item.dim1, item.dim2, hasDim2);
  return item.density * a * item.lengthIn;
}

function defaultSellPerLb(item: TapeItem): number {
  return (
    item.sellPerLb ??
    (item.costPerLb === costs.viking
      ? VIKING_SELL_PER_LB
      : item.costPerLb === costs.hiace
        ? HIACE_SELL_PER_LB
        : item.costPerLb * STANDARD_SELL_MULTIPLIER)
  );
}

export function getTapeItemTotals(item: TapeItem) {
  const unitWeight = computeUnitWeight(item);
  const unitCost = unitWeight * item.costPerLb;
  const totalWeight = unitWeight * item.quantity;
  const totalCost = unitCost * item.quantity;
  const sellPerLb = defaultSellPerLb(item);
  const estSell = totalWeight * sellPerLb;
  return { unitWeight, unitCost, totalWeight, totalCost, estSell };
}

export function getItemMaterialCostKey(item: TapeItem): CostKey {
  const match = materialCostOptions.find(
    (o) =>
      o.materialKey === item.material &&
      Math.abs(costs[o.costKey] - item.costPerLb) < 0.01,
  );
  return match?.costKey ?? "mild";
}
