import type { DocumentLineItem, CalcSyncConflict } from "@/lib/documentTypes";
import type { ProjectCalcLineRow } from "@/lib/calcLines/types";

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function linkedCalcLineId(line: DocumentLineItem): string | null {
  const candidate = line.calcLineId ?? line.sourceCalcLineId;
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function makeCalcBaselineFromLine(line: DocumentLineItem) {
  return {
    description: line.description ?? "",
    qty: line.qty,
    uom: line.uom ?? "",
    totalSell: roundMoney(line.extended),
  };
}

export function makeCalcBaselineFromCalcRow(row: ProjectCalcLineRow) {
  const qty = row.qty > 0 ? row.qty : 1;
  return {
    description: row.description || "",
    qty,
    uom: row.uom || "EA",
    totalSell: roundMoney(row.total_sell ?? 0),
  };
}

export function isCalcLinkedLineStale(line: DocumentLineItem): boolean {
  if (!linkedCalcLineId(line)) return false;
  if (!line.calcSyncBaseline) return true;
  return (
    line.calcSyncBaseline.description !== (line.description ?? "") ||
    line.calcSyncBaseline.qty !== line.qty ||
    line.calcSyncBaseline.uom !== (line.uom ?? "") ||
    roundMoney(line.calcSyncBaseline.totalSell) !== roundMoney(line.extended)
  );
}

function sameBaseline(
  baseline: DocumentLineItem["calcSyncBaseline"] | null | undefined,
  next: ReturnType<typeof makeCalcBaselineFromCalcRow>,
): boolean {
  if (!baseline) return false;
  return (
    baseline.description === next.description &&
    baseline.qty === next.qty &&
    baseline.uom === next.uom &&
    roundMoney(baseline.totalSell) === roundMoney(next.totalSell)
  );
}

export function collectLinkedCalcLineIds(lines: DocumentLineItem[]): string[] {
  return Array.from(new Set(lines.map((line) => linkedCalcLineId(line)).filter(Boolean) as string[]));
}

export function refreshDocumentFromCalc(
  lines: DocumentLineItem[],
  calcRows: ProjectCalcLineRow[],
): { lines: DocumentLineItem[]; refreshedCount: number } {
  const calcById = new Map(calcRows.map((row) => [row.id, row]));
  let refreshedCount = 0;
  const nextLines = lines.map((line) => {
    const calcLineId = linkedCalcLineId(line);
    if (!calcLineId) return line;
    const calcRow = calcById.get(calcLineId);
    if (!calcRow) return line;
    const qty = calcRow.qty > 0 ? calcRow.qty : 1;
    const unitPrice = Math.round(((calcRow.total_sell ?? line.extended) / qty) * 100) / 100;
    refreshedCount += 1;
    return {
      ...line,
      description: calcRow.description || line.description,
      qty,
      uom: calcRow.uom || line.uom,
      unitPrice,
      extended: Math.round(qty * unitPrice * 100) / 100,
      calcTapeId: calcRow.tape_id,
      calcLineId: calcRow.id,
      sourceCalcLineId: calcRow.id,
      calcSyncBaseline: makeCalcBaselineFromCalcRow(calcRow),
    };
  });
  return { lines: nextLines, refreshedCount };
}

export function detectSyncConflicts(
  staleLinkedLines: Array<{ line: DocumentLineItem; calcLineId: string }>,
  calcRows: ProjectCalcLineRow[],
): {
  conflicts: CalcSyncConflict[];
  pushableLines: Array<{ line: DocumentLineItem; calcLineId: string }>;
} {
  const calcById = new Map(calcRows.map((row) => [row.id, row]));
  const conflicts: CalcSyncConflict[] = [];
  const pushableLines: Array<{ line: DocumentLineItem; calcLineId: string }> = [];

  for (const entry of staleLinkedLines) {
    const calcRow = calcById.get(entry.calcLineId);
    if (!calcRow) {
      conflicts.push({
        calcLineId: entry.calcLineId,
        lineNo: entry.line.lineNo,
        reason: "missing_calc_line",
      });
      continue;
    }
    if (!entry.line.calcSyncBaseline) {
      conflicts.push({
        calcLineId: entry.calcLineId,
        lineNo: entry.line.lineNo,
        reason: "missing_baseline",
      });
      continue;
    }
    const snapshot = makeCalcBaselineFromCalcRow(calcRow);
    if (!sameBaseline(entry.line.calcSyncBaseline, snapshot)) {
      conflicts.push({
        calcLineId: entry.calcLineId,
        lineNo: entry.line.lineNo,
        reason: "calc_updated",
      });
      continue;
    }
    pushableLines.push(entry);
  }

  return { conflicts, pushableLines };
}

export function applySyncBaselineFromDocument(
  lines: DocumentLineItem[],
  calcLineIds: string[],
): DocumentLineItem[] {
  const idSet = new Set(calcLineIds);
  return lines.map((line) => {
    const calcLineId = linkedCalcLineId(line);
    if (!calcLineId || !idSet.has(calcLineId)) return line;
    return { ...line, calcSyncBaseline: makeCalcBaselineFromLine(line) };
  });
}

export function filterCalcConflictsForCurrentLines(
  conflicts: CalcSyncConflict[],
  lines: DocumentLineItem[],
): CalcSyncConflict[] {
  const linkedIds = new Set(
    lines.map((line) => linkedCalcLineId(line)).filter(Boolean) as string[],
  );
  return conflicts.filter((conflict) => linkedIds.has(conflict.calcLineId));
}
