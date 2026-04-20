import assert from "node:assert/strict";
import { test } from "node:test";

import { milestonePatchForDocumentExport } from "@/lib/documentMilestones";
import type { ProjectRow } from "@/lib/projectTypes";

function baseRow(): ProjectRow {
  return {
    id: "p1",
    project_number: "100",
    sales_command_stage: "rfq_customer",
  };
}

test("quote export sets quote_sent stage and stamps quote_sent_at once", () => {
  const row = baseRow();
  const now = new Date("2026-03-28T12:00:00.000Z");
  const patch = milestonePatchForDocumentExport(row, "quote", now);
  assert.equal(patch.sales_command_stage, "quote_sent");
  assert.equal(patch.quote_sent_at, now.toISOString());
});

test("rfq export moves to rfq_vendors and stamps rfq_vendors_sent_at", () => {
  const row = baseRow();
  const now = new Date("2026-03-28T12:00:00.000Z");
  const patch = milestonePatchForDocumentExport(row, "rfq", now);
  assert.equal(patch.sales_command_stage, "rfq_vendors");
  assert.equal(patch.rfq_vendors_sent_at, now.toISOString());
});

test("purchase_order export stamps materials_ordered_at not po_issued_at", () => {
  const row = baseRow();
  const now = new Date("2026-03-28T12:00:00.000Z");
  const patch = milestonePatchForDocumentExport(row, "purchase_order", now);
  assert.equal(patch.materials_ordered_at, now.toISOString());
  assert.equal(patch.po_issued_at, undefined);
});

test("does not overwrite existing quote_sent_at", () => {
  const existing = "2026-01-01T00:00:00.000Z";
  const row: ProjectRow = { ...baseRow(), quote_sent_at: existing };
  const now = new Date("2026-03-28T12:00:00.000Z");
  const patch = milestonePatchForDocumentExport(row, "quote", now);
  assert.equal(patch.quote_sent_at, undefined);
  assert.equal(patch.sales_command_stage, "quote_sent");
});
