"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

import { UnifiedShopCalc } from "@/components/calc/unified-shop-calc";
import { useProjectWorkspaceOptional } from "@/lib/projectWorkspaceContext";

type ProjectCalcPanelProps = {
  projectId: string;
  projectNumber: string | null;
  projectName: string | null;
  customer: string | null;
};

export function ProjectCalcPanel({
  projectId,
  projectNumber,
  projectName,
  customer,
}: ProjectCalcPanelProps) {
  const workspace = useProjectWorkspaceOptional();
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (workspace?.focusTarget === "calc") {
      setIsExpanded(true);
    }
  }, [workspace?.focusTarget]);

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left transition hover:bg-zinc-800/60"
        aria-expanded={isExpanded}
        aria-controls="project-shop-calc-panel"
      >
        <span className="text-sm font-semibold text-white">Shop calc</span>
        <ChevronDown
          className={`size-4 text-zinc-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {isExpanded ? (
        <div id="project-shop-calc-panel" className="mt-3">
          <UnifiedShopCalc
            layout="embedded"
            projectId={projectId}
            projectNumber={projectNumber}
            projectName={projectName}
            customer={customer}
          />
        </div>
      ) : null}
    </section>
  );
}
