"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, ImagePlus } from "lucide-react";
import type { DraggableAttributes, SyntheticListenerMap } from "@dnd-kit/core";

import { Button } from "@/components/ui/button";
import { ImageInsertPicker } from "@/components/projects/documents/image-insert-picker";
import type { DocumentLineItem, OptionGroup } from "@/lib/documentTypes";
import { RichTextEditor, type RichTextEditorValue } from "@/components/projects/documents/rich-text-editor";
import { isCalcLinkedLineStale, linkedCalcLineId } from "@/lib/documents/calcDocumentSync";
import { toPlainTextFromRich } from "@/lib/documents/richTextSerializer";

function buildRichDocFromPlainText(plain: string): RichTextEditorValue {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: plain ? [{ type: "text", text: plain }] : [],
      },
    ],
  };
}

function calcSyncStatus(
  item: DocumentLineItem,
  hasConflict: boolean,
): "unlinked" | "synced" | "stale" | "conflict" {
  if (!linkedCalcLineId(item)) return "unlinked";
  if (hasConflict) return "conflict";
  return isCalcLinkedLineStale(item) ? "stale" : "synced";
}

type LineItemRowProps = {
  projectId: string;
  item: DocumentLineItem;
  displayLineNo?: string;
  indentLevel?: number;
  disabled?: boolean;
  showRowRefPicButton?: boolean;
  showOptionGroupControl?: boolean;
  hasCalcConflict?: boolean;
  optionGroups?: OptionGroup[];
  isSelected?: boolean;
  dragHandleBindings?: {
    attributes: DraggableAttributes;
    listeners: SyntheticListenerMap | undefined;
    setActivatorNodeRef: (element: HTMLElement | null) => void;
    disabled: boolean;
  };
  onAddSubItem: (lineNo: number) => void;
  onOptionGroupChange?: (lineNo: number, optionGroupId: string | null) => void;
  onMoveUp: (lineNo: number) => void;
  onMoveDown: (lineNo: number) => void;
  onRemove: (lineNo: number) => void;
  onPatch: (lineNo: number, patch: Partial<DocumentLineItem>) => void;
  onSelect?: (lineNo: number) => void;
};

