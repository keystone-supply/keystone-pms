import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatRiversideDateTimeWithMt,
  formatRiversideDateWithMt,
  formatRiversideTimeWithMt,
  riversideYear,
} from "@/lib/time/riversideDisplay";

test("riverside display helpers use America/Denver with MT suffix", () => {
  const d = new Date("2026-03-29T18:30:00.000Z"); // 12:30 PM in Mountain Daylight Time
  assert.equal(formatRiversideDateWithMt(d), "Mar 29, 2026 MT");
  assert.equal(formatRiversideTimeWithMt(d), "12:30 PM MT");
  assert.match(formatRiversideDateTimeWithMt(d), /Mar 29, 2026.*12:30 PM MT/);
  assert.equal(riversideYear(d), 2026);
});

test("riverside display helpers gracefully handle empty and invalid input", () => {
  assert.equal(formatRiversideDateWithMt(null), "—");
  assert.equal(formatRiversideDateTimeWithMt(""), "—");
  assert.equal(formatRiversideTimeWithMt("not-a-date"), "—");
  assert.equal(riversideYear("not-a-date"), null);
});
