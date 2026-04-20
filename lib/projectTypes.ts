/** Shape of a `projects` row used by detail editor and forms. */

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
  /** Sales command board column id (see salesCommandBoardColumn). */
  sales_command_stage?: string | null;
  /** Cash received flag; see also invoiced_at / invoiced_amount. */
  payment_received?: boolean | null;
  rfq_received_at?: string | null;
  rfq_vendors_sent_at?: string | null;
  quote_sent_at?: string | null;
  po_issued_at?: string | null;
  in_process_at?: string | null;
  materials_ordered_at?: string | null;
  material_received_at?: string | null;
  labor_completed_at?: string | null;
  ready_to_ship_at?: string | null;
  completed_at?: string | null;
  delivered_at?: string | null;
  invoiced_at?: string | null;
  lost_at?: string | null;
  cancelled_at?: string | null;
  total_quoted?: number | null;
  /** Raw vendor / materials spend (before internal markup helper). */
  materials_vendor_cost?: number | null;
  /** Internal markup on materials, percent; UI defaults to 30 when null. */
  material_markup_pct?: number | null;
  engineering_markup_pct?: number | null;
  equipment_markup_pct?: number | null;
  logistics_markup_pct?: number | null;
  materials_quoted?: number | null;
  labor_quoted?: number | null;
  labor_hours_quoted?: number | null;
  labor_cost_per_hr?: number | null;
  labor_sell_per_hr?: number | null;
  labor_hours_actual?: number | null;
  labor_cost_per_hr_actual?: number | null;
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
  files_phase1_enabled?: boolean | null;
}

export type ProjectBasics = Pick<
  ProjectRow,
  "customer" | "project_name" | "customer_po" | "supply_industrial"
>;

export type ProjectBasicsField = keyof ProjectBasics;

/** Columns sent on PATCH (no id/created_at). */
export const PROJECT_UPDATE_KEYS = [
  "customer",
  "customer_id",
  "project_name",
  "customer_po",
  "supply_industrial",
  "sales_command_stage",
  "payment_received",
  "rfq_received_at",
  "rfq_vendors_sent_at",
  "quote_sent_at",
  "po_issued_at",
  "in_process_at",
  "materials_ordered_at",
  "material_received_at",
  "labor_completed_at",
  "ready_to_ship_at",
  "completed_at",
  "delivered_at",
  "invoiced_at",
  "lost_at",
  "cancelled_at",
  "total_quoted",
  "materials_vendor_cost",
  "material_markup_pct",
  "engineering_markup_pct",
  "equipment_markup_pct",
  "logistics_markup_pct",
  "materials_quoted",
  "labor_quoted",
  "labor_hours_quoted",
  "labor_cost_per_hr",
  "labor_sell_per_hr",
  "labor_hours_actual",
  "labor_cost_per_hr_actual",
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
  "files_phase1_enabled",
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
