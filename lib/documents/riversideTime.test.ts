import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatRiversideDateLong,
  formatRiversideDateStampMdY,
  formatRiversideDateStampYmd,
} from "@/lib/documents/riversideTime";

test("riverside date helpers are stable for UTC input", () => {
  const d = new Date("2026-03-29T18:30:00.000Z");
  assert.equal(formatRiversideDateLong(d), "Mar 29, 2026");
  assert.equal(formatRiversideDateStampMdY(d), "03.29.2026");
  assert.equal(formatRiversideDateStampYmd(d), "20260329");
});
