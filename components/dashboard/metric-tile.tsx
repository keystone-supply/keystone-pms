import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type MetricTileTone =
  | "default"
  | "positive"
  | "negative"
  | "warning"
  | "info";

const VALUE_TONE_CLASSES: Record<MetricTileTone, string> = {
  default: "text-white",
  positive: "text-emerald-300",
  negative: "text-red-300",
  warning: "text-amber-300",
  info: "text-sky-300",
};

export function MetricTile({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: MetricTileTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5",
        className,
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-mono text-lg font-semibold tabular-nums leading-tight",
          VALUE_TONE_CLASSES[tone],
        )}
      >
        {value}
      </p>
      {hint != null && hint !== "" ? (
        <p className="mt-0.5 text-[11px] text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}
