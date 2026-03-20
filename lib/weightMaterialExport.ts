import {
  costs,
  HIACE_SELL_PER_LB,
  materialCostOptions,
  materialDensities,
  shapes,
  STANDARD_SELL_MULTIPLIER,
  VIKING_SELL_PER_LB,
} from "@/lib/weightCalcConfig";
import { getTapeItemTotals } from "@/lib/weightCalcMath";
import type { TapeItem } from "@/lib/weightTapeTypes";

function wrapText(text: string, width: number): string[] {
  if (!text || text.length <= width) return [text];
  const lines: string[] = [];
  let i = 0;
  while (i < text.length) {
    let chunk = text.slice(i, i + width);
    while (
      chunk.length > 0 &&
      chunk.includes(" ") &&
      chunk.lastIndexOf(" ") > width / 2
    ) {
      chunk = chunk.slice(0, chunk.lastIndexOf(" "));
    }
    lines.push(chunk);
    i += chunk.length;
  }
  return lines;
}

function sellPerLbForExport(item: TapeItem): number {
  return (
    item.sellPerLb ??
    (item.costPerLb === costs.viking
      ? VIKING_SELL_PER_LB
      : item.costPerLb === costs.hiace
        ? HIACE_SELL_PER_LB
        : item.costPerLb * STANDARD_SELL_MULTIPLIER)
  );
}

/** Tab-separated material block: same columns and spacing as legacy weight-calc export. */
export function buildMaterialExport(itemsInTapeOrder: TapeItem[]): string {
  const columns = [
    { label: "Notes", width: 25 },
    { label: "Material", width: 45 },
    { label: "Shape", width: 15 },
    { label: "Length (in)", width: 12 },
    { label: "Dim1 (in)", width: 10 },
    { label: "Dim2 (in)", width: 10 },
    { label: "Qty", width: 6 },
    { label: "Cost/lb", width: 10 },
    { label: "Sell/lb", width: 10 },
    { label: "Weight (lbs)", width: 12 },
    { label: "Total Cost", width: 15 },
    { label: "Sell", width: 15 },
    { label: "Margin", width: 15 },
  ];

  const colWidths = columns.map((col) => col.width);

  const headerLine = columns
    .map((col) => col.label.padEnd(col.width, " ").slice(0, col.width))
    .join("\t");
  const underlineLine = columns
    .map((col) => "-".repeat(col.width))
    .join("\t");
  let content = headerLine + "\n" + underlineLine + "\n" + "\n";

  let grandTotalWeight = 0;
  let grandTotalCost = 0;
  let grandTotalEstSell = 0;

  itemsInTapeOrder.forEach((item) => {
    const shapeLabel =
      shapes.find((s) => s.value === item.shape)?.label || "Unknown";
    const hasDim2 =
      shapes.find((s) => s.value === item.shape)?.hasDim2 ?? false;
    const materialOpt = materialCostOptions.find(
      (o) =>
        o.materialKey === item.material &&
        Math.abs(costs[o.costKey] - item.costPerLb) < 0.01,
    );
    const materialFullName = materialOpt
      ? `${materialOpt.label} — $${costs[materialOpt.costKey].toFixed(2)}/lb — ${materialDensities[materialOpt.materialKey].density.toFixed(3)} lb/in³`
      : item.materialName;
    const totals = getTapeItemTotals(item);
    grandTotalWeight += totals.totalWeight;
    grandTotalCost += totals.totalCost;
    grandTotalEstSell += totals.estSell;
    const sellPerLb = sellPerLbForExport(item);
    const fields = [
      item.notes || "",
      materialFullName,
      shapeLabel,
      item.lengthIn.toFixed(2),
      item.dim1.toFixed(3),
      hasDim2 ? item.dim2.toFixed(3) : "",
      item.quantity.toString(),
      `$${item.costPerLb.toFixed(2)}`,
      `$${sellPerLb.toFixed(2)}`,
      totals.totalWeight.toFixed(1),
      `$${totals.totalCost.toFixed(2)}`,
      `$${totals.estSell.toFixed(2)}`,
      `$${(totals.estSell - totals.totalCost).toFixed(2)}`,
    ];
    const fieldLines = fields.map((field, idx) =>
      wrapText(field, colWidths[idx]),
    );
    const maxLines = Math.max(1, ...fieldLines.map((ls) => ls.length));

    for (let lineIdx = 0; lineIdx < maxLines; lineIdx++) {
      const rowFields = colWidths.map((width, fieldIdx) => {
        const ls = fieldLines[fieldIdx];
        const text = ls[lineIdx] || "";
        return text.padEnd(width, " ").slice(0, width);
      });
      content += rowFields.join("\t") + "\n";
    }
    content += "\n";
  });

  const formattedGrandWeight = (
    isNaN(grandTotalWeight) || grandTotalWeight === 0
      ? "0.0"
      : grandTotalWeight
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
  const grandTotalMargin = grandTotalEstSell - grandTotalCost;
  const formattedGrandMargin = (
    isNaN(grandTotalMargin) || grandTotalMargin === 0 ? 0 : grandTotalMargin
  ).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  content += "\n";
  content +=
    "Grand Total Weight:".padEnd(40, " ").slice(0, 40) +
    formattedGrandWeight +
    " lbs\n";
  content +=
    "Grand Total Cost:".padEnd(40, " ").slice(0, 40) +
    formattedGrandCost +
    "\n";
  content +=
    "Grand Total Sell:".padEnd(40, " ").slice(0, 40) +
    formattedGrandEstSell +
    "\n";
  content +=
    "Grand Total Margin:".padEnd(40, " ").slice(0, 40) +
    formattedGrandMargin +
    "\n";

  return content;
}
