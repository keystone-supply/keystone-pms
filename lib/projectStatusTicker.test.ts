import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveProjectStatusTicker,
  TICKER_STAGES,
  type ProjectStatusTicker,
} from "@/lib/projectStatusTicker";
import type { DashboardProjectRow } from "@/lib/dashboardMetrics";

function r(row: Partial<DashboardProjectRow>): DashboardProjectRow {
  return {
    id: "test-project",
    ...row,
  };
}

function stage(ticker: ProjectStatusTicker, id: (typeof TICKER_STAGES)[number]) {
  const value = ticker.stages.find((s) => s.id === id);
  if (!value) throw new Error(`missing stage: ${id}`);
  return value;
}

describe("deriveProjectStatusTicker", () => {
  it("advances through explicit milestone timestamps", () => {
    const ticker = deriveProjectStatusTicker(
      r({
        created_at: "2026-04-01T00:00:00.000Z",
        rfq_received_at: "2026-04-01T10:00:00.000Z",
        rfq_vendors_sent_at: "2026-04-01T12:00:00.000Z",
        quote_sent_at: "2026-04-02T12:00:00.000Z",
      }),
      new Date("2026-04-03T00:00:00.000Z"),
    );

    assert.equal(ticker.current, "approved");
    assert.equal(stage(ticker, "rfq_in").reached, true);
    assert.equal(stage(ticker, "quoted").reached, true);
    assert.equal(stage(ticker, "approved").reached, false);
    assert.equal(ticker.staleDays, 0);
  });

  it("uses approval/board fallbacks when timestamps are missing", () => {
    const ticker = deriveProjectStatusTicker(
      r({
        created_at: "2026-04-01T00:00:00.000Z",
        customer_approval: "ACCEPTED",
        sales_command_stage: "in_process",
      }),
      new Date("2026-04-10T00:00:00.000Z"),
    );

    assert.equal(stage(ticker, "approved").reached, true);
    assert.equal(stage(ticker, "materials_ordered").reached, true);
    assert.equal(ticker.current, "materials_in");
  });

  it("uses completed_at as ready_to_ship fallback", () => {
    const ticker = deriveProjectStatusTicker(
      r({
        created_at: "2026-04-01T00:00:00.000Z",
        rfq_vendors_sent_at: "2026-04-01T08:00:00.000Z",
        quote_sent_at: "2026-04-02T08:00:00.000Z",
        po_issued_at: "2026-04-03T08:00:00.000Z",
        materials_ordered_at: "2026-04-03T12:00:00.000Z",
        material_received_at: "2026-04-04T08:00:00.000Z",
        labor_completed_at: "2026-04-04T18:00:00.000Z",
        completed_at: "2026-04-05T10:00:00.000Z",
      }),
      new Date("2026-04-07T00:00:00.000Z"),
    );

    assert.equal(stage(ticker, "ready_to_ship").reached, true);
    assert.equal(ticker.current, "delivered");
    assert.equal(ticker.staleDays, 1);
  });

  it("marks lifecycle lost for rejected jobs", () => {
    const ticker = deriveProjectStatusTicker(
      r({
        created_at: "2026-04-01T00:00:00.000Z",
        customer_approval: "REJECTED",
      }),
      new Date("2026-04-02T00:00:00.000Z"),
    );

    assert.equal(ticker.lifecycle, "lost");
  });

  it("marks lifecycle cancelled for cancelled jobs", () => {
    const ticker = deriveProjectStatusTicker(
      r({
        created_at: "2026-04-01T00:00:00.000Z",
        project_status: "cancelled",
      }),
      new Date("2026-04-02T00:00:00.000Z"),
    );

    assert.equal(ticker.lifecycle, "cancelled");
  });
});
