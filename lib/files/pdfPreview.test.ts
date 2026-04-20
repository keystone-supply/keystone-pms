import test from "node:test";
import assert from "node:assert/strict";

import { buildPdfPageNumbers } from "./pdfPreview";

test("returns first page when page count is missing", () => {
  assert.deepEqual(buildPdfPageNumbers(null), [1]);
});

test("returns first page when page count is invalid", () => {
  assert.deepEqual(buildPdfPageNumbers(0), [1]);
});

test("returns all page numbers for multi-page preview", () => {
  assert.deepEqual(buildPdfPageNumbers(3), [1, 2, 3]);
});
