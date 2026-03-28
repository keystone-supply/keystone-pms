import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DashboardProjectRow } from "@/lib/dashboardMetrics";
import { boardColumnForProject } from "@/lib/salesCommandBoardColumn";
import { moveTargetFromRow, rowAfterMoveToColumn } from "@/lib/salesBoard";

function row(p: Partial<DashboardProjectRow>): DashboardProjectRow {
  return {
    id: p.id ?? "test-id",
    customer_approval: p.customer_approval ?? "PENDING",
    project_status: p.project_status ?? "in_process",
    project_complete: p.project_complete ?? false,
    ...p,
  };
}

describe("boardColumnForProject", () => {
  it("treats rejected and cancelled as lost", () => {
    assert.equal(boardColumnForProject(row({ customer_approval: "REJECTED" })), "lost");
    assert.equal(boardColumnForProject(row({ customer_approval: "CANCELLED" })), "lost");
    assert.equal(boardColumnForProject(row({ project_status: "cancelled" })), "lost");
  });

  it("uses sales_command_stage when not lost", () => {
    assert.equal(
      boardColumnForProject(row({ sales_command_stage: "quote_sent" })),
      "quote_sent",
    );
  });

  it("infers quote_sent when pending and quoted", () => {
    assert.equal(
      boardColumnForProject(row({ customer_approval: "PENDING", total_quoted: 100 })),
      "quote_sent",
    );
  });

  it("infers in_process when accepted", () => {
    assert.equal(
      boardColumnForProject(row({ customer_approval: "ACCEPTED" })),
      "in_process",
    );
  });
});

describe("moveTargetFromRow", () => {
  it("splits lost into rejected vs cancelled", () => {
    assert.equal(moveTargetFromRow(row({ customer_approval: "REJECTED" })), "lost_rejected");
    assert.equal(moveTargetFromRow(row({ customer_approval: "CANCELLED" })), "lost_cancelled");
    assert.equal(moveTargetFromRow(row({ project_status: "cancelled" })), "lost_cancelled");
  });
});

describe("rowAfterMoveToColumn", () => {
  it("stamps rfq_vendors_sent_at once", () => {
    const t0 = new Date("2025-06-01T12:00:00.000Z");
    const once = rowAfterMoveToColumn(row({}), "rfq_vendors", t0);
    assert.equal(once.rfq_vendors_sent_at, t0.toISOString());
    const t1 = new Date("2026-01-01T12:00:00.000Z");
    const twice = rowAfterMoveToColumn(
      once as DashboardProjectRow,
      "rfq_vendors",
      t1,
    );
    assert.equal(twice.rfq_vendors_sent_at, t0.toISOString());
  });

  it("sets lost_rejected outcome", () => {
    const next = rowAfterMoveToColumn(
      row({ customer_approval: "PENDING" }),
      "lost_rejected",
      new Date(),
    );
    assert.equal(next.sales_command_stage, "lost");
    assert.equal(next.customer_approval, "REJECTED");
  });
});
