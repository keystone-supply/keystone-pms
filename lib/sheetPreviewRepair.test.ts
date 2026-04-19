import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeSheetPreviewRepairLimit,
  toSheetPreviewObjectPath,
} from "@/lib/sheetPreviewRepair";

test("normalizeSheetPreviewRepairLimit clamps values", () => {
  assert.equal(normalizeSheetPreviewRepairLimit(undefined), 25);
  assert.equal(normalizeSheetPreviewRepairLimit(-10), 1);
  assert.equal(normalizeSheetPreviewRepairLimit(300), 200);
  assert.equal(normalizeSheetPreviewRepairLimit(20), 20);
});

test("toSheetPreviewObjectPath uses deterministic svg naming", () => {
  assert.equal(
    toSheetPreviewObjectPath("5cfb9f42-65df-4c8f-87f0-8c174a0feca9"),
    "5cfb9f42-65df-4c8f-87f0-8c174a0feca9.svg",
  );
});
