"use client";

import { useEffect, useMemo, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { WorkspaceLineItemsPane } from "@/components/projects/documents/workspace-line-items-pane";
import {
  WorkspaceMetadataPane,
  type WorkspaceMetadataValues,
} from "@/components/projects/documents/workspace-metadata-pane";
import { WorkspacePreviewPane } from "@/components/projects/documents/workspace-preview-pane";
import type {
  CalcSyncConflict,
  DocumentLineItem,
  OptionGroup,
  ProjectDocumentKind,
} from "@/lib/documentTypes";

type DocumentWorkspaceProps = {
  projectId: string;
  metadata: WorkspaceMetadataValues;
  kind: ProjectDocumentKind;
  lineItems: DocumentLineItem[];
  optionGroups: OptionGroup[];
  collapsedOptionGroupIds: string[];
  quotePresentAsMultipleOptions: boolean;
  linkedCalcLinesCount: number;
  dirtyLinkedCalcLinesCount: number;
  calcSyncConflictCalcLineIds: string[];
  calcSyncConflicts: CalcSyncConflict[];
  calcSyncConflictsCount: number;
  calcSyncBusy: boolean;
  calcSyncError: string | null;
  calcSyncMessage: string | null;
  focusedLineNo: number | null;
  draftWatermark: boolean;
  zoomPercent: number;
  previewPdfBlob: Blob | null;
  previewLoading: boolean;
  previewError: string | null;
  canEdit?: boolean;
  onPatchMetadata: (patch: Partial<WorkspaceMetadataValues>) => void;
  onAddLineItem: () => void;
  onAddOptionGroup: () => void;
  onAddSubLineItem: (lineNo: number) => void;
  onMoveLineItemUp: (lineNo: number) => void;
  onMoveLineItemDown: (lineNo: number) => void;
  onSetOptionGroupCollapsed: (optionGroupId: string, collapsed: boolean) => void;
  onSetQuoteMultipleOptionsPresentation: (enabled: boolean) => void;
  onRefreshLinkedCalcLines: () => void;
  onPushLinkedCalcChanges: () => void;
  onResolveCalcSyncConflictsUsingDocument: () => void;
  onResolveCalcSyncConflictsUsingCalc: () => void;
  onRenameOptionGroup: (optionGroupId: string, title: string) => void;
  onRemoveOptionGroup: (optionGroupId: string) => void;
  onAssignLineOptionGroup: (lineNo: number, optionGroupId: string | null) => void;
  onReorderLineItem: (lineNo: number, targetLineNo: number) => void;
  onMoveLineItemAcrossSections: (
    lineNo: number,
    targetLineNo: number | null,
    targetOptionGroupId: string | null,
  ) => void;
  onRemoveLineItem: (lineNo: number) => void;
  onPatchLineItem: (lineNo: number, patch: Partial<DocumentLineItem>) => void;
  onFocusedLineChange: (lineNo: number) => void;
  onDraftWatermarkChange: (nextValue: boolean) => void;
  onZoomPercentChange: (nextValue: number) => void;
  onIndentLineItem: (lineNo: number) => void;
  onOutdentLineItem: (lineNo: number) => void;
  onUndoLineStructureChange: () => void;
  canUndoLineStructureChange: boolean;
  onSave: () => void;
  onClose: () => void;
};

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element.closest("[contenteditable='true']")) return true;
  const tag = element.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

