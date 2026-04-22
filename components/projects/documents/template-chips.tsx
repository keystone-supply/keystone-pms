"use client";

import type { TemplateChip } from "@/lib/documentTypes";

type TemplateChipsProps = {
  chips: readonly TemplateChip[];
  onChipClick: (chip: TemplateChip) => void;
  disabled?: boolean;
  className?: string;
};

export function TemplateChips({
  chips,
  onChipClick,
  disabled = false,
  className,
}: TemplateChipsProps) {
  if (chips.length === 0) {
    return null;
  }

  return (
    <div className={["flex flex-wrap gap-2", className].filter(Boolean).join(" ")}>
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          disabled={disabled}
          onClick={() => onChipClick(chip)}
          className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
