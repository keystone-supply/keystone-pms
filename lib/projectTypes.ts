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
  /** Optional FK to `customers` for CRM-linked jobs. */
  customer_id?: string | null;
  customer_po?: string | null;
  supply_industrial?: string | null;
  customer_approval?: string | null;
  project_status?: ProjectStatus;
  project_complete?: boolean | null;
  /** Sales command board column id (see salesCommandBoardColumn). */
  sales_command_stage?: string | null;
  /** Cash received flag; see also invoiced_at / invoiced_amount. */
  payment_received?: boolean | null;
  rfq_vendors_sent_at?: string | null;
  quote_sent_at?: string | null;
  po_issued_at?: string | null;
  in_process_at?: string | null;
  materials_ordered_at?: string | null;
  material_received_at?: string | null;
  labor_completed_at?: string | null;
  completed_at?: string | null;
  delivered_at?: string | null;
  invoiced_at?: string | null;
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
  "sales_command_stage",
  "payment_received",
  "rfq_vendors_sent_at",
  "quote_sent_at",
  "po_issued_at",
  "in_process_at",
  "materials_ordered_at",
  "material_received_at",
  "labor_completed_at",
  "completed_at",
  "delivered_at",
  "invoiced_at",
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
