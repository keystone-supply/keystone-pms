import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildQuoteFinancialsSnapshot,
  readQuoteFinancialsSnapshotFromMetadata,
  snapshotToProjectPatch,
} from "@/lib/quoteFinancialsSnapshot";
import type { ProjectRow } from "@/lib/projectTypes";

function p(row: Partial<ProjectRow>): ProjectRow {
  return { id: "t", ...row };
}

describe("buildQuoteFinancialsSnapshot", () => {
  it("includes version, capturedAt, and financial keys", () => {
    const snap = buildQuoteFinancialsSnapshot(
      p({
        materials_vendor_cost: 100,
        material_markup_pct: 25,
        engineering_quoted: 50,
        total_quoted: 999,
      }),
    );
    assert.equal(snap.version, 1);
    assert.ok(typeof snap.capturedAt === "string" && snap.capturedAt.length > 0);
    assert.equal(snap.materials_vendor_cost, 100);
    assert.equal(snap.material_markup_pct, 25);
    assert.equal(snap.engineering_quoted, 50);
    assert.equal(snap.total_quoted, 999);
  });

  it("round-trips through JSON metadata shape", () => {
    const snap = buildQuoteFinancialsSnapshot(
      p({ materials_vendor_cost: 200, taxes_quoted: 12 }),
    );
    const metadata = { lines: [], quoteFinancialsSnapshot: snap };
    const json = JSON.parse(JSON.stringify(metadata)) as unknown;
    const read = readQuoteFinancialsSnapshotFromMetadata(json);
    assert.ok(read);
    assert.equal(read!.materials_vendor_cost, 200);
    assert.equal(read!.taxes_quoted, 12);
  });
});

describe("readQuoteFinancialsSnapshotFromMetadata", () => {
  it("returns null when missing or invalid", () => {
    assert.equal(readQuoteFinancialsSnapshotFromMetadata(null), null);
    assert.equal(readQuoteFinancialsSnapshotFromMetadata({}), null);
    assert.equal(
      readQuoteFinancialsSnapshotFromMetadata({
        quoteFinancialsSnapshot: { version: 2, capturedAt: "x" },
      }),
      null,
    );
    assert.equal(
      readQuoteFinancialsSnapshotFromMetadata({
        quoteFinancialsSnapshot: {
          version: 1,
          capturedAt: "y",
          materials_vendor_cost: "bad",
        },
      }),
      null,
    );
  });

  it("returns null when no financial keys present", () => {
    assert.equal(
      readQuoteFinancialsSnapshotFromMetadata({
        quoteFinancialsSnapshot: { version: 1, capturedAt: "2026-01-01" },
      }),
      null,
    );
  });
});

describe("snapshotToProjectPatch", () => {
  it("maps snapshot fields to project patch", () => {
    const snap = buildQuoteFinancialsSnapshot(
      p({ logistics_quoted: 75, labor_hours_quoted: 3 }),
    );
    const patch = snapshotToProjectPatch(snap);
    assert.equal(patch.logistics_quoted, 75);
    assert.equal(patch.labor_hours_quoted, 3);
  });
});
