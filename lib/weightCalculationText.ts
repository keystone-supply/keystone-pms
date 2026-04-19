import {
  materialDensities,
  shapes,
} from "@/lib/weightCalcConfig";
import {
  computeArea,
  getTapeItemTotals,
  shapeHasDim2,
} from "@/lib/weightCalcMath";
import type { TapeItem } from "@/lib/weightTapeTypes";

function areaDescription(item: TapeItem): string {
  if (item.shape === "round") {
    const r = item.dim1 / 2;
    return `π×(${r.toFixed(3)} in)²`;
  }
  if (item.shape === "square") {
    return `${item.dim1.toFixed(3)}×${item.dim2.toFixed(3)} in²`;
  }
  const od = item.dim1;
  const wall = item.dim2;
  const id = od - 2 * wall;
  return `tube OD ${od.toFixed(3)} in · wall ${wall.toFixed(3)} in · ID ${id > 0 ? id.toFixed(3) : "?"} in`;
}

function fmtIn(x: number): string {
  const t = x.toFixed(3).replace(/\.?0+$/, "");
  return t === "" ? "0" : t;
}

export type MaterialTapeLineSummaryRows = { typeShape: string; sizeQty: string };

/** Two visible rows for tape Material cells: type -- shape, then size -- Qty n. */
export function getMaterialTapeLineSummaryRows(
  item: TapeItem,
): MaterialTapeLineSummaryRows {
  const shapeDef = shapes.find((s) => s.value === item.shape);
  const shapeLabel = shapeDef?.label ?? item.shape;
  const shapeShort = shapeLabel.replace(/\s*\/\s*/g, "/");

  let dimLine: string;
  if (item.shape === "round") {
    dimLine = `⌀${fmtIn(item.dim1)}" × ${fmtIn(item.lengthIn)}" L`;
  } else if (item.shape === "square") {
    dimLine = `${fmtIn(item.dim1)}" × ${fmtIn(item.dim2)}" × ${fmtIn(item.lengthIn)}"`;
  } else {
    dimLine = `OD ${fmtIn(item.dim1)}" × wall ${fmtIn(item.dim2)}" × ${fmtIn(item.lengthIn)}" L`;
  }

  return {
    typeShape: `${item.materialName} -- ${shapeShort}`,
    sizeQty: `${dimLine} -- Qty ${item.quantity}`,
  };
}

export function buildCalculationText(item: TapeItem): string {
  const hasDim2 = shapeHasDim2(item.shape);
  const area = computeArea(item.shape, item.dim1, item.dim2, hasDim2);
  const areaStr = areaDescription(item);
  const mat = materialDensities[item.material];
  const density = item.density;
  const totals = getTapeItemTotals(item);
  const shapeLabel = shapes.find((s) => s.value === item.shape)?.label ?? item.shape;
  return (
    `${mat?.name ?? item.materialName} (${shapeLabel}) · ` +
    `${density.toFixed(3)} lb/in³ × (${areaStr} → ${area.toFixed(4)} in²) ` +
    `× ${item.lengthIn.toFixed(2)} in × ${item.quantity} qty ` +
    `= ${totals.totalWeight.toFixed(2)} lbs total`
  );
}
