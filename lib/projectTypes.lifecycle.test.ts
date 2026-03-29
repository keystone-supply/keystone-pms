import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeProjectLifecycle,
  syncLifecycleFromNonLostStage,
} from "@/lib/projectTypes";
import type { ProjectRow } from "@/lib/projectTypes";

function r(p: Partial<ProjectRow>): ProjectRow {
  return {
    ...p,
  };
}

describe("syncLifecycleFromNonLostStage", () => {
  it("forces done + complete for complete stage", () => {
    const out = syncLifecycleFromNonLostStage(
      r({
        sales_command_stage: "complete",
        project_status: "in_process",
        project_complete: false,
      }),
    );
    assert.equal(out.project_status, "done");
    assert.equal(out.project_complete, true);
  });

  it("forces done + complete for invoiced stage", () => {
    const out = syncLifecycleFromNonLostStage(
      r({
        sales_command_stage: "invoiced",
        project_status: "in_process",
        project_complete: false,
      }),
    );
    assert.equal(out.project_status, "done");
    assert.equal(out.project_complete, true);
  });

  it("leaves lost stage unchanged", () => {
    const out = syncLifecycleFromNonLostStage(
      r({
        sales_command_stage: "lost",
        project_complete: false,
        customer_approval: "REJECTED",
      }),
    );
    assert.equal(out.project_complete, false);
    assert.equal(out.sales_command_stage, "lost");
  });
});

describe("normalizeProjectLifecycle", () => {
  it("does not override cancelled status from stage", () => {
    const out = normalizeProjectLifecycle(
      r({
        project_status: "cancelled",
        sales_command_stage: "quote_sent",
        project_complete: false,
      }),
    );
    assert.equal(out.project_status, "cancelled");
    assert.equal(out.project_complete, false);
  });

  it("aligns status with stage when active", () => {
    const out = normalizeProjectLifecycle(
      r({
        project_status: "in_process",
        sales_command_stage: "complete",
        project_complete: false,
      }),
    );
    assert.equal(out.project_status, "done");
    assert.equal(out.project_complete, true);
  });

  it("skips stage sync when customer_approval is REJECTED", () => {
    const out = normalizeProjectLifecycle(
      r({
        customer_approval: "REJECTED",
        project_status: "in_process",
        sales_command_stage: "quote_sent",
        project_complete: false,
      }),
    );
    assert.equal(out.project_status, "in_process");
    assert.equal(out.project_complete, false);
  });
});
