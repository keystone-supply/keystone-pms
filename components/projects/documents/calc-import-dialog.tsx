"use client";

import type { ImportStrategy } from "@/lib/calcLines/calcLineImport";
import type { DocumentLineItem } from "@/lib/documentTypes";
import type { ProjectCalcLineRow, ProjectCalcTapeRow } from "@/lib/calcLines/types";
import { Button } from "@/components/ui/button";

type CalcImportDialogProps = {
  open: boolean;
  busy: boolean;
  tapes: ProjectCalcTapeRow[];
  selectedTapeId: string;
  strategy: ImportStrategy;
  markupPct: number;
  lines: ProjectCalcLineRow[];
  selectedLineIds: string[];
  preview: DocumentLineItem[];
  onClose: () => void;
  onTapeChange: (tapeId: string) => Promise<void>;
  onStrategyChange: (strategy: ImportStrategy) => void;
  onMarkupChange: (markupPct: number) => void;
  onToggleLine: (lineId: string, checked: boolean) => void;
  onImport: () => void;
};

export function CalcImportDialog({
  open,
  busy,
  tapes,
  selectedTapeId,
  strategy,
  markupPct,
  lines,
  selectedLineIds,
  preview,
  onClose,
  onTapeChange,
  onStrategyChange,
  onMarkupChange,
  onToggleLine,
  onImport,
}: CalcImportDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">Import from project calc</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Tape</label>
            <select
              value={selectedTapeId}
              onChange={(event) => void onTapeChange(event.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
            >
              <option value="">Select tape</option>
              {tapes.map((tape) => (
                <option key={tape.id} value={tape.id}>
                  {tape.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Strategy</label>
            <select
              value={strategy}
              onChange={(event) => onStrategyChange(event.target.value as ImportStrategy)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
            >
              <option value="oneToOne">One line per calc line</option>
              <option value="collapseLumpSum">Collapse into one line</option>
              <option value="costPlusMarkup">Cost + markup</option>
            </select>
          </div>
        </div>

        {strategy === "costPlusMarkup" ? (
          <div className="mt-3">
            <label className="mb-1 block text-xs text-zinc-500">Markup %</label>
            <input
              type="number"
              value={markupPct}
              onChange={(event) => onMarkupChange(parseFloat(event.target.value) || 0)}
              className="w-full max-w-[12rem] rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
            />
          </div>
        ) : null}

        <div className="mt-4 max-h-52 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          {busy ? (
            <p className="text-sm text-zinc-400">Loading calc lines…</p>
          ) : lines.length === 0 ? (
            <p className="text-sm text-zinc-400">No calc lines on this tape.</p>
          ) : (
            <div className="space-y-2">
              {lines.map((line) => {
                const checked = selectedLineIds.includes(line.id);
                const disabled = line.kind !== "material";
                return (
                  <label key={line.id} className="flex items-start gap-2 text-sm text-zinc-200">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={(event) => {
                        if (disabled) return;
                        onToggleLine(line.id, event.target.checked);
                      }}
                      className="mt-0.5 size-4 rounded border-zinc-600"
                    />
                    <span>
                      {line.description || "(no description)"}{" "}
                      <span className="text-zinc-500">
                        ({line.kind === "material" ? "material" : "math"})
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase text-zinc-500">Preview</p>
          <div className="max-h-52 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            {preview.length === 0 ? (
              <p className="text-sm text-zinc-400">No rows selected.</p>
            ) : (
              <div className="space-y-2">
                {preview.map((line, index) => (
                  <div key={`${line.description}-${index}`} className="text-sm text-zinc-200">
                    {line.description} · {line.qty} {line.uom} · ${line.unitPrice.toFixed(2)} ={" "}
                    <span className="font-mono">${line.extended.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={onImport}
            disabled={preview.length === 0}
          >
            Import
          </Button>
        </div>
      </div>
    </div>
  );
}
