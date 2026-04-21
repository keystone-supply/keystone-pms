import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPdfPageNumbers,
  getPdfPreviewPageWidth,
  getPdfPreviewPageClassName,
  getPdfPreviewRenderConfig,
} from "./pdfPreview";

test("returns first page when page count is missing", () => {
  assert.deepEqual(buildPdfPageNumbers(null), [1]);
});

test("returns first page when page count is invalid", () => {
  assert.deepEqual(buildPdfPageNumbers(0), [1]);
});

test("returns all page numbers for multi-page preview", () => {
  assert.deepEqual(buildPdfPageNumbers(3), [1, 2, 3]);
});

test("uses white canvas rendering for pdf previews", () => {
  assert.deepEqual(getPdfPreviewRenderConfig(), {
    canvasBackground: "rgba(255,255,255,1)",
    renderTextLayer: false,
    renderAnnotationLayer: false,
  });
});

test("uses white page styling inside document bounds", () => {
  assert.equal(
    getPdfPreviewPageClassName(),
    "overflow-hidden rounded-lg border border-zinc-700 bg-white",
  );
});

test("clamps pdf preview width to max width on large containers", () => {
  assert.equal(getPdfPreviewPageWidth(1400), 900);
});

test("shrinks pdf preview width for smaller containers", () => {
  assert.equal(getPdfPreviewPageWidth(640), 616);
});

test("returns minimum width when container is very narrow", () => {
  assert.equal(getPdfPreviewPageWidth(240), 280);
});
