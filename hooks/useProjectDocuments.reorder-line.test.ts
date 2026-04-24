import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DocumentLineItem } from "@/lib/documentTypes";
import {
  moveLineWithinHierarchy,
  moveLineBetweenSectionsWithinHierarchy,
  removeLineWithinHierarchy,
  reorderLineWithinHierarchy,
} from "@/hooks/useProjectDocuments";

function buildLine(id: string, lineNo: number): DocumentLineItem {
  return {
    id,
    lineNo,
    description: id,
    qty: 1,
    uom: "EA",
    unitPrice: 1,
    extended: 1,
    parentId: null,
    optionGroupId: null,
  };
}

describe("reorderLineWithinHierarchy", () => {
  it("reindexes line numbers to match new dragged order", () => {
    const lines: DocumentLineItem[] = [
      buildLine("line-a", 1),
      buildLine("line-b", 2),
      buildLine("line-c", 3),
    ];

    const reordered = reorderLineWithinHierarchy(lines, 3, 1);

    assert.deepEqual(
      reordered.map((line) => ({ id: line.id, lineNo: line.lineNo })),
      [
        { id: "line-c", lineNo: 1 },
        { id: "line-a", lineNo: 2 },
        { id: "line-b", lineNo: 3 },
      ],
    );
  });
});

describe("removeLineWithinHierarchy", () => {
  it("deletes line and reindexes remaining line numbers", () => {
    const lines: DocumentLineItem[] = [
      buildLine("line-a", 1),
      buildLine("line-b", 2),
      buildLine("line-c", 3),
      buildLine("line-d", 4),
    ];

    const removed = removeLineWithinHierarchy(lines, 2);

    assert.deepEqual(
      removed.map((line) => ({ id: line.id, lineNo: line.lineNo })),
      [
        { id: "line-a", lineNo: 1 },
        { id: "line-c", lineNo: 2 },
        { id: "line-d", lineNo: 3 },
      ],
    );
  });
});

describe("moveLineWithinHierarchy", () => {
  it("reindexes line numbers after moving up/down", () => {
    const lines: DocumentLineItem[] = [
      buildLine("line-a", 1),
      buildLine("line-b", 2),
      buildLine("line-c", 3),
    ];

    const moved = moveLineWithinHierarchy(lines, 3, "up");

    assert.deepEqual(
      moved.map((line) => ({ id: line.id, lineNo: line.lineNo })),
      [
        { id: "line-a", lineNo: 1 },
        { id: "line-c", lineNo: 2 },
        { id: "line-b", lineNo: 3 },
      ],
    );
  });

  it("does not move a root line across option group boundaries", () => {
    const lines: DocumentLineItem[] = [
      { ...buildLine("base-1", 1), optionGroupId: null },
      { ...buildLine("opt-a-1", 2), optionGroupId: "opt-a" },
      { ...buildLine("opt-b-1", 3), optionGroupId: "opt-b" },
    ];

    const moved = moveLineWithinHierarchy(lines, 2, "up");

    assert.deepEqual(
      moved.map((line) => ({ id: line.id, lineNo: line.lineNo, optionGroupId: line.optionGroupId ?? null })),
      [
        { id: "base-1", lineNo: 1, optionGroupId: null },
        { id: "opt-a-1", lineNo: 2, optionGroupId: "opt-a" },
        { id: "opt-b-1", lineNo: 3, optionGroupId: "opt-b" },
      ],
    );
  });
});

describe("moveLineBetweenSectionsWithinHierarchy", () => {
  it("moves a line to another option section and reindexes globally", () => {
    const lines: DocumentLineItem[] = [
      { ...buildLine("base-1", 1), optionGroupId: null },
      { ...buildLine("opt-a-1", 2), optionGroupId: "opt-a" },
      { ...buildLine("opt-b-1", 3), optionGroupId: "opt-b" },
      { ...buildLine("opt-b-2", 4), optionGroupId: "opt-b" },
    ];

    const moved = moveLineBetweenSectionsWithinHierarchy(lines, 2, 3, "opt-b");

    assert.deepEqual(
      moved.map((line) => ({ id: line.id, lineNo: line.lineNo, optionGroupId: line.optionGroupId ?? null })),
      [
        { id: "base-1", lineNo: 1, optionGroupId: null },
        { id: "opt-a-1", lineNo: 2, optionGroupId: "opt-b" },
        { id: "opt-b-1", lineNo: 3, optionGroupId: "opt-b" },
        { id: "opt-b-2", lineNo: 4, optionGroupId: "opt-b" },
      ],
    );
  });

  it("moves a line to base scope when dropped into base section", () => {
    const lines: DocumentLineItem[] = [
      { ...buildLine("base-1", 1), optionGroupId: null },
      { ...buildLine("opt-a-1", 2), optionGroupId: "opt-a" },
      { ...buildLine("opt-a-2", 3), optionGroupId: "opt-a" },
    ];

    const moved = moveLineBetweenSectionsWithinHierarchy(lines, 3, null, null);

    assert.deepEqual(
      moved.map((line) => ({ id: line.id, lineNo: line.lineNo, optionGroupId: line.optionGroupId ?? null })),
      [
        { id: "base-1", lineNo: 1, optionGroupId: null },
        { id: "opt-a-2", lineNo: 2, optionGroupId: null },
        { id: "opt-a-1", lineNo: 3, optionGroupId: "opt-a" },
      ],
    );
  });
});
