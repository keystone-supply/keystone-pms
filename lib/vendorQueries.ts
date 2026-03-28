/** Supabase select strings and row shapes for `vendors`. */

export type VendorStatus = "active" | "inactive";

export type VendorRow = {
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
  payment_terms: string | null;
  status: VendorStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const VENDOR_LIST_SELECT =
  "id, legal_name, account_code, contact_name, contact_email, contact_phone, billing_city, billing_state, payment_terms, status, notes, created_at, updated_at";

export const VENDOR_DETAIL_SELECT =
  "id, legal_name, account_code, contact_name, contact_email, contact_phone, billing_line1, billing_line2, billing_city, billing_state, billing_postal_code, billing_country, payment_terms, status, notes, created_at, updated_at";

export type VendorInsert = {
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
  payment_terms?: string | null;
  status?: VendorStatus;
  notes?: string | null;
};

export type VendorUpdate = Partial<
  Omit<VendorRow, "id" | "created_at" | "updated_at">
>;
