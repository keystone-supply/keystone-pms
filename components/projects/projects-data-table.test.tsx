import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ProjectsDataTable,
  sanitizeColumnSizingState,
} from "@/components/projects/projects-data-table";
import { ProjectStatusTicker } from "@/components/projects/project-status-ticker";
import type { DashboardProjectRow } from "@/lib/dashboardMetrics";
import type { ProjectStatusTicker as ProjectStatusTickerData } from "@/lib/projectStatusTicker";

function row(overrides: Partial<DashboardProjectRow> = {}): DashboardProjectRow {
  return {
    id: "project-1",
    project_number: 1001,
    customer: "Acme",
    created_at: "2026-04-21T00:00:00.000Z",
    project_name: "New job",
    sales_command_stage: "rfq_customer",
    ...overrides,
  };
}

describe("ProjectsDataTable defaults", () => {
  it("shows Status ticker as a default visible column", () => {
    const html = renderToStaticMarkup(
      <ProjectsDataTable data={[row()]} canViewFinancialColumns={false} />,
    );

    assert.match(html, /Status ticker/);
    assert.match(html, /Customer/);
    assert.match(html, /Created/);
    assert.match(html, /Project name/);
    assert.match(html, /Health/);
    assert.match(html, /Current:/);
  });
});

describe("ProjectStatusTicker current-stage marker", () => {
  it("always renders a red dot in the current stage bubble", () => {
    const ticker: ProjectStatusTickerData = {
      lifecycle: "active",
      current: "rfq_in",
      staleDays: 0,
      stages: [
        {
          id: "rfq_in",
          reached: false,
          reachedAt: null,
          isCurrent: true,
        },
      ],
    };

    const html = renderToStaticMarkup(<ProjectStatusTicker ticker={ticker} />);

    assert.match(html, /bg-red-400/);
  });
});

describe("sanitizeColumnSizingState", () => {
  it("keeps only known numeric column sizes and clamps bounds", () => {
    const result = sanitizeColumnSizingState({
      customer: 260.4,
      project_name: 10,
      ticker: 4000,
      nope: 120,
      health: "wide",
    });

    assert.deepEqual(result, {
      customer: 260,
      project_name: 40,
      ticker: 2000,
    });
  });

  it("returns empty sizing map for invalid persisted payloads", () => {
    assert.deepEqual(sanitizeColumnSizingState(null), {});
    assert.deepEqual(sanitizeColumnSizingState("bad"), {});
    assert.deepEqual(sanitizeColumnSizingState(123), {});
  });
});
