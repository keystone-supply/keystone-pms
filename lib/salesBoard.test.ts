import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DashboardProjectRow } from "@/lib/dashboardMetrics";
import { boardColumnForProject } from "@/lib/salesCommandBoardColumn";
import { moveTargetFromRow, rowAfterMoveToColumn } from "@/lib/salesBoard";

function row(p: Partial<DashboardProjectRow>): DashboardProjectRow {
  return {
    id: p.id ?? "test-id",
    sales_command_stage: p.sales_command_stage ?? "rfq_customer",
    ...p,
  };
}

describe("boardColumnForProject", () => {
  it("uses sales_command_stage directly", () => {
    assert.equal(
      boardColumnForProject(row({ sales_command_stage: "quote_sent" })),
      "quote_sent",
    );
    assert.equal(boardColumnForProject(row({ sales_command_stage: "lost" })), "lost");
    assert.equal(
      boardColumnForProject(row({ sales_command_stage: "cancelled" })),
      "cancelled",
    );
  });
});

describe("moveTargetFromRow", () => {
  it("returns the row's current stage", () => {
    assert.equal(moveTargetFromRow(row({ sales_command_stage: "lost" })), "lost");
    assert.equal(
      moveTargetFromRow(row({ sales_command_stage: "cancelled" })),
      "cancelled",
    );
  });
});

describe("rowAfterMoveToColumn", () => {
  it("only patches sales_command_stage", () => {
    const next = rowAfterMoveToColumn(
      row({
        sales_command_stage: "rfq_customer",
        quote_sent_at: "2026-01-01T00:00:00.000Z",
      }),
      "rfq_vendors",
    );
    assert.equal(next.sales_command_stage, "rfq_vendors");
    assert.equal(next.quote_sent_at, "2026-01-01T00:00:00.000Z");
  });

  it("supports terminal cancelled stage", () => {
    const next = rowAfterMoveToColumn(row({ sales_command_stage: "in_process" }), "cancelled");
    assert.equal(next.sales_command_stage, "cancelled");
  });
});
