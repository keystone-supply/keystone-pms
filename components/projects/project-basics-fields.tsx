"use client";

import { CustomerSearchCombobox } from "@/components/projects/customer-search-combobox";
import type { ProjectBasics, ProjectBasicsField } from "@/lib/projectTypes";

type Props = {
  mode: "create" | "edit";
  value: ProjectBasics;
  onChange: (field: ProjectBasicsField, value: string) => void;
  /** New project: CRM link for selected directory account */
  createLinkedCustomerId?: string | null;
  onCreateLinkedCustomerIdChange?: (id: string | null) => void;
  /** Same-origin path for &returnTo= after creating a customer from the combobox */
  newCustomerReturnTo?: string;
};

const controlFocus =
  "text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const inputBase = `w-full rounded-xl border border-zinc-700 bg-zinc-900/80 uppercase placeholder:text-zinc-600 ${controlFocus}`;

export function ProjectBasicsFields({
  mode,
  value,
  onChange,
  createLinkedCustomerId,
  onCreateLinkedCustomerIdChange,
  newCustomerReturnTo = "/new-project",
}: Props) {
  const cozy = mode === "create";
  const labelMb = cozy ? "mb-2" : "mb-1";
  const inputPad = cozy ? "px-5 py-4 text-lg" : "px-3 py-2.5 text-base";
  const gridGap = cozy ? "gap-6" : "gap-3";

  const v = {
    customer: value.customer ?? "",
    project_name: value.project_name ?? "",
    customer_po: value.customer_po ?? "",
    supply_industrial: value.supply_industrial ?? "SUPPLY",
  };

  return (
    <>
      <div className={`grid grid-cols-1 md:grid-cols-2 ${gridGap}`}>
        <div>
          <label className={`text-xs text-zinc-500 block ${labelMb}`}>
            CUSTOMER
          </label>
          {cozy &&
          onCreateLinkedCustomerIdChange !== undefined &&
          createLinkedCustomerId !== undefined ? (
            <CustomerSearchCombobox
              value={v.customer}
              customerId={createLinkedCustomerId}
              onCustomerChange={(name) => onChange("customer", name)}
              onCustomerIdChange={onCreateLinkedCustomerIdChange}
              cozy
              returnToAfterNewCustomer={newCustomerReturnTo}
            />
          ) : (
            <input
              required={cozy}
              value={v.customer}
              onChange={(e) => onChange("customer", e.target.value)}
              className={`${inputBase} ${inputPad}`}
              placeholder={cozy ? "TEST INC" : undefined}
            />
          )}
        </div>
        <div>
          <label className={`text-xs text-zinc-500 block ${labelMb}`}>
            PROJECT NAME
          </label>
          <input
            required={cozy}
            value={v.project_name}
            onChange={(e) => onChange("project_name", e.target.value)}
            className={`${inputBase} ${inputPad}`}
            placeholder={cozy ? "TEST JOB" : undefined}
          />
        </div>
      </div>
      <div className={`grid grid-cols-1 md:grid-cols-2 ${gridGap}`}>
        <div>
          <label className={`text-xs text-zinc-500 block ${labelMb}`}>
            CUSTOMER PO #
          </label>
          <input
            value={v.customer_po}
            onChange={(e) => onChange("customer_po", e.target.value)}
            className={`${inputBase} ${cozy ? "px-5 py-4 text-lg" : "px-3 py-2.5 text-base"}`}
          />
        </div>
        <div>
          <label className={`text-xs text-zinc-500 block ${labelMb}`}>
            SUPPLY / INDUSTRIAL
          </label>
          <select
            value={v.supply_industrial}
            onChange={(e) => onChange("supply_industrial", e.target.value)}
            className={`w-full rounded-xl border border-zinc-700 bg-zinc-900/80 ${cozy ? "px-5 py-4 text-lg" : "px-3 py-2.5 text-base"} ${controlFocus}`}
          >
            <option value="SUPPLY">SUPPLY</option>
            <option value="INDUSTRIAL">INDUSTRIAL</option>
          </select>
        </div>
      </div>
    </>
  );
}
