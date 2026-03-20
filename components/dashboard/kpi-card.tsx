import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: LucideIcon;
  href?: string;
  valueClassName?: string;
}) {
  const inner = (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/80 p-5 shadow-sm transition-colors",
        href &&
          "hover:border-blue-500/40 hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            {label}
          </p>
          <p
            className={cn(
              "font-mono text-2xl font-semibold tracking-tight text-white sm:text-3xl",
              valueClassName,
            )}
          >
            {value}
          </p>
          {hint ? (
            <p className="text-xs text-zinc-500">{hint}</p>
          ) : null}
        </div>
        {Icon ? (
          <Icon className="size-9 shrink-0 text-zinc-600" aria-hidden />
        ) : null}
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-blue-500/35 to-transparent"
        aria-hidden
      />
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block rounded-2xl outline-none">
        {inner}
      </Link>
    );
  }

  return inner;
}
