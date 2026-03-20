"use client";

import type { ProjectBasics, ProjectBasicsField } from "@/lib/projectTypes";

type Props = {
  mode: "create" | "edit";
  value: ProjectBasics;
  onChange: (field: ProjectBasicsField, value: string) => void;
};

const inputBase =
  "w-full bg-zinc-800 border border-zinc-700 rounded-2xl uppercase";

export function ProjectBasicsFields({ mode, value, onChange }: Props) {
  const cozy = mode === "create";
  const labelMb = cozy ? "mb-2" : "mb-1";
  const inputPad = cozy ? "px-5 py-4 text-lg" : "px-4 py-3 text-lg";
  const gridGap = cozy ? "gap-6" : "gap-4";

  const v = {
    customer: value.customer ?? "",
    project_name: value.project_name ?? "",
    customer_po: value.customer_po ?? "",
    supply_industrial: value.supply_industrial ?? "SUPPLY",
  };

  return (
    <>
      <div className={`grid grid-cols-2 ${gridGap}`}>
        <div>
          <label className={`text-xs text-zinc-500 block ${labelMb}`}>
            CUSTOMER
          </label>
          <input
            required={cozy}
            value={v.customer}
            onChange={(e) => onChange("customer", e.target.value)}
            className={`${inputBase} ${inputPad}`}
            placeholder={cozy ? "TEST INC" : undefined}
          />
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
      <div className={`grid grid-cols-2 ${gridGap}`}>
        <div>
          <label className={`text-xs text-zinc-500 block ${labelMb}`}>
            CUSTOMER PO #
          </label>
          <input
            value={v.customer_po}
            onChange={(e) => onChange("customer_po", e.target.value)}
            className={`${inputBase} ${cozy ? "px-5 py-4" : "px-4 py-3"}`}
          />
        </div>
        <div>
          <label className={`text-xs text-zinc-500 block ${labelMb}`}>
            SUPPLY / INDUSTRIAL
          </label>
          <select
            value={v.supply_industrial}
            onChange={(e) => onChange("supply_industrial", e.target.value)}
            className={`w-full bg-zinc-800 border border-zinc-700 rounded-2xl ${cozy ? "px-5 py-4" : "px-4 py-3"}`}
          >
            <option value="SUPPLY">SUPPLY</option>
            <option value="INDUSTRIAL">INDUSTRIAL</option>
          </select>
        </div>
      </div>
    </>
  );
}
