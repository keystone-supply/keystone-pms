"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { closestCenter, DndContext, PointerSensor, type DragEndEvent, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import { CalcSyncDrawer } from "@/components/projects/documents/calc-sync-drawer";
import { LineItemRow } from "@/components/projects/documents/line-item-row";
import { OptionGroupHeader } from "@/components/projects/documents/option-group-header";
import { isCalcLinkedLineStale } from "@/lib/documents/calcDocumentSync";
import type {
  CalcSyncConflict,
  DocumentLineItem,
  OptionGroup,
  ProjectDocumentKind,
} from "@/lib/documentTypes";

type WorkspaceLineItemsPaneProps = {
  projectId: string;
  title?: string;
  kind: ProjectDocumentKind;
  items: DocumentLineItem[];
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
  canEdit?: boolean;
  onAddLine: () => void;
  onAddOptionGroup: () => void;
  onAddSubLine: (lineNo: number) => void;
  onMoveLineUp: (lineNo: number) => void;
  onMoveLineDown: (lineNo: number) => void;
  onSetOptionGroupCollapsed: (optionGroupId: string, collapsed: boolean) => void;
  onSetQuoteMultipleOptionsPresentation: (enabled: boolean) => void;
  onRefreshLinkedCalcLines: () => void;
  onPushLinkedCalcChanges: () => void;
  onResolveCalcSyncConflictsUsingDocument: () => void;
  onResolveCalcSyncConflictsUsingCalc: () => void;
  onRenameOptionGroup: (optionGroupId: string, title: string) => void;
  onRemoveOptionGroup: (optionGroupId: string) => void;
  onAssignLineOptionGroup: (lineNo: number, optionGroupId: string | null) => void;
  onReorderLine: (lineNo: number, targetLineNo: number) => void;
  onRemoveLine: (lineNo: number) => void;
  onPatchLine: (lineNo: number, patch: Partial<DocumentLineItem>) => void;
  onSelectLine: (lineNo: number) => void;
};

type DisplayLine = {
  item: DocumentLineItem;
  indentLevel: number;
};

function flattenDisplayLines(items: DocumentLineItem[]): DisplayLine[] {
  if (items.length === 0) return [];

  const itemById = new Map<string, DocumentLineItem>();
  const childrenByParentId = new Map<string | null, DocumentLineItem[]>();
  const rootItems: DocumentLineItem[] = [];

  for (const item of items) {
    if (item.id) {
      itemById.set(item.id, item);
    }
  }

  for (const item of items) {
    if (!item.parentId || !item.id || !itemById.has(item.parentId)) {
      rootItems.push(item);
      continue;
    }
    const existing = childrenByParentId.get(item.parentId) ?? [];
    existing.push(item);
    childrenByParentId.set(item.parentId, existing);
  }

  const flattened: DisplayLine[] = [];
  const visited = new Set<string>();
  const visit = (line: DocumentLineItem, indentLevel: number) => {
    if (!line.id || visited.has(line.id)) return;
    visited.add(line.id);
    flattened.push({ item: line, indentLevel });
    const children = childrenByParentId.get(line.id) ?? [];
    for (const child of children) {
      visit(child, indentLevel + 1);
    }
  };

  for (const root of rootItems) {
    visit(root, 0);
  }
  for (const item of items) {
    if (!item.id || visited.has(item.id)) continue;
    visit(item, 0);
  }

  return flattened;
}

