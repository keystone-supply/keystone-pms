/** Supabase `select` string for project rows used on dashboard and list (keeps fields in sync). */
export const PROJECT_SELECT =
  "id, project_number, project_name, customer, customer_id, sales_command_stage, rfq_received_at, rfq_vendors_sent_at, quote_sent_at, po_issued_at, in_process_at, materials_ordered_at, material_received_at, labor_completed_at, ready_to_ship_at, completed_at, delivered_at, invoiced_at, lost_at, cancelled_at, payment_received, supply_industrial, created_at, total_quoted, materials_vendor_cost, material_markup_pct, engineering_markup_pct, equipment_markup_pct, logistics_markup_pct, invoiced_amount, material_cost, labor_cost, engineering_cost, equipment_cost, logistics_cost, additional_costs, materials_quoted, labor_quoted, labor_hours_quoted, labor_cost_per_hr, labor_sell_per_hr, labor_hours_actual, labor_cost_per_hr_actual, engineering_quoted, equipment_quoted, logistics_quoted, taxes_quoted, files_phase1_enabled";

export const PROJECT_SELECT_LEGACY =
  "id, project_number, project_name, customer, customer_id, sales_command_stage, rfq_vendors_sent_at, quote_sent_at, po_issued_at, in_process_at, materials_ordered_at, material_received_at, labor_completed_at, completed_at, delivered_at, invoiced_at, payment_received, supply_industrial, created_at, total_quoted, materials_vendor_cost, material_markup_pct, engineering_markup_pct, equipment_markup_pct, logistics_markup_pct, invoiced_amount, material_cost, labor_cost, engineering_cost, equipment_cost, logistics_cost, additional_costs, materials_quoted, labor_quoted, labor_hours_quoted, labor_cost_per_hr, labor_sell_per_hr, labor_hours_actual, labor_cost_per_hr_actual, engineering_quoted, equipment_quoted, logistics_quoted, taxes_quoted";

type QueryError = { message: string };
type SelectResult = { data: unknown; error: QueryError | null };
type Awaitable<T> = T | PromiseLike<T>;

export function isMissingTickerColumnError(error: QueryError | null): boolean {
  if (!error?.message) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("rfq_received_at") ||
    msg.includes("ready_to_ship_at") ||
    msg.includes("files_phase1_enabled")
  );
}

let forceLegacyProjectSelect = false;

export async function withProjectSelectFallback(
  runSelect: (select: string) => Awaitable<SelectResult>,
): Promise<{ data: unknown; error: QueryError | null; usedLegacySelect: boolean }> {
  if (forceLegacyProjectSelect) {
    const legacy = await runSelect(PROJECT_SELECT_LEGACY);
    return { ...legacy, usedLegacySelect: true };
  }

  const primary = await runSelect(PROJECT_SELECT);
  if (!isMissingTickerColumnError(primary.error)) {
    return { ...primary, usedLegacySelect: false };
  }

  forceLegacyProjectSelect = true;
  const legacy = await runSelect(PROJECT_SELECT_LEGACY);
  return { ...legacy, usedLegacySelect: true };
}
