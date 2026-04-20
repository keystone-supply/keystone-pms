import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pickProjectUpdatePayload, type ProjectRow } from "@/lib/projectTypes";

function r(p: Partial<ProjectRow>): ProjectRow {
  return { ...p };
}

describe("pickProjectUpdatePayload", () => {
  it("includes only defined keys", () => {
    const out = pickProjectUpdatePayload(
      r({
        sales_command_stage: "in_process",
        materials_ordered_at: undefined,
        material_received_at: null,
      }),
    );
    assert.equal(out.sales_command_stage, "in_process");
    assert.equal(out.material_received_at, null);
    assert.equal("materials_ordered_at" in out, false);
  });

  it("keeps stage terminal timestamps in payload", () => {
    const out = pickProjectUpdatePayload(
      r({
        sales_command_stage: "cancelled",
        cancelled_at: "2026-04-21T00:00:00.000Z",
        lost_at: null,
      }),
    );
    assert.equal(out.sales_command_stage, "cancelled");
    assert.equal(out.cancelled_at, "2026-04-21T00:00:00.000Z");
    assert.equal(out.lost_at, null);
  });

  it("does not emit removed legacy lifecycle fields", () => {
    const out = pickProjectUpdatePayload(r({ sales_command_stage: "quote_sent" }));
    assert.equal("customer_approval" in out, false);
    assert.equal("project_status" in out, false);
    assert.equal("project_complete" in out, false);
  });
});
