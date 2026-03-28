"use client";

import type { VendorStatus } from "@/lib/vendorQueries";

const inputBase =
  "w-full rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-zinc-100 placeholder:text-zinc-600";

export type VendorFormState = {
  legal_name: string;
  account_code: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  billing_line1: string;
  billing_line2: string;
  billing_city: string;
  billing_state: string;
  billing_postal_code: string;
  billing_country: string;
  payment_terms: string;
  status: VendorStatus;
  notes: string;
};

export const emptyVendorFormState = (): VendorFormState => ({
  legal_name: "",
  account_code: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  billing_line1: "",
  billing_line2: "",
  billing_city: "",
  billing_state: "",
  billing_postal_code: "",
  billing_country: "",
  payment_terms: "",
  status: "active",
  notes: "",
});

export function VendorAccountFields({
  value,
  onChange,
  showLegalRequired,
}: {
  value: VendorFormState;
  onChange: (patch: Partial<VendorFormState>) => void;
  showLegalRequired?: boolean;
}) {
  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Vendor
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-zinc-500">Legal name</label>
            <input
              required={showLegalRequired}
              value={value.legal_name}
              onChange={(e) => onChange({ legal_name: e.target.value })}
              className={inputBase}
              placeholder="Metal Supply Inc."
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">
              Vendor code
            </label>
            <input
              value={value.account_code}
              onChange={(e) => onChange({ account_code: e.target.value })}
              className={`${inputBase} font-mono`}
              placeholder="V-2001"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Status</label>
            <select
              value={value.status}
              onChange={(e) =>
                onChange({ status: e.target.value as VendorStatus })
              }
              className={inputBase}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Primary contact
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Name</label>
            <input
              value={value.contact_name}
              onChange={(e) => onChange({ contact_name: e.target.value })}
              className={inputBase}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Phone</label>
            <input
              value={value.contact_phone}
              onChange={(e) => onChange({ contact_phone: e.target.value })}
              className={inputBase}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-zinc-500">Email</label>
            <input
              type="email"
              value={value.contact_email}
              onChange={(e) => onChange({ contact_email: e.target.value })}
              className={inputBase}
            />
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Remit / billing address
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-zinc-500">Line 1</label>
            <input
              value={value.billing_line1}
              onChange={(e) => onChange({ billing_line1: e.target.value })}
              className={inputBase}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-zinc-500">Line 2</label>
            <input
              value={value.billing_line2}
              onChange={(e) => onChange({ billing_line2: e.target.value })}
              className={inputBase}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">City</label>
            <input
              value={value.billing_city}
              onChange={(e) => onChange({ billing_city: e.target.value })}
              className={inputBase}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">State</label>
            <input
              value={value.billing_state}
              onChange={(e) => onChange({ billing_state: e.target.value })}
              className={inputBase}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Postal code</label>
            <input
              value={value.billing_postal_code}
              onChange={(e) => onChange({ billing_postal_code: e.target.value })}
              className={inputBase}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Country</label>
            <input
              value={value.billing_country}
              onChange={(e) => onChange({ billing_country: e.target.value })}
              className={inputBase}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-zinc-500">
              Payment terms
            </label>
            <input
              value={value.payment_terms}
              onChange={(e) => onChange({ payment_terms: e.target.value })}
              className={inputBase}
              placeholder="Net 30"
            />
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Notes
        </h3>
        <textarea
          value={value.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          rows={4}
          className={inputBase}
          placeholder="Special instructions, commodity notes…"
        />
      </section>
    </div>
  );
}
