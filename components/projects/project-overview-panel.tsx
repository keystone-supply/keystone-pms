"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { ProjectBasicsFields } from "@/components/projects/project-basics-fields";
import { ProjectStatusTicker } from "@/components/projects/project-status-ticker";
import type { CustomerRow } from "@/lib/customerQueries";
import {
  deriveProjectStatusTicker,
  type TickerStageId,
} from "@/lib/projectStatusTicker";
import type { ProjectBasicsField, ProjectRow } from "@/lib/projectTypes";

const detailFieldClass =
  "w-full rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const OPS_MILESTONE_FIELDS: Array<{
  key:
    | "rfq_received_at"
    | "rfq_vendors_sent_at"
    | "quote_sent_at"
    | "po_issued_at"
    | "in_process_at"
    | "materials_ordered_at"
    | "material_received_at"
    | "labor_completed_at"
    | "ready_to_ship_at"
    | "completed_at"
    | "delivered_at"
    | "invoiced_at";
  label: string;
}> = [
  { key: "rfq_received_at", label: "RFQ received (customer)" },
  { key: "rfq_vendors_sent_at", label: "RFQ → vendors sent" },
  { key: "quote_sent_at", label: "Quote sent" },
  { key: "po_issued_at", label: "Customer PO" },
  { key: "in_process_at", label: "In process (shop)" },
  { key: "materials_ordered_at", label: "Materials ordered" },
  { key: "material_received_at", label: "Material received" },
  { key: "labor_completed_at", label: "Labor complete" },
  { key: "ready_to_ship_at", label: "Ready to ship" },
  { key: "completed_at", label: "Complete (sales board)" },
  { key: "delivered_at", label: "Delivered" },
  { key: "invoiced_at", label: "Invoiced" },
];

function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(local: string): string | null {
  if (!local || local.trim() === "") return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type ProjectOverviewPanelProps = {
  project: ProjectRow;
  canEditProject: boolean;
  customersList: CustomerRow[];
  canAccessSales: boolean;
  onBasicsChange: (field: ProjectBasicsField, value: string) => void;
  updateField: <K extends keyof ProjectRow>(field: K, value: ProjectRow[K]) => void;
  onAdvanceStage?: (stage: TickerStageId) => void;
};

export function ProjectOverviewPanel({
  project,
  canEditProject,
  customersList,
  canAccessSales: canAccessSalesRole,
  onBasicsChange,
  updateField,
  onAdvanceStage,
}: ProjectOverviewPanelProps) {
  const [milestonesOpen, setMilestonesOpen] = useState(false);

  return (
    <fieldset className="space-y-6" disabled={!canEditProject}>
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
        <h2 className="mb-6 text-xl font-semibold">Project info</h2>
        <ProjectStatusTicker
          ticker={deriveProjectStatusTicker(project)}
          variant="full"
          className="mb-6"
          interactive={canEditProject}
          onAdvanceStage={onAdvanceStage}
        />
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">PROJECT #</label>
            <div className="font-mono text-2xl font-semibold tracking-tight text-emerald-400/90">
              {project.project_number}
            </div>
          </div>
          <ProjectBasicsFields
            mode="edit"
            value={{
              customer: project.customer,
              project_name: project.project_name,
              customer_po: project.customer_po,
              supply_industrial: project.supply_industrial,
            }}
            onChange={onBasicsChange}
          />
          <div>
            <label className="mb-1 block text-xs text-zinc-500">
              CRM account (optional)
            </label>
            <select
              value={project.customer_id ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                updateField("customer_id", v === "" ? null : v);
              }}
              className={detailFieldClass}
            >
              <option value="">None — free-text customer only</option>
              {customersList.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.legal_name}
                  {customer.account_code ? ` (${customer.account_code})` : ""}
                </option>
              ))}
            </select>
            {project.customer_id && canAccessSalesRole ? (
              <p className="mt-1 text-[11px] text-zinc-500">
                <a
                  href={`/sales/customers/${project.customer_id}`}
                  className="text-blue-400 hover:underline"
                >
                  Open account in Sales
                </a>
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">APPROVAL</label>
              <select
                value={project.customer_approval || "PENDING"}
                onChange={(e) => updateField("customer_approval", e.target.value)}
                className={detailFieldClass}
              >
                <option value="PENDING">PENDING</option>
                <option value="ACCEPTED">ACCEPTED</option>
                <option value="REJECTED">REJECTED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">
                PROJECT STATUS
              </label>
              <select
                value={project.project_status || ""}
                onChange={(e) => {
                  const v = e.target.value;
                  updateField(
                    "project_status",
                    v === ""
                      ? null
                      : (v as NonNullable<ProjectRow["project_status"]>),
                  );
                }}
                className={detailFieldClass}
              >
                <option value="">—</option>
                <option value="in_process">IN PROCESS</option>
                <option value="done">DONE</option>
                <option value="cancelled">CANCELLED</option>
              </select>
            </div>
          </div>
          <label className="flex cursor-pointer select-none items-center gap-3">
            <input
              type="checkbox"
              checked={!!project.project_complete}
              onChange={(e) => updateField("project_complete", e.target.checked)}
              className="size-4 rounded border-zinc-600 bg-zinc-900 text-blue-500 focus:ring-2 focus:ring-blue-500/40"
            />
            <span className="text-sm text-zinc-300">Project complete</span>
          </label>
          <label className="flex cursor-pointer select-none items-center gap-3">
            <input
              type="checkbox"
              checked={!!project.payment_received}
              onChange={(e) => updateField("payment_received", e.target.checked)}
              className="size-4 rounded border-zinc-600 bg-zinc-900 text-blue-500 focus:ring-2 focus:ring-blue-500/40"
            />
            <span className="text-sm text-zinc-300">Payment received</span>
          </label>
          <div className="mt-6 rounded-2xl border border-zinc-800/50 bg-zinc-950/30 p-4">
            <button
              type="button"
              onClick={() => setMilestonesOpen((open) => !open)}
              className="flex w-full items-center gap-1.5 text-left text-xs font-medium text-zinc-400 hover:text-zinc-200"
              aria-expanded={milestonesOpen}
              id="project-milestones-toggle"
            >
              {milestonesOpen ? (
                <ChevronDown className="size-4 shrink-0 text-zinc-500" />
              ) : (
                <ChevronRight className="size-4 shrink-0 text-zinc-500" />
              )}
              Milestones (date/time, optional)
            </button>
            {milestonesOpen ? (
              <div
                className="mt-4 space-y-4 text-sm"
                role="region"
                aria-labelledby="project-milestones-toggle"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {OPS_MILESTONE_FIELDS.map(({ key, label }) => (
                    <div key={key}>
                      <label className="mb-1 block text-xs text-zinc-500">
                        {label}
                      </label>
                      <input
                        type="datetime-local"
                        value={isoToDatetimeLocal(project[key])}
                        onChange={(e) =>
                          updateField(key, datetimeLocalToIso(e.target.value))
                        }
                        className={detailFieldClass}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </fieldset>
  );
}
