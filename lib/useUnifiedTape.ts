import { useCallback, useMemo, useState } from "react";

import { evaluateUnifiedTape } from "@/lib/tapeCalculator";
import type { UnifiedTapeLine } from "@/lib/unifiedTapeTypes";
import { buildCalculationText } from "@/lib/weightCalculationText";
import {
  costs,
  HIACE_SELL_PER_LB,
  materialCostOptions,
  materialDensities,
  shapes,
  STANDARD_SELL_MULTIPLIER,
  VIKING_SELL_PER_LB,
} from "@/lib/weightCalcConfig";
import {
  getItemMaterialCostKey,
  getTapeItemTotals,
  shapeHasDim2,
} from "@/lib/weightCalcMath";
import type { CostKey, MaterialKey, ShapeValue, TapeItem } from "@/lib/weightTapeTypes";

function newMathLine(): UnifiedTapeLine {
  return { id: crypto.randomUUID(), kind: "math", expr: "" };
}

export function useUnifiedTape() {
  const [lines, setLines] = useState<UnifiedTapeLine[]>(() => [newMathLine()]);
  const [materialEditLineId, setMaterialEditLineId] = useState<string | null>(null);
  const [materialCostOption, setMaterialCostOption] = useState<CostKey>("mild");
  const [shape, setShape] = useState<ShapeValue>("square");
  const [lengthIn, setLengthIn] = useState<number>(96);
  const [dim1, setDim1] = useState(1);
  const [dim2, setDim2] = useState(0.25);
  const [quantity, setQuantity] = useState<number>(1);

  const selectedMaterialCost = useMemo(
    () =>
      materialCostOptions.find((o) => o.costKey === materialCostOption) ??
      materialCostOptions[0],
    [materialCostOption],
  );
  const material = selectedMaterialCost.materialKey;
  const cost = selectedMaterialCost.costKey;
  const currentShape = shapes.find((s) => s.value === shape);

  const { computeAreaPreview } = useMemo(() => {
    const computeAreaPreview = (
      shapeVal: ShapeValue,
      d1: number,
      d2Value: number,
    ) => {
      const has =
        shapes.find((s) => s.value === shapeVal)?.hasDim2 ?? false;
      const ad2 = has ? d2Value : 0;
      let a = 0;
      if (shapeVal === "round") {
        const radius = d1 / 2;
        a = Math.PI * radius * radius;
      } else if (shapeVal === "square") {
        a = d1 * ad2;
      } else if (shapeVal === "tube") {
        const odRadius = d1 / 2;
        const wallThickness = ad2;
        const innerDia = d1 - 2 * wallThickness;
        if (innerDia > 0) {
          const idRadius = innerDia / 2;
          a = Math.PI * (odRadius * odRadius - idRadius * idRadius);
        }
      }
      return a;
    };
    return { computeAreaPreview };
  }, []);

  const area = computeAreaPreview(shape, dim1, currentShape?.hasDim2 ? dim2 : 0);
  const density = materialDensities[material]?.density || 0.284;
  const previewWeight = density * area * lengthIn * quantity;
  const previewWeightKg = previewWeight * 0.453592;
  const costPerLb = costs[cost] || 0.65;
  const previewTotalCost = previewWeight * costPerLb;
  const estSell =
    cost === "viking"
      ? previewWeight * VIKING_SELL_PER_LB
      : cost === "hiace"
        ? previewWeight * HIACE_SELL_PER_LB
        : previewTotalCost * STANDARD_SELL_MULTIPLIER;
  const margin = estSell - previewTotalCost;

  const formattedWeight = (
    isNaN(previewWeight) || previewWeight === 0 ? 0 : previewWeight
  ).toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const formattedWeightKg = (
    isNaN(previewWeightKg) ? 0 : previewWeightKg
  ).toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const formattedCost = (
    isNaN(previewTotalCost) || previewTotalCost === 0 ? 0 : previewTotalCost
  ).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const formattedEstSell = (
    isNaN(estSell) || estSell === 0 ? 0 : estSell
  ).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const formattedMargin = (
    isNaN(margin) || margin === 0 ? 0 : margin
  ).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  const evals = useMemo(() => evaluateUnifiedTape(lines), [lines]);
  const weightLinesInOrder = useMemo(
    () => lines.filter((l): l is Extract<UnifiedTapeLine, { kind: "weight" }> => l.kind === "weight"),
    [lines],
  );
  const grandTotalWeight = useMemo(
    () =>
      weightLinesInOrder.reduce((sum, l) => {
        const t = getTapeItemTotals(l.item);
        return sum + t.totalWeight;
      }, 0),
    [weightLinesInOrder],
  );
  const grandTotalCost = useMemo(
    () =>
      weightLinesInOrder.reduce((sum, l) => {
        const t = getTapeItemTotals(l.item);
        return sum + t.totalCost;
      }, 0),
    [weightLinesInOrder],
  );
  const grandTotalEstSell = useMemo(
    () =>
      weightLinesInOrder.reduce((sum, l) => {
        const t = getTapeItemTotals(l.item);
        return sum + t.estSell;
      }, 0),
    [weightLinesInOrder],
  );
  const grandTotalMargin = grandTotalEstSell - grandTotalCost;

  const formattedGrandWeight = (
    isNaN(grandTotalWeight) || grandTotalWeight === 0 ? "0.0" : grandTotalWeight
  ).toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const formattedGrandCost = (
    isNaN(grandTotalCost) || grandTotalCost === 0 ? "$0.00" : grandTotalCost
  ).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const formattedGrandEstSell = (
    isNaN(grandTotalEstSell) || grandTotalEstSell === 0
      ? 0
      : grandTotalEstSell
  ).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const formattedGrandMargin = (
    isNaN(grandTotalMargin) || grandTotalMargin === 0 ? 0 : grandTotalMargin
  ).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  const lastNumericLine = (() => {
    for (let i = evals.length - 1; i >= 0; i--) {
      const e = evals[i];
      const line = lines[i];
      if (line?.kind === "weight") {
        const t = getTapeItemTotals(line.item);
        return {
          index: i + 1,
          display: t.estSell.toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
          }),
        };
      }
      if (line?.kind === "math") {
        if (!e.error && e.display && e.display !== "true" && e.display !== "false") {
          return { index: i + 1, display: e.display };
        }
      }
    }
    return null;
  })();

  const openMaterialEdit = useCallback((lineId: string) => {
    setMaterialEditLineId(lineId);
  }, []);

  const closeMaterialEdit = useCallback(() => {
    setMaterialEditLineId(null);
  }, []);

  const updateMathExpr = useCallback((lineId: string, expr: string) => {
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId && l.kind === "math" ? { ...l, expr } : l,
      ),
    );
  }, []);

  const addMathLine = useCallback(() => {
    setLines((prev) => [...prev, newMathLine()]);
  }, []);

  const insertLineAfter = useCallback((afterId: string) => {
    const line = newMathLine();
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.id === afterId);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx + 1), line, ...prev.slice(idx + 1)];
    });
    queueMicrotask(() => {
      document.getElementById(`expr-${line.id}`)?.focus();
    });
  }, []);

  const removeLine = useCallback((id: string) => {
    setLines((prev) => {
      if (prev.length <= 1) return [newMathLine()];
      return prev.filter((l) => l.id !== id);
    });
    setMaterialEditLineId((prev) => (prev === id ? null : prev));
  }, []);

  const clearTape = useCallback(() => {
    setLines([newMathLine()]);
    setMaterialEditLineId(null);
  }, []);

  const sendWeightToTape = useCallback(() => {
    const opt = selectedMaterialCost;
    const mat = materialDensities[opt.materialKey];
    const sellPerLb =
      opt.costKey === "viking"
        ? VIKING_SELL_PER_LB
        : opt.costKey === "hiace"
          ? HIACE_SELL_PER_LB
          : costs[opt.costKey] * STANDARD_SELL_MULTIPLIER;
    const item: TapeItem = {
      id: crypto.randomUUID(),
      notes: "",
      material: opt.materialKey,
      materialName: opt.label,
      density: mat.density,
      shape,
      lengthIn,
      dim1,
      dim2,
      thickness: dim2,
      costPerLb: costs[opt.costKey],
      sellPerLb,
      quantity,
    };
    const line: UnifiedTapeLine = {
      id: crypto.randomUUID(),
      kind: "weight",
      item,
      calculationText: buildCalculationText(item),
    };
    setLines((prev) => [...prev, line]);
  }, [selectedMaterialCost, shape, lengthIn, dim1, dim2, quantity]);

  const updateWeightLineItem = useCallback(
    (lineId: string, updater: (item: TapeItem) => TapeItem) => {
      setLines((prev) =>
        prev.map((l) => {
          if (l.id !== lineId || l.kind !== "weight") return l;
          const item = updater(l.item);
          return {
            ...l,
            item,
            calculationText: buildCalculationText(item),
          };
        }),
      );
    },
    [],
  );

  const updateItemField = useCallback(
    (lineId: string, field: keyof TapeItem, value: unknown) => {
      updateWeightLineItem(lineId, (item) => {
        const updated = { ...item, [field]: value } as TapeItem;
        if (field === "material") {
          const mat = materialDensities[value as MaterialKey];
          updated.materialName = mat.name;
          updated.density = mat.density;
        }
        if (field === "dim2") {
          updated.thickness = value as number;
        }
        return updated;
      });
    },
    [updateWeightLineItem],
  );

  const updateItemMaterialCost = useCallback(
    (lineId: string, costKey: CostKey) => {
      const opt = materialCostOptions.find((o) => o.costKey === costKey);
      if (!opt) return;
      const mat = materialDensities[opt.materialKey];
      updateWeightLineItem(lineId, (item) => {
        const sellPerLb =
          opt.costKey === "viking"
            ? VIKING_SELL_PER_LB
            : opt.costKey === "hiace"
              ? HIACE_SELL_PER_LB
              : costs[opt.costKey] * STANDARD_SELL_MULTIPLIER;
        return {
          ...item,
          material: opt.materialKey,
          materialName: opt.label,
          density: mat.density,
          costPerLb: costs[opt.costKey],
          sellPerLb,
        };
      });
    },
    [updateWeightLineItem],
  );

  const editingMaterialContext = useMemo(() => {
    if (!materialEditLineId) return null;
    const index = lines.findIndex((l) => l.id === materialEditLineId);
    if (index === -1) return null;
    const line = lines[index];
    if (line?.kind !== "weight") return null;
    return { line, lineNumber: index + 1 };
  }, [lines, materialEditLineId]);

  return {
    lines,
    setLines,
    evals,
    weightLinesInOrder,
    lastNumericLine,
    materialCostOption,
    setMaterialCostOption,
    shape,
    setShape,
    lengthIn,
    setLengthIn,
    dim1,
    setDim1,
    dim2,
    setDim2,
    quantity,
    setQuantity,
    selectedMaterialCost,
    currentShape,
    formattedWeight,
    formattedWeightKg,
    formattedCost,
    formattedEstSell,
    margin,
    formattedMargin,
    formattedGrandWeight,
    formattedGrandCost,
    formattedGrandEstSell,
    grandTotalMargin,
    formattedGrandMargin,
    materialEditLineId,
    editingMaterialContext,
    openMaterialEdit,
    closeMaterialEdit,
    setMaterialEditLineId,
    updateMathExpr,
    addMathLine,
    insertLineAfter,
    removeLine,
    clearTape,
    sendWeightToTape,
    updateItemField,
    updateItemMaterialCost,
    shapeHasDim2,
    getTapeItemTotals,
    getMaterialCostKey: getItemMaterialCostKey,
  };
}
