"use client";

import { useCallback, useRef } from "react";

import { TemplateChips } from "@/components/projects/documents/template-chips";
import { DEFAULT_TEMPLATE_CHIPS } from "@/lib/documentTypes";

export type WorkspaceMetadataValues = {
  documentTitle: string;
  documentNumber: string;
  customerName: string;
  projectName: string;
  notes: string;
};

function insertTemplateAtSelection(
  currentValue: string,
  templateText: string,
  start: number,
  end: number,
) {
  const before = currentValue.slice(0, start);
  const after = currentValue.slice(end);
  const needsLeadingSpace = before.length > 0 && !/\s$/.test(before);
  const needsTrailingSpace = after.length > 0 && !/^\s/.test(after);
  const inserted = `${needsLeadingSpace ? " " : ""}${templateText}${needsTrailingSpace ? " " : ""}`;
  const nextValue = `${before}${inserted}${after}`;
  const nextCaret = before.length + inserted.length;

  return { nextValue, nextCaret };
}

type WorkspaceMetadataPaneProps = {
  values: WorkspaceMetadataValues;
  canEdit?: boolean;
  onPatch: (patch: Partial<WorkspaceMetadataValues>) => void;
};

export function WorkspaceMetadataPane({
  values,
  canEdit = true,
  onPatch,
}: WorkspaceMetadataPaneProps) {
  const notesTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectionRef = useRef({ start: 0, end: 0 });

  const updateSelectionRef = useCallback(() => {
    const textarea = notesTextareaRef.current;
    if (!textarea) {
      return;
    }

    selectionRef.current = {
      start: textarea.selectionStart ?? 0,
      end: textarea.selectionEnd ?? textarea.selectionStart ?? 0,
    };
  }, []);

  const handleTemplateChipClick = useCallback(
    (templateText: string) => {
      if (!canEdit) {
        return;
      }

      const textarea = notesTextareaRef.current;
      const fallbackStart = Math.min(selectionRef.current.start, values.notes.length);
      const fallbackEnd = Math.min(selectionRef.current.end, values.notes.length);
      const start = textarea ? textarea.selectionStart : fallbackStart;
      const end = textarea ? textarea.selectionEnd : fallbackEnd;
      const safeStart = Math.max(0, Math.min(start ?? fallbackStart, values.notes.length));
      const safeEnd = Math.max(0, Math.min(end ?? fallbackEnd, values.notes.length));
      const selectionStart = Math.min(safeStart, safeEnd);
      const selectionEnd = Math.max(safeStart, safeEnd);
      const { nextValue, nextCaret } = insertTemplateAtSelection(
        values.notes,
        templateText,
        selectionStart,
        selectionEnd,
      );

      onPatch({ notes: nextValue });
      selectionRef.current = { start: nextCaret, end: nextCaret };

      requestAnimationFrame(() => {
        const nextTextarea = notesTextareaRef.current;
        if (!nextTextarea) {
          return;
        }

        nextTextarea.focus();
        nextTextarea.setSelectionRange(nextCaret, nextCaret);
      });
    },
    [canEdit, onPatch, values.notes],
  );

  return (
    <section className="flex h-full flex-col rounded-2xl border border-zinc-800 bg-zinc-900/80">
      <header className="border-b border-zinc-800 px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">Metadata</h3>
        <p className="text-xs text-zinc-500">Core document fields for draft context.</p>
      </header>

      <div className="grid gap-3 p-4">
        <label className="grid gap-1">
          <span className="text-xs text-zinc-500">Document title</span>
          <input
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
            value={values.documentTitle}
            disabled={!canEdit}
            onChange={(event) => onPatch({ documentTitle: event.target.value })}
            placeholder="Quotation"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs text-zinc-500">Document #</span>
          <input
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-white"
            value={values.documentNumber}
            disabled={!canEdit}
            onChange={(event) => onPatch({ documentNumber: event.target.value })}
            placeholder="Q-00001"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs text-zinc-500">Customer</span>
          <input
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
            value={values.customerName}
            disabled={!canEdit}
            onChange={(event) => onPatch({ customerName: event.target.value })}
            placeholder="Customer name"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs text-zinc-500">Project</span>
          <input
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
            value={values.projectName}
            disabled={!canEdit}
            onChange={(event) => onPatch({ projectName: event.target.value })}
            placeholder="Project name"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs text-zinc-500">Notes</span>
          <TemplateChips
            chips={DEFAULT_TEMPLATE_CHIPS}
            disabled={!canEdit}
            onChipClick={(chip) => handleTemplateChipClick(chip.text)}
          />
          <textarea
            ref={notesTextareaRef}
            className="min-h-28 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
            value={values.notes}
            disabled={!canEdit}
            onChange={(event) => {
              onPatch({ notes: event.target.value });
              selectionRef.current = {
                start: event.target.selectionStart ?? event.target.value.length,
                end: event.target.selectionEnd ?? event.target.value.length,
              };
            }}
            onSelect={updateSelectionRef}
            onKeyUp={updateSelectionRef}
            onClick={updateSelectionRef}
            placeholder="Internal notes for draft context"
          />
        </label>
      </div>
    </section>
  );
}