export function DocumentWorkspace({
  projectId,
  metadata,
  kind,
  lineItems,
  optionGroups,
  collapsedOptionGroupIds,
  quotePresentAsMultipleOptions,
  linkedCalcLinesCount,
  dirtyLinkedCalcLinesCount,
  calcSyncConflictCalcLineIds,
  calcSyncConflicts,
  calcSyncConflictsCount,
  calcSyncBusy,
  calcSyncError,
  calcSyncMessage,
  focusedLineNo,
  draftWatermark,
  zoomPercent,
  previewPdfBlob,
  previewLoading,
  previewError,
  canEdit = true,
  onPatchMetadata,
  onAddLineItem,
  onAddOptionGroup,
  onAddSubLineItem,
  onMoveLineItemUp,
  onMoveLineItemDown,
  onSetOptionGroupCollapsed,
  onSetQuoteMultipleOptionsPresentation,
  onRefreshLinkedCalcLines,
  onPushLinkedCalcChanges,
  onResolveCalcSyncConflictsUsingDocument,
  onResolveCalcSyncConflictsUsingCalc,
  onRenameOptionGroup,
  onRemoveOptionGroup,
  onAssignLineOptionGroup,
  onReorderLineItem,
  onMoveLineItemAcrossSections,
  onRemoveLineItem,
  onPatchLineItem,
  onFocusedLineChange,
  onDraftWatermarkChange,
  onZoomPercentChange,
  onIndentLineItem,
  onOutdentLineItem,
  onUndoLineStructureChange,
  canUndoLineStructureChange,
  onSave,
  onClose,
}: DocumentWorkspaceProps) {
  const [mobilePane, setMobilePane] = useState<"metadata" | "lines" | "preview">("lines");
  const orderedLineNos = useMemo(
    () => [...lineItems].map((line) => line.lineNo).sort((a, b) => a - b),
    [lineItems],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const focusedLine = focusedLineNo;
      const targetIsEditable = isEditableTarget(event.target);
      const withMeta = event.metaKey || event.ctrlKey;

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (withMeta && event.key.toLowerCase() === "s") {
        event.preventDefault();
        onSave();
        return;
      }
      if (withMeta && event.key.toLowerCase() === "z" && !targetIsEditable && canUndoLineStructureChange) {
        event.preventDefault();
        onUndoLineStructureChange();
        return;
      }
      if (targetIsEditable || focusedLine == null) return;

      const currentIndex = orderedLineNos.indexOf(focusedLine);
      if (event.key === "ArrowDown" && currentIndex >= 0 && currentIndex < orderedLineNos.length - 1) {
        event.preventDefault();
        onFocusedLineChange(orderedLineNos[currentIndex + 1]);
        return;
      }
      if (event.key === "ArrowUp" && currentIndex > 0) {
        event.preventDefault();
        onFocusedLineChange(orderedLineNos[currentIndex - 1]);
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        if (event.shiftKey) {
          onOutdentLineItem(focusedLine);
        } else {
          onIndentLineItem(focusedLine);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    canUndoLineStructureChange,
    focusedLineNo,
    onClose,
    onFocusedLineChange,
    onIndentLineItem,
    onOutdentLineItem,
    onSave,
    onUndoLineStructureChange,
    orderedLineNos,
  ]);

  return (
    <div className="h-[72vh] min-h-[36rem] rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3 xl:hidden">
        <div className="flex gap-2">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-xs ${mobilePane === "metadata" ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"}`}
            onClick={() => setMobilePane("metadata")}
          >
            Metadata
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-xs ${mobilePane === "lines" ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"}`}
            onClick={() => setMobilePane("lines")}
          >
            Lines
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-xs ${mobilePane === "preview" ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"}`}
            onClick={() => setMobilePane("preview")}
          >
            Preview
          </button>
        </div>
        <p className="text-xs text-zinc-500">Esc close · Cmd/Ctrl+S save · Tab/Shift+Tab indent</p>
      </div>
      <Group orientation="horizontal" className="hidden h-full w-full gap-3 xl:flex">
        <Panel defaultSize={24} minSize={18}>
          <WorkspaceMetadataPane values={metadata} canEdit={canEdit} onPatch={onPatchMetadata} />
        </Panel>

        <Separator className="w-1 rounded-full bg-zinc-800 hover:bg-zinc-700" />

        <Panel defaultSize={44} minSize={30}>
          <WorkspaceLineItemsPane
            projectId={projectId}
            kind={kind}
            items={lineItems}
            optionGroups={optionGroups}
            collapsedOptionGroupIds={collapsedOptionGroupIds}
            quotePresentAsMultipleOptions={quotePresentAsMultipleOptions}
            linkedCalcLinesCount={linkedCalcLinesCount}
            dirtyLinkedCalcLinesCount={dirtyLinkedCalcLinesCount}
            calcSyncConflictCalcLineIds={calcSyncConflictCalcLineIds}
            calcSyncConflicts={calcSyncConflicts}
            calcSyncConflictsCount={calcSyncConflictsCount}
            calcSyncBusy={calcSyncBusy}
            calcSyncError={calcSyncError}
            calcSyncMessage={calcSyncMessage}
            focusedLineNo={focusedLineNo}
            canEdit={canEdit}
            onAddLine={onAddLineItem}
            onAddOptionGroup={onAddOptionGroup}
            onAddSubLine={onAddSubLineItem}
            onMoveLineUp={onMoveLineItemUp}
            onMoveLineDown={onMoveLineItemDown}
            onSetOptionGroupCollapsed={onSetOptionGroupCollapsed}
            onSetQuoteMultipleOptionsPresentation={onSetQuoteMultipleOptionsPresentation}
            onRefreshLinkedCalcLines={onRefreshLinkedCalcLines}
            onPushLinkedCalcChanges={onPushLinkedCalcChanges}
            onResolveCalcSyncConflictsUsingDocument={onResolveCalcSyncConflictsUsingDocument}
            onResolveCalcSyncConflictsUsingCalc={onResolveCalcSyncConflictsUsingCalc}
            onRenameOptionGroup={onRenameOptionGroup}
            onRemoveOptionGroup={onRemoveOptionGroup}
            onAssignLineOptionGroup={onAssignLineOptionGroup}
            onReorderLine={onReorderLineItem}
            onMoveLineAcrossSections={onMoveLineItemAcrossSections}
            onRemoveLine={onRemoveLineItem}
            onPatchLine={onPatchLineItem}
            onSelectLine={onFocusedLineChange}
          />
        </Panel>

        <Separator className="w-1 rounded-full bg-zinc-800 hover:bg-zinc-700" />

        <Panel defaultSize={32} minSize={24}>
          <WorkspacePreviewPane
            draftWatermark={draftWatermark}
            zoomPercent={zoomPercent}
            pdfBlob={previewPdfBlob}
            loading={previewLoading}
            error={previewError}
            focusedLineNo={focusedLineNo}
            onLineLinkClick={onFocusedLineChange}
            onDraftWatermarkChange={onDraftWatermarkChange}
            onZoomPercentChange={onZoomPercentChange}
          />
        </Panel>
      </Group>
      <div className="h-full xl:hidden">
        {mobilePane === "metadata" ? (
          <WorkspaceMetadataPane values={metadata} canEdit={canEdit} onPatch={onPatchMetadata} />
        ) : null}
        {mobilePane === "lines" ? (
          <WorkspaceLineItemsPane
            projectId={projectId}
            kind={kind}
            items={lineItems}
            optionGroups={optionGroups}
            collapsedOptionGroupIds={collapsedOptionGroupIds}
            quotePresentAsMultipleOptions={quotePresentAsMultipleOptions}
            linkedCalcLinesCount={linkedCalcLinesCount}
            dirtyLinkedCalcLinesCount={dirtyLinkedCalcLinesCount}
            calcSyncConflictCalcLineIds={calcSyncConflictCalcLineIds}
            calcSyncConflicts={calcSyncConflicts}
            calcSyncConflictsCount={calcSyncConflictsCount}
            calcSyncBusy={calcSyncBusy}
            calcSyncError={calcSyncError}
            calcSyncMessage={calcSyncMessage}
            focusedLineNo={focusedLineNo}
            canEdit={canEdit}
            onAddLine={onAddLineItem}
            onAddOptionGroup={onAddOptionGroup}
            onAddSubLine={onAddSubLineItem}
            onMoveLineUp={onMoveLineItemUp}
            onMoveLineDown={onMoveLineItemDown}
            onSetOptionGroupCollapsed={onSetOptionGroupCollapsed}
            onSetQuoteMultipleOptionsPresentation={onSetQuoteMultipleOptionsPresentation}
            onRefreshLinkedCalcLines={onRefreshLinkedCalcLines}
            onPushLinkedCalcChanges={onPushLinkedCalcChanges}
            onResolveCalcSyncConflictsUsingDocument={onResolveCalcSyncConflictsUsingDocument}
            onResolveCalcSyncConflictsUsingCalc={onResolveCalcSyncConflictsUsingCalc}
            onRenameOptionGroup={onRenameOptionGroup}
            onRemoveOptionGroup={onRemoveOptionGroup}
            onAssignLineOptionGroup={onAssignLineOptionGroup}
            onReorderLine={onReorderLineItem}
            onMoveLineAcrossSections={onMoveLineItemAcrossSections}
            onRemoveLine={onRemoveLineItem}
            onPatchLine={onPatchLineItem}
            onSelectLine={onFocusedLineChange}
          />
        ) : null}
        {mobilePane === "preview" ? (
          <WorkspacePreviewPane
            draftWatermark={draftWatermark}
            zoomPercent={zoomPercent}
            pdfBlob={previewPdfBlob}
            loading={previewLoading}
            error={previewError}
            focusedLineNo={focusedLineNo}
            onLineLinkClick={onFocusedLineChange}
            onDraftWatermarkChange={onDraftWatermarkChange}
            onZoomPercentChange={onZoomPercentChange}
          />
        ) : null}
      </div>
    </div>
  );
}
