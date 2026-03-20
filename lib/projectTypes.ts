/** Shape of a `projects` row used by detail editor and forms. */

export type ProjectStatus = "in_process" | "done" | "cancelled" | null | "";
export type CustomerApproval =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "CANCELLED";

export interface ProjectRow {
  id?: string;
  created_at?: string | null;
  project_number?: string | null;
  project_name?: string | null;
  customer?: string | null;
  customer_po?: string | null;
  supply_industrial?: string | null;
  customer_approval?: string | null;
  project_status?: ProjectStatus;
  project_complete?: boolean | null;
  total_quoted?: number | null;
  materials_quoted?: number | null;
  labor_quoted?: number | null;
  engineering_quoted?: number | null;
  equipment_quoted?: number | null;
  logistics_quoted?: number | null;
  taxes_quoted?: number | null;
  invoiced_amount?: number | null;
  material_cost?: number | null;
  labor_cost?: number | null;
  engineering_cost?: number | null;
  equipment_cost?: number | null;
  logistics_cost?: number | null;
  additional_costs?: number | null;
}

export type ProjectBasics = Pick<
  ProjectRow,
  "customer" | "project_name" | "customer_po" | "supply_industrial"
>;

export type ProjectBasicsField = keyof ProjectBasics;

/** Columns sent on PATCH (no id/created_at). */
export const PROJECT_UPDATE_KEYS = [
  "customer",
  "project_name",
  "customer_po",
  "supply_industrial",
  "customer_approval",
  "project_status",
  "project_complete",
  "total_quoted",
  "materials_quoted",
  "labor_quoted",
  "engineering_quoted",
  "equipment_quoted",
  "logistics_quoted",
  "taxes_quoted",
  "invoiced_amount",
  "material_cost",
  "labor_cost",
  "engineering_cost",
  "equipment_cost",
  "logistics_cost",
  "additional_costs",
] as const satisfies readonly (keyof ProjectRow)[];

export type ProjectUpdateKey = (typeof PROJECT_UPDATE_KEYS)[number];

export function pickProjectUpdatePayload(
  row: ProjectRow,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of PROJECT_UPDATE_KEYS) {
    const v = row[key];
    if (v !== undefined) out[key] = v;
  }
  return out;
}

/** Align completion flag with ops status on save. */
export function normalizeProjectLifecycle(row: ProjectRow): ProjectRow {
  let project_complete = !!row.project_complete;
  if (row.project_status === "done") project_complete = true;
  if (row.project_status === "cancelled") project_complete = false;
  return { ...row, project_complete };
}
