import type { ProjectCalcLineRow } from "@/lib/calcLines/types";
import type { DocumentLineItem } from "@/lib/documentTypes";
import type { ProjectRow } from "@/lib/projectTypes";

export type ImportStrategy = "oneToOne" | "collapseLumpSum" | "costPlusMarkup";

type ImportOptions = {
  selectedRows: ProjectCalcLineRow[];
  strategy: ImportStrategy;
  project?: Partial<ProjectRow>;
  markupPct?: number;
  collapseDescription?: string;
};

export function roundCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function materialRows(rows: ProjectCalcLineRow[]): ProjectCalcLineRow[] {
  return rows.filter((row) => row.kind === "material");
}

function nextLineNo(startLineNo: number, offset: number) {
  return startLineNo + offset;
}

export function buildDocumentLinesFromCalc({
  selectedRows,
  strategy,
  project,
  markupPct,
  collapseDescription,
}: ImportOptions): DocumentLineItem[] {
  const rows = materialRows(selectedRows);
  if (rows.length === 0) return [];

  const baseLineNo = 1;
  if (strategy === "oneToOne") {
    return rows.map((row, index) => {
      const qty = row.qty > 0 ? row.qty : 1;
      const unitPrice = roundCents((row.total_sell ?? 0) / qty);
      return {
        lineNo: nextLineNo(baseLineNo, index),
        description: row.description || "Calc line",
        qty,
        uom: row.uom || "EA",
        unitPrice,
        extended: roundCents(qty * unitPrice),
        partRef: `${row.tape_id.slice(0, 8)}-${row.position + 1}`,
        sourceCalcLineId: row.id,
        calcTapeId: row.tape_id,
        calcLineId: row.id,
        calcSyncBaseline: {
          description: row.description || "Calc line",
          qty,
          uom: row.uom || "EA",
          totalSell: roundCents(qty * unitPrice),
        },
      };
    });
  }

  if (strategy === "collapseLumpSum") {
    const total = roundCents(
      rows.reduce((sum, row) => sum + (row.total_sell ?? 0), 0),
    );
    return [
      {
        lineNo: baseLineNo,
        description:
          collapseDescription?.trim() ||
          `Calc bundle — ${project?.project_name ?? "project"}`,
        qty: 1,
        uom: "EA",
        unitPrice: total,
        extended: total,
      },
    ];
  }

  const defaultMarkup = project?.material_markup_pct ?? 30;
  const effectiveMarkup = markupPct ?? defaultMarkup;
  const multiplier = 1 + effectiveMarkup / 100;
  return rows.map((row, index) => {
    const qty = row.qty > 0 ? row.qty : 1;
    const extended = roundCents((row.total_cost ?? 0) * multiplier);
    const unitPrice = roundCents(extended / qty);
    return {
      lineNo: nextLineNo(baseLineNo, index),
      description: row.description || "Calc line",
      qty,
      uom: row.uom || "EA",
      unitPrice,
      extended: roundCents(unitPrice * qty),
      partRef: `${row.tape_id.slice(0, 8)}-${row.position + 1}`,
      sourceCalcLineId: row.id,
      calcTapeId: row.tape_id,
      calcLineId: row.id,
      calcSyncBaseline: {
        description: row.description || "Calc line",
        qty,
        uom: row.uom || "EA",
        totalSell: roundCents(unitPrice * qty),
      },
    };
  });
}