function SortableLineRow({ id, disabled, children }: { id: string; disabled: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id, disabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

export function WorkspaceLineItemsPane({
  projectId,
  title = "Line items",
  kind,
  items,
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
  canEdit = true,
  onAddLine,
  onAddOptionGroup,
  onAddSubLine,
  onMoveLineUp,
  onMoveLineDown,
  onSetOptionGroupCollapsed,
  onSetQuoteMultipleOptionsPresentation,
  onRefreshLinkedCalcLines,
  onPushLinkedCalcChanges,
  onResolveCalcSyncConflictsUsingDocument,
  onResolveCalcSyncConflictsUsingCalc,
  onRenameOptionGroup,
  onRemoveOptionGroup,
  onAssignLineOptionGroup,
  onReorderLine,
  onRemoveLine,
  onPatchLine,
  onSelectLine,
}: WorkspaceLineItemsPaneProps) {
  const conflictCalcLineIdSet = useMemo(
    () => new Set(calcSyncConflictCalcLineIds),
    [calcSyncConflictCalcLineIds],
  );
  const groupSet = useMemo(() => new Set(optionGroups.map((group) => group.id)), [optionGroups]);
  const groupedLines = useMemo(() => {
    const base = items.filter((line) => !line.optionGroupId || !groupSet.has(line.optionGroupId));
    const byGroup = new Map<string, DocumentLineItem[]>();
    for (const group of optionGroups) {
      byGroup.set(group.id, items.filter((line) => line.optionGroupId === group.id));
    }
    return { base, byGroup };
  }, [groupSet, items, optionGroups]);

  const baseDisplayLines = useMemo(() => flattenDisplayLines(groupedLines.base), [groupedLines.base]);
  const groupedDisplayLines = useMemo(() => {
    return optionGroups.map((group) => {
      const linesInGroup = groupedLines.byGroup.get(group.id) ?? [];
      const displayLines = flattenDisplayLines(linesInGroup);
      const subtotal = linesInGroup.reduce((sum, line) => sum + (line.extended || 0), 0);
      const collapsed = collapsedOptionGroupIds.includes(group.id);
      return { group, displayLines, subtotal, collapsed };
    });
  }, [collapsedOptionGroupIds, groupedLines.byGroup, optionGroups]);

  const supportsOptions =
    kind === "quote" || kind === "rfq" || kind === "purchase_order";
  const [showOnlyStaleLinked, setShowOnlyStaleLinked] = useState(false);

  const staleLinkedLineIds = useMemo(() => {
    const ids = new Set<string>();
    for (const line of items) {
      if (!line.id) continue;
      if (isCalcLinkedLineStale(line)) ids.add(line.id);
    }
    return ids;
  }, [items]);

  const filteredBaseDisplayLines = useMemo(() => {
    if (!showOnlyStaleLinked) return baseDisplayLines;
    return baseDisplayLines.filter(({ item }) => item.id && staleLinkedLineIds.has(item.id));
  }, [baseDisplayLines, showOnlyStaleLinked, staleLinkedLineIds]);

  const filteredGroupedDisplayLines = useMemo(() => {
    if (!showOnlyStaleLinked) return groupedDisplayLines;
    return groupedDisplayLines.map((grouped) => ({
      ...grouped,
      displayLines: grouped.displayLines.filter(
        ({ item }) => item.id && staleLinkedLineIds.has(item.id),
      ),
    }));
  }, [groupedDisplayLines, showOnlyStaleLinked, staleLinkedLineIds]);

  const scrollToLine = useCallback((lineNo: number) => {
    if (typeof document === "undefined") return;
    const target = document.getElementById(`doc-line-row-${lineNo}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const jumpToLine = (lineNo: number) => {
    const targetLine = items.find((line) => line.lineNo === lineNo);
    const hiddenByStaleOnlyFilter =
      showOnlyStaleLinked && targetLine?.id ? !staleLinkedLineIds.has(targetLine.id) : false;
    if (hiddenByStaleOnlyFilter) {
      setShowOnlyStaleLinked(false);
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          scrollToLine(lineNo);
        });
      }
      return;
    }
    scrollToLine(lineNo);
  };

  useEffect(() => {
    if (focusedLineNo == null) return;
    scrollToLine(focusedLineNo);
  }, [focusedLineNo, scrollToLine]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );
  const lineKey = useCallback((line: DocumentLineItem) => line.id ?? `line-${line.lineNo}`, []);
  const handleDragEnd = useCallback(
    (event: DragEndEvent, displayLines: DisplayLine[]) => {
      const activeId = String(event.active.id);
      const overId = event.over ? String(event.over.id) : "";
      if (!overId || activeId === overId) return;
      const activeLine = displayLines.find(({ item }) => lineKey(item) === activeId)?.item;
      const overLine = displayLines.find(({ item }) => lineKey(item) === overId)?.item;
      if (!activeLine || !overLine || activeLine.lineNo === overLine.lineNo) return;
      onReorderLine(activeLine.lineNo, overLine.lineNo);
      onSelectLine(overLine.lineNo);
    },
    [lineKey, onReorderLine, onSelectLine],
  );

  return (
    <section className="flex h-full flex-col rounded-2xl border border-zinc-800 bg-zinc-900/80">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">{title}</h3>
          <p className="text-xs text-zinc-500">
            {items.length} {items.length === 1 ? "row" : "rows"}
          </p>
          {supportsOptions ? (
            <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                className="size-3.5 rounded border-zinc-600 bg-zinc-900"
                checked={quotePresentAsMultipleOptions}
                disabled={!canEdit}
                onChange={(event) => onSetQuoteMultipleOptionsPresentation(event.target.checked)}
              />
              Present as multiple options (no single grand total)
            </label>
          ) : null}
        </div>
        <div className="flex gap-2">
          {supportsOptions ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!canEdit}
              onClick={onAddOptionGroup}
            >
              Add Quote Option
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" disabled={!canEdit} onClick={onAddLine}>
            Add line
          </Button>
        </div>
      </header>
      <CalcSyncDrawer
        linkedCalcLinesCount={linkedCalcLinesCount}
        dirtyLinkedCalcLinesCount={dirtyLinkedCalcLinesCount}
        calcSyncConflicts={calcSyncConflicts}
        calcSyncConflictsCount={calcSyncConflictsCount}
        calcSyncBusy={calcSyncBusy}
        calcSyncError={calcSyncError}
        calcSyncMessage={calcSyncMessage}
        canEdit={canEdit}
        showOnlyStaleLinked={showOnlyStaleLinked}
        onShowOnlyStaleLinkedChange={setShowOnlyStaleLinked}
        onRefreshLinkedCalcLines={onRefreshLinkedCalcLines}
        onPushLinkedCalcChanges={onPushLinkedCalcChanges}
        onResolveCalcSyncConflictsUsingDocument={onResolveCalcSyncConflictsUsingDocument}
        onResolveCalcSyncConflictsUsingCalc={onResolveCalcSyncConflictsUsingCalc}
        onJumpToConflict={jumpToLine}
      />

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/50 p-4 text-sm text-zinc-500">
            No line items yet. Add a row to start drafting.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Base scope</p>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => handleDragEnd(event, filteredBaseDisplayLines)}
              >
                <SortableContext
                  items={filteredBaseDisplayLines.map(({ item }) => lineKey(item))}
                  strategy={verticalListSortingStrategy}
                >
                  {filteredBaseDisplayLines.map(({ item, indentLevel }) => (
                    <SortableLineRow key={lineKey(item)} id={lineKey(item)} disabled={!canEdit}>
                      <LineItemRow
                        projectId={projectId}
                        item={item}
                        indentLevel={indentLevel}
                        disabled={!canEdit}
                        showOptionGroupControl={supportsOptions}
                        optionGroups={optionGroups}
                        hasCalcConflict={Boolean(item.calcLineId && conflictCalcLineIdSet.has(item.calcLineId))}
                        isSelected={focusedLineNo === item.lineNo}
                        onOptionGroupChange={onAssignLineOptionGroup}
                        onMoveUp={onMoveLineUp}
                        onMoveDown={onMoveLineDown}
                        onAddSubItem={onAddSubLine}
                        onRemove={onRemoveLine}
                        onPatch={onPatchLine}
                        onSelect={onSelectLine}
                      />
                    </SortableLineRow>
                  ))}
                </SortableContext>
              </DndContext>
              {filteredBaseDisplayLines.length === 0 ? (
                <div className="rounded-md border border-dashed border-zinc-700 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-500">
                  {showOnlyStaleLinked ? "No stale linked base-scope lines." : "No base-scope lines."}
                </div>
              ) : null}
            </div>
            {supportsOptions
              ? filteredGroupedDisplayLines.map(({ group, displayLines, subtotal, collapsed }) => (
                  <div key={group.id} className="space-y-2">
                    <OptionGroupHeader
                      title={group.title}
                      subtotal={subtotal}
                      collapsed={collapsed}
                      canEdit={canEdit}
                      onToggleCollapsed={() => onSetOptionGroupCollapsed(group.id, !collapsed)}
                      onTitleChange={(nextTitle) => onRenameOptionGroup(group.id, nextTitle)}
                      onRemove={() => onRemoveOptionGroup(group.id)}
                    />
                    {!collapsed ? (
                      <div className="space-y-2">
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(event) => handleDragEnd(event, displayLines)}
                        >
                          <SortableContext
                            items={displayLines.map(({ item }) => lineKey(item))}
                            strategy={verticalListSortingStrategy}
                          >
                            {displayLines.map(({ item, indentLevel }) => (
                              <SortableLineRow key={lineKey(item)} id={lineKey(item)} disabled={!canEdit}>
                                <LineItemRow
                                  projectId={projectId}
                                  item={item}
                                  indentLevel={indentLevel}
                                  disabled={!canEdit}
                                  showOptionGroupControl
                                  optionGroups={optionGroups}
                                  hasCalcConflict={Boolean(
                                    item.calcLineId && conflictCalcLineIdSet.has(item.calcLineId),
                                  )}
                                  isSelected={focusedLineNo === item.lineNo}
                                  onOptionGroupChange={onAssignLineOptionGroup}
                                  onMoveUp={onMoveLineUp}
                                  onMoveDown={onMoveLineDown}
                                  onAddSubItem={onAddSubLine}
                                  onRemove={onRemoveLine}
                                  onPatch={onPatchLine}
                                  onSelect={onSelectLine}
                                />
                              </SortableLineRow>
                            ))}
                          </SortableContext>
                        </DndContext>
                        {displayLines.length === 0 ? (
                          <div className="rounded-md border border-dashed border-zinc-700 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-500">
                            {showOnlyStaleLinked
                              ? "No stale linked lines in this option."
                              : "No lines assigned to this option."}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))
              : null}
          </>
        )}
      </div>
    </section>
  );
}
