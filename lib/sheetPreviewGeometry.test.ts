import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSheetPreviewSvgMarkup,
  getSheetPreviewRings,
} from "@/lib/sheetPreviewGeometry";

test("getSheetPreviewRings falls back to rectangle dimensions", () => {
  const rings = getSheetPreviewRings({
    svg_path: "",
    length_in: 120,
    width_in: 48,
  });

  assert.equal(rings.length, 1);
  assert.equal(rings[0].length, 4);
});

test("buildSheetPreviewSvgMarkup builds an svg document with viewBox", () => {
  const result = buildSheetPreviewSvgMarkup({
    svg_path: "",
    length_in: 96,
    width_in: 48,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.match(result.svg, /^<svg[^>]*viewBox="/);
  assert.match(result.svg, /<path d="/);
});