export function LineItemRow({
  projectId,
  item,
  displayLineNo,
  indentLevel = 0,
  disabled = false,
  showRowRefPicButton = false,
  showOptionGroupControl = false,
  hasCalcConflict = false,
  optionGroups = [],
  isSelected = false,
  dragHandleBindings,
  onAddSubItem,
  onOptionGroupChange,
  onMoveUp,
  onMoveDown,
  onRemove,
  onPatch,
  onSelect,
}: LineItemRowProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [referencePreviewLoading, setReferencePreviewLoading] = useState(false);
  const richDescriptionValue = item.descriptionRich ?? buildRichDocFromPlainText(item.description);
  const status = calcSyncStatus(item, hasCalcConflict);

  useEffect(() => {
    const fileId = item.imageRef?.fileId?.trim();
    if (!fileId) {
      setReferencePreviewUrl(null);
      setReferencePreviewLoading(false);
      return;
    }
    let cancelled = false;
    setReferencePreviewLoading(true);
    setReferencePreviewUrl(null);
    void (async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/files/${fileId}/preview`, {
          cache: "no-store",
        });
        const body = (await response.json().catch(() => ({}))) as { url?: string };
        if (cancelled) return;
        setReferencePreviewUrl(response.ok && body.url ? body.url : null);
      } finally {
        if (!cancelled) setReferencePreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.imageRef?.fileId, projectId]);

  return (
    <div
      id={`doc-line-row-${item.lineNo}`}
      className={`grid gap-2 rounded-xl border p-3 sm:grid-cols-12 ${
        isSelected
          ? "border-blue-500/80 bg-blue-950/20 ring-1 ring-blue-500/40"
          : "border-zinc-800 bg-zinc-950/80"
      }`}
      style={{ marginLeft: `${Math.min(indentLevel, 8) * 1.25}rem` }}
      onClick={() => onSelect?.(item.lineNo)}
    >
      <div className="sm:col-span-1 space-y-1">
        <input
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-200"
          value={displayLineNo ?? String(item.lineNo)}
          readOnly
          title="Item #"
        />
        {status !== "unlinked" ? (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
              status === "synced"
                ? "border border-emerald-500/50 bg-emerald-900/30 text-emerald-200"
                : status === "conflict"
                  ? "border border-red-500/50 bg-red-900/30 text-red-200"
                  : "border border-amber-500/50 bg-amber-900/30 text-amber-200"
            }`}
          >
            {status === "synced"
              ? "Linked - Synced"
              : status === "conflict"
                ? "Linked - Conflict"
                : "Linked - Stale"}
          </span>
        ) : null}
      </div>
      <div className="sm:col-span-1 flex items-start justify-center">
        <span
          ref={dragHandleBindings?.setActivatorNodeRef}
          {...dragHandleBindings?.attributes}
          {...dragHandleBindings?.listeners}
          className={`inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[10px] uppercase tracking-wide text-zinc-400 ${
            dragHandleBindings?.disabled ? "cursor-not-allowed opacity-60" : "cursor-grab active:cursor-grabbing"
          }`}
          title="Drag to reorder"
        >
          <GripVertical className="size-3" />
          Drag
        </span>
      </div>
      <input
        className="sm:col-span-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white"
        value={item.partRef ?? ""}
        disabled={disabled}
        onChange={(event) =>
          onPatch(item.lineNo, {
            partRef: event.target.value.trim() ? event.target.value.trim() : undefined,
          })
        }
        placeholder="PART #"
      />
      <input
        className="sm:col-span-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white"
        type="number"
        value={item.qty}
        disabled={disabled}
        onChange={(event) => onPatch(item.lineNo, { qty: parseFloat(event.target.value) || 0 })}
      />
      <input
        className="sm:col-span-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white"
        value={item.uom}
        disabled={disabled}
        onChange={(event) => onPatch(item.lineNo, { uom: event.target.value })}
      />
      <input
        className="sm:col-span-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white"
        type="number"
        value={item.unitPrice}
        disabled={disabled}
        onChange={(event) =>
          onPatch(item.lineNo, {
            unitPrice: parseFloat(event.target.value) || 0,
          })
        }
      />
      {showOptionGroupControl ? (
        <select
          className="sm:col-span-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs text-zinc-200"
          value={item.optionGroupId ?? ""}
          disabled={disabled}
          onChange={(event) => onOptionGroupChange?.(item.lineNo, event.target.value || null)}
        >
          <option value="">Base scope</option>
          {optionGroups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.title}
            </option>
          ))}
        </select>
      ) : null}
      <div className="sm:col-span-12 flex flex-wrap items-center justify-end gap-2 border-t border-zinc-800 pt-2">
        {showRowRefPicButton ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            disabled={disabled}
            onClick={() => setPickerOpen((prev) => !prev)}
            title="Insert reference image"
          >
            <ImagePlus className="mr-1.5 size-3.5" />
            Ref pic
          </Button>
        ) : null}
        <div className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900/70 p-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={disabled}
            onClick={() => onMoveUp(item.lineNo)}
            title="Move line up"
          >
            <ArrowUp className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={disabled}
            onClick={() => onMoveDown(item.lineNo)}
            title="Move line down"
          >
            <ArrowDown className="size-3.5" />
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2 text-xs"
          disabled={disabled}
          onClick={() => onAddSubItem(item.lineNo)}
        >
          Add sub-item
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2 text-xs border-red-500/40 text-red-200 hover:bg-red-950/30 hover:text-red-100"
          disabled={disabled}
          onClick={() => onRemove(item.lineNo)}
        >
          Remove
        </Button>
      </div>
      {item.imageRef?.fileId ? (
        <div className="sm:col-span-12 flex items-center gap-3 rounded-md border border-zinc-700 bg-zinc-900/50 px-2 py-1.5 text-xs text-zinc-300">
          {referencePreviewLoading ? (
            <div className="h-14 w-14 animate-pulse rounded border border-zinc-700 bg-zinc-800" />
          ) : referencePreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={referencePreviewUrl}
              alt={`Reference ${item.imageRef.fileId}`}
              className="h-14 w-14 rounded border border-zinc-700 object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded border border-zinc-700 bg-zinc-900 text-[10px] text-zinc-500">
              No thumb
            </div>
          )}
          <div>
            <div>
              Reference image: <span className="font-mono">{item.imageRef.fileId}</span>
            </div>
            {item.imageRef.storageKey ? (
              <div className="text-[11px] text-zinc-500">{item.imageRef.storageKey}</div>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="sm:col-span-12 space-y-1">
        <p className="text-xs text-zinc-500">Description (rich text)</p>
        <RichTextEditor
          value={richDescriptionValue}
          onChange={(nextValue) => {
            onPatch(item.lineNo, {
              descriptionRich: nextValue,
              description: toPlainTextFromRich(nextValue),
            });
          }}
          onInsertImageRequest={disabled ? undefined : () => setPickerOpen(true)}
          snippetProjectId={projectId}
          className="rounded-md border-zinc-700"
        />
      </div>
      {pickerOpen ? (
        <div className="sm:col-span-12">
          <ImageInsertPicker
            open={pickerOpen}
            projectId={projectId}
            disabled={disabled}
            initialImageRef={item.imageRef}
            onApply={(nextImageRef) => onPatch(item.lineNo, { imageRef: nextImageRef })}
            onClose={() => setPickerOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
