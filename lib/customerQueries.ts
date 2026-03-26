/** Supabase select strings and row shapes for `customers` + `customer_shipping_addresses`. */

export type CustomerStatus = "active" | "inactive" | "prospect";

export type CustomerRow = {
  id: string;
  legal_name: string;
  account_code: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  billing_line1: string | null;
  billing_line2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_postal_code: string | null;
  billing_country: string | null;
  ap_contact_name: string | null;
  ap_contact_phone: string | null;
  ap_contact_email: string | null;
  payment_terms: string | null;
  status: CustomerStatus;
  notes: string | null;
  follow_up_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerShippingRow = {
  id: string;
  customer_id: string;
  label: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type CustomerWithShipping = CustomerRow & {
  customer_shipping_addresses?: CustomerShippingRow[] | null;
};

/** Columns for directory list (no embed). */
export const CUSTOMER_LIST_SELECT =
  "id, legal_name, account_code, contact_name, contact_email, contact_phone, billing_city, billing_state, payment_terms, status, follow_up_at, created_at, updated_at";

/** Single-account fetch with nested ship-tos (PostgREST FK embed). */
export const CUSTOMER_DETAIL_SELECT = `${CUSTOMER_LIST_SELECT}, customer_shipping_addresses (id, customer_id, label, line1, line2, city, state, postal_code, country, is_default, created_at, updated_at)`;

export type CustomerInsert = {
  legal_name: string;
  account_code?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  billing_line1?: string | null;
  billing_line2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_postal_code?: string | null;
  billing_country?: string | null;
  ap_contact_name?: string | null;
  ap_contact_phone?: string | null;
  ap_contact_email?: string | null;
  payment_terms?: string | null;
  status?: CustomerStatus;
  notes?: string | null;
  follow_up_at?: string | null;
};

export type CustomerUpdate = Partial<Omit<CustomerRow, "id" | "created_at" | "updated_at">>;

export type CustomerShippingInsert = {
  customer_id: string;
  label?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  is_default?: boolean;
};

export type CustomerShippingUpdate = Partial<
  Omit<CustomerShippingRow, "id" | "customer_id" | "created_at" | "updated_at">
>;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** For `<input type="datetime-local" />` from a Postgres timestamptz string. */
export function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** From datetime-local value to ISO for Supabase; empty clears the field. */
export function datetimeLocalToIsoOrNull(local: string): string | null {
  const t = local.trim();
  if (t === "") return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
