import type { ProjectCalcLineInsert, ProjectCalcLineRow } from "@/lib/calcLines/types";
import { evaluateUnifiedTape } from "@/lib/tapeCalculator";
import type { UnifiedTapeLine } from "@/lib/unifiedTapeTypes";
import { buildCalculationText } from "@/lib/weightCalculationText";
import { getTapeItemTotals } from "@/lib/weightCalcMath";

export const CALC_LINE_PAYLOAD_SCHEMA_VERSION = 1;

type CalcLinePayload = {
  _v: number;
  line: UnifiedTapeLine;
};

function toLinePayload(line: UnifiedTapeLine): CalcLinePayload {
  return {
    _v: CALC_LINE_PAYLOAD_SCHEMA_VERSION,
    line,
  };
}

function fromLinePayload(payload: unknown): UnifiedTapeLine | null {
  if (!payload || typeof payload !== "object") return null;
  const candidate = payload as Partial<CalcLinePayload>;
  if (!candidate.line || typeof candidate.line !== "object") return null;
  const line = candidate.line as Partial<UnifiedTapeLine>;
  if (!line.kind || typeof line.kind !== "string") return null;
  if (!line.id || typeof line.id !== "string") return null;
  if (line.kind === "math") {
    if (typeof (line as { expr?: unknown }).expr !== "string") return null;
    return line as UnifiedTapeLine;
  }
  if (line.kind === "weight") {
    if (!(line as { item?: unknown }).item) return null;
    return line as UnifiedTapeLine;
  }
  return null;
}

export function tapeLineToCalcRow(
  line: UnifiedTapeLine,
  position: number,
  projectId: string,
  tapeId: string,
): ProjectCalcLineInsert {
  if (line.kind === "weight") {
    const totals = getTapeItemTotals(line.item);
    return {
      project_id: projectId,
      tape_id: tapeId,
      position,
      kind: "material",
      description: line.calculationText || buildCalculationText(line.item),
      qty: line.item.quantity,
      uom: "EA",
      notes: line.item.notes ?? "",
      material_key: line.item.material,
      material_name: line.item.materialName,
      shape: line.item.shape,
      length_in: line.item.lengthIn,
      dim1: line.item.dim1,
      dim2: line.item.dim2,
      density: line.item.density,
      cost_per_lb: line.item.costPerLb,
      sell_per_lb: line.item.sellPerLb ?? null,
      unit_weight_lb: totals.unitWeight,
      unit_cost: totals.unitCost,
      total_weight_lb: totals.totalWeight,
      total_cost: totals.totalCost,
      total_sell: totals.estSell,
      expr: null,
      expr_display: null,
      expr_error: null,
      payload: toLinePayload({
        ...line,
        calculationText: buildCalculationText(line.item),
      }),
    };
  }

  const evalResult = evaluateUnifiedTape([line])[0];
  return {
    project_id: projectId,
    tape_id: tapeId,
    position,
    kind: "math",
    description: line.expr,
    qty: 1,
    uom: "EA",
    notes: "",
    material_key: null,
    material_name: null,
    shape: null,
    length_in: null,
    dim1: null,
    dim2: null,
    density: null,
    cost_per_lb: null,
    sell_per_lb: null,
    unit_weight_lb: null,
    unit_cost: null,
    total_weight_lb: null,
    total_cost: null,
    total_sell: null,
    expr: line.expr,
    expr_display: evalResult?.display ?? "",
    expr_error: evalResult?.error ?? null,
    payload: toLinePayload(line),
  };
}

export function calcRowToTapeLine(row: ProjectCalcLineRow): UnifiedTapeLine {
  const fromPayload = fromLinePayload(row.payload);
  if (fromPayload) {
    return fromPayload;
  }

  if (row.kind === "material") {
    return {
      id: row.id,
      kind: "weight",
      calculationText: row.description || "",
      item: {
        id: row.id,
        notes: row.notes ?? "",
        material: (row.material_key ?? "cs") as "al" | "cs" | "ar500" | "viking" | "304ss" | "hiace",
        materialName: row.material_name ?? "Material",
        density: row.density ?? 0.284,
        shape: (row.shape ?? "square") as "round" | "square" | "tube",
        lengthIn: row.length_in ?? 0,
        dim1: row.dim1 ?? 0,
        dim2: row.dim2 ?? 0,
        thickness: row.dim2 ?? 0,
        costPerLb: row.cost_per_lb ?? 0,
        sellPerLb: row.sell_per_lb ?? undefined,
        quantity: row.qty ?? 1,
      },
    };
  }

  return {
    id: row.id,
    kind: "math",
    expr: row.expr ?? row.description ?? "",
  };
}
