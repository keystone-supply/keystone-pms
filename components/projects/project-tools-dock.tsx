"use client";

import { Copy, ExternalLink, Link2, Pin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useProjectWorkspace } from "@/lib/projectWorkspaceContext";

type ProjectToolsDockProps = {
  customer: string | null | undefined;
  projectNumber: string | null | undefined;
  projectName: string | null | undefined;
};

function projectFolderLink(
  customer: string | null | undefined,
  projectNumber: string | null | undefined,
  projectName: string | null | undefined,
): string {
  const safeCustomer = customer ?? "";
  const safeNumber = projectNumber ?? "";
  const safeName = projectName ?? "";
  return `https://onedrive.live.com/?id=ROOT&cid=...&folder=Documents%2F0%20PROJECT%20FOLDERS%2F${encodeURIComponent(safeCustomer)}%2F${encodeURIComponent(`${safeNumber} - ${safeName}`)}`;
}

export function ProjectToolsDock({
  customer,
  projectNumber,
  projectName,
}: ProjectToolsDockProps) {
  const { pinnedCalcValues, unpinCalcValue } = useProjectWorkspace();

  return (
    <div className="space-y-4 rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Tools dock
      </h3>
      <div className="grid gap-2">
        <a
          href={projectFolderLink(customer, projectNumber, projectName)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-blue-300 hover:bg-zinc-800/70"
        >
          <ExternalLink className="size-4" />
          Open OneDrive folder
        </a>
        <a
          href="/weight-calc"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800/70"
        >
          <Link2 className="size-4" />
          Open shop calc
        </a>
        <a
          href="/nest-remnants"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800/70"
        >
          <Link2 className="size-4" />
          Open nest tool
        </a>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-3">
        <div className="mb-2 flex items-center gap-2 text-sm text-zinc-300">
          <Pin className="size-4 text-amber-300" />
          Pinned calc values
        </div>
        {pinnedCalcValues.length === 0 ? (
          <p className="text-xs text-zinc-500">No pinned values yet.</p>
        ) : (
          <div className="space-y-2">
            {pinnedCalcValues.map((value) => (
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
                    >
                      <Copy className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => unpinCalcValue(value.id)}
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
  );
}
