"use client";

import { useState } from "react";
import { ChevronDown, Copy, Pin } from "lucide-react";

import { UnifiedShopCalc } from "@/components/calc/unified-shop-calc";
import { Button } from "@/components/ui/button";
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
  const calcFocused = workspace?.focusTarget === "calc";
  const panelExpanded = isExpanded || calcFocused;

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left transition hover:bg-zinc-800/60"
        aria-expanded={panelExpanded}
        aria-controls="project-shop-calc-panel"
      >
        <span className="text-sm font-semibold text-white">Shop calc</span>
        <ChevronDown
          className={`size-4 text-zinc-400 transition-transform ${panelExpanded ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {panelExpanded ? (
        <div id="project-shop-calc-panel" className="mt-3">
          <UnifiedShopCalc
            layout="embedded"
            projectId={projectId}
            projectNumber={projectNumber}
            projectName={projectName}
            customer={customer}
          />
          <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm text-zinc-300">
              <Pin className="size-4 text-amber-300" />
              Pinned tape values
            </div>
            {!workspace || workspace.pinnedCalcValues.length === 0 ? (
              <p className="text-xs text-zinc-500">No pinned values yet.</p>
            ) : (
              <div className="space-y-2">
                {workspace.pinnedCalcValues.map((value) => (
                  <div
                    key={value.id}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                  >
                    <div className="text-xs text-zinc-500">{value.label}</div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <code className="truncate text-sm text-zinc-100">{value.value}</code>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void navigator.clipboard.writeText(value.value)}
                          aria-label={`Copy ${value.label}`}
                        >
                          <Copy className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => workspace.unpinCalcValue(value.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
