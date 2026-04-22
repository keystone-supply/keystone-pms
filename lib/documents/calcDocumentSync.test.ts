import assert from "node:assert/strict";
import test from "node:test";

import type { ProjectCalcLineRow } from "@/lib/calcLines/types";
import type { DocumentLineItem } from "@/lib/documentTypes";
import {
  applySyncBaselineFromDocument,
  collectLinkedCalcLineIds,
  detectSyncConflicts,
  filterCalcConflictsForCurrentLines,
  isCalcLinkedLineStale,
  linkedCalcLineId,
  refreshDocumentFromCalc,
} from "@/lib/documents/calcDocumentSync";

const sampleCalcRow: ProjectCalcLineRow = {
  id: "calc-1",
  tape_id: "tape-1",
  project_id: "project-1",
  kind: "material",
  position: 1,
  description: "Calc Desc",
  qty: 2,
  uom: "EA",
  total_sell: 50,
  notes: null,
  created_by: null,
  created_at: "",
  updated_at: "",
};

test("linkedCalcLineId prefers calcLineId and trims whitespace", () => {
  assert.equal(linkedCalcLineId({ lineNo: 1, description: "", qty: 1, uom: "EA", unitPrice: 1, extended: 1, calcLineId: " calc-1 " }), "calc-1");
  assert.equal(linkedCalcLineId({ lineNo: 1, description: "", qty: 1, uom: "EA", unitPrice: 1, extended: 1, sourceCalcLineId: " source-1 " }), "source-1");
  assert.equal(linkedCalcLineId({ lineNo: 1, description: "", qty: 1, uom: "EA", unitPrice: 1, extended: 1 }), null);
});

test("isCalcLinkedLineStale returns expected stale/synced states", () => {
  const syncedLine: DocumentLineItem = {
    lineNo: 1,
    description: "A",
    qty: 2,
    uom: "EA",
    unitPrice: 25,
    extended: 50,
    calcLineId: "calc-1",
    calcSyncBaseline: { description: "A", qty: 2, uom: "EA", totalSell: 50 },
  };
  assert.equal(isCalcLinkedLineStale(syncedLine), false);
  assert.equal(isCalcLinkedLineStale({ ...syncedLine, extended: 55 }), true);
  assert.equal(isCalcLinkedLineStale({ ...syncedLine, calcSyncBaseline: null }), true);
});

test("refreshDocumentFromCalc updates linked lines and reports count", () => {
  const lines: DocumentLineItem[] = [
    { lineNo: 1, description: "Old", qty: 1, uom: "EA", unitPrice: 10, extended: 10, calcLineId: "calc-1" },
    { lineNo: 2, description: "Keep", qty: 1, uom: "EA", unitPrice: 5, extended: 5 },
  ];

  const result = refreshDocumentFromCalc(lines, [sampleCalcRow]);
  assert.equal(result.refreshedCount, 1);
  assert.equal(result.lines[0].description, "Calc Desc");
  assert.equal(result.lines[0].extended, 50);
  assert.equal(result.lines[1].description, "Keep");
});

test("detectSyncConflicts separates pushable lines from conflict reasons", () => {
  const staleLinked = [
    {
      line: {
        lineNo: 1,
        description: "Calc Desc",
        qty: 2,
        uom: "EA",
        unitPrice: 25,
        extended: 50,
        calcLineId: "calc-1",
        calcSyncBaseline: { description: "Calc Desc", qty: 2, uom: "EA", totalSell: 50 },
      } satisfies DocumentLineItem,
      calcLineId: "calc-1",
    },
    {
      line: {
        lineNo: 2,
        description: "Missing baseline",
        qty: 1,
        uom: "EA",
        unitPrice: 1,
        extended: 1,
        calcLineId: "calc-2",
      } satisfies DocumentLineItem,
      calcLineId: "calc-2",
    },
  ];

  const result = detectSyncConflicts(staleLinked, [sampleCalcRow]);
  assert.equal(result.pushableLines.length, 1);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].reason, "missing_calc_line");
});

test("collect/filter/apply helpers work on linked calc subsets", () => {
  const lines: DocumentLineItem[] = [
    { lineNo: 1, description: "A", qty: 1, uom: "EA", unitPrice: 5, extended: 5, calcLineId: "calc-1" },
    { lineNo: 2, description: "B", qty: 2, uom: "EA", unitPrice: 5, extended: 10, calcLineId: "calc-2" },
    { lineNo: 3, description: "C", qty: 1, uom: "EA", unitPrice: 5, extended: 5 },
  ];
  assert.deepEqual(collectLinkedCalcLineIds(lines), ["calc-1", "calc-2"]);

  const conflicts = [
    { calcLineId: "calc-2", lineNo: 2, reason: "calc_updated" as const },
    { calcLineId: "calc-gone", lineNo: 99, reason: "missing_calc_line" as const },
  ];
  assert.equal(filterCalcConflictsForCurrentLines(conflicts, lines).length, 1);

  const withBaseline = applySyncBaselineFromDocument(lines, ["calc-1"]);
  assert.equal(withBaseline[0].calcSyncBaseline?.totalSell, 5);
  assert.equal(withBaseline[1].calcSyncBaseline, undefined);
});
