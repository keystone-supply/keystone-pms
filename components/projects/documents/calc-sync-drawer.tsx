"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { CalcSyncConflict, CalcSyncConflictReason } from "@/lib/documentTypes";

type CalcSyncDrawerProps = {
  linkedCalcLinesCount: number;
  dirtyLinkedCalcLinesCount: number;
  calcSyncConflicts: CalcSyncConflict[];
  calcSyncConflictsCount: number;
  calcSyncBusy: boolean;
  calcSyncError: string | null;
  calcSyncMessage: string | null;
  canEdit?: boolean;
  showOnlyStaleLinked: boolean;
  onShowOnlyStaleLinkedChange: (nextValue: boolean) => void;
  onRefreshLinkedCalcLines: () => void;
  onPushLinkedCalcChanges: () => void;
  onResolveCalcSyncConflictsUsingDocument: () => void;
  onResolveCalcSyncConflictsUsingCalc: () => void;
  onJumpToConflict: (lineNo: number) => void;
};

function conflictReasonLabel(reason: CalcSyncConflictReason): string {
  if (reason === "calc_updated") return "Calc row changed since last refresh";
  if (reason === "missing_baseline") return "No sync baseline yet for this linked line";
  return "Linked calc row no longer exists";
}

export function CalcSyncDrawer({
  linkedCalcLinesCount,
  dirtyLinkedCalcLinesCount,
  calcSyncConflicts,
  calcSyncConflictsCount,
  calcSyncBusy,
  calcSyncError,
  calcSyncMessage,
  canEdit = true,
  showOnlyStaleLinked,
  onShowOnlyStaleLinkedChange,
  onRefreshLinkedCalcLines,
  onPushLinkedCalcChanges,
  onResolveCalcSyncConflictsUsingDocument,
  onResolveCalcSyncConflictsUsingCalc,
  onJumpToConflict,
}: CalcSyncDrawerProps) {
  const [open, setOpen] = useState(false);
  const sortedCalcSyncConflicts = useMemo(
    () => [...calcSyncConflicts].sort((a, b) => a.lineNo - b.lineNo),
    [calcSyncConflicts],
  );

  return (
    <div className="border-b border-zinc-800 bg-zinc-950/60 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-300">Calc Tools</p>
          <p className="text-xs text-zinc-500">
            {linkedCalcLinesCount} linked line{linkedCalcLinesCount === 1 ? "" : "s"} ·{" "}
            {dirtyLinkedCalcLinesCount} stale
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen((prev) => !prev)}>
          {open ? "Hide calc tools" : "Show calc tools"}
        </Button>
      </div>

      {open ? (
        <div className="mt-3 space-y-3">
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              className="size-3.5 rounded border-zinc-600 bg-zinc-900"
              checked={showOnlyStaleLinked}
              onChange={(event) => onShowOnlyStaleLinkedChange(event.target.checked)}
            />
            Show only stale linked lines
          </label>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canEdit || linkedCalcLinesCount === 0 || calcSyncBusy}
              onClick={onRefreshLinkedCalcLines}
            >
              Refresh linked calc lines
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canEdit || linkedCalcLinesCount === 0 || dirtyLinkedCalcLinesCount === 0 || calcSyncBusy}
              onClick={onPushLinkedCalcChanges}
            >
              {dirtyLinkedCalcLinesCount > 0
                ? `Push ${dirtyLinkedCalcLinesCount} stale change${dirtyLinkedCalcLinesCount === 1 ? "" : "s"}`
                : "Push linked changes to calc"}
            </Button>
            {calcSyncConflictsCount > 0 ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!canEdit || calcSyncBusy}
                  onClick={onResolveCalcSyncConflictsUsingDocument}
                >
                  Use document for {calcSyncConflictsCount} conflict
                  {calcSyncConflictsCount === 1 ? "" : "s"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!canEdit || calcSyncBusy}
                  onClick={onResolveCalcSyncConflictsUsingCalc}
                >
                  Keep calc for {calcSyncConflictsCount} conflict
                  {calcSyncConflictsCount === 1 ? "" : "s"}
                </Button>
              </>
            ) : null}
          </div>

          {calcSyncError ? (
            <div className="rounded-md border border-red-900 bg-red-950/30 px-3 py-2 text-xs text-red-200">
              {calcSyncError}
            </div>
          ) : calcSyncConflictsCount > 0 ? (
            <div className="rounded-md border border-amber-900 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
              {calcSyncConflictsCount} calc sync conflict{calcSyncConflictsCount === 1 ? "" : "s"} detected.
              Choose whether to keep document edits or accept current calc values.
            </div>
          ) : calcSyncMessage ? (
            <div className="rounded-md border border-emerald-900 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200">
              {calcSyncMessage}
            </div>
          ) : null}

          {calcSyncConflictsCount > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                Conflict details
              </p>
              {sortedCalcSyncConflicts.map((conflict) => (
                <div
                  key={`${conflict.calcLineId}-${conflict.lineNo}`}
                  className="flex items-center justify-between gap-3 rounded border border-zinc-800 bg-zinc-900/70 px-2.5 py-1.5"
                >
                  <div className="text-xs text-zinc-300">
                    <span className="font-medium text-zinc-100">Line {conflict.lineNo}</span>
                    <span className="mx-1.5 text-zinc-500">-</span>
                    <span>{conflictReasonLabel(conflict.reason)}</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => onJumpToConflict(conflict.lineNo)}
                  >
                    Jump
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
