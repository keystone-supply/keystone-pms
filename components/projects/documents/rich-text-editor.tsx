"use client";

import { useEffect, useState } from "react";
import BulletList from "@tiptap/extension-bullet-list";
import type { JSONContent } from "@tiptap/core";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import ListItem from "@tiptap/extension-list-item";
import { TextStyle } from "@tiptap/extension-text-style";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";

import { SnippetLibrary } from "@/components/projects/documents/snippet-library";
import { RichTextToolbar } from "@/components/projects/documents/rich-text-toolbar";
import type { TiptapJSON } from "@/lib/documentTypes";
import { cn } from "@/lib/utils";

export type RichTextEditorValue = TiptapJSON;

export type RichTextEditorProps = {
  value: RichTextEditorValue | null | undefined;
  onChange: (value: RichTextEditorValue) => void;
  onInsertImageRequest?: () => void;
  snippetProjectId?: string | null;
  className?: string;
  colorPresets?: string[];
};

const FALLBACK_DOC: RichTextEditorValue = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

const DEFAULT_COLOR_PRESETS = ["#111827", "#b91c1c", "#b45309", "#047857", "#1d4ed8", "#7c3aed"];
const DEFAULT_HIGHLIGHT_PRESETS = ["#fff59d", "#fde68a", "#fecaca", "#bfdbfe", "#bbf7d0", "#ddd6fe"];

function normalizeEditorValue(value: RichTextEditorValue | null | undefined): RichTextEditorValue {
  if (
    value &&
    typeof value === "object" &&
    typeof value.type === "string" &&
    value.type === "doc" &&
    Array.isArray(value.content)
  ) {
    return value;
  }
  return FALLBACK_DOC;
}

function docsMatch(a: RichTextEditorValue, b: RichTextEditorValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function RichTextEditor({
  value,
  onChange,
  onInsertImageRequest,
  snippetProjectId = null,
  className,
  colorPresets,
}: RichTextEditorProps) {
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        bulletList: false,
        listItem: false,
      }),
      TextStyle,
      Color.configure({ types: [TextStyle.name] }),
      Highlight.configure({ multicolor: true }),
      BulletList,
      ListItem,
    ],
    content: normalizeEditorValue(value),
    editorProps: {
      attributes: {
        class:
          "min-h-[180px] w-full bg-zinc-950 px-4 py-3 text-sm text-white focus:outline-none [&_p]:my-1 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6",
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      onChange(nextEditor.getJSON() as RichTextEditorValue);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const nextValue = normalizeEditorValue(value);
    const currentValue = editor.getJSON() as RichTextEditorValue;
    if (!docsMatch(currentValue, nextValue)) {
      editor.commands.setContent(nextValue, { emitUpdate: false });
    }
  }, [editor, value]);

  const swatches = colorPresets?.length ? colorPresets : DEFAULT_COLOR_PRESETS;
  const highlightSwatches = DEFAULT_HIGHLIGHT_PRESETS;

  return (
    <div className={cn("overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950", className)}>
      <RichTextToolbar
        canBold={editor?.can().chain().focus().toggleBold().run() ?? false}
        canItalic={editor?.can().chain().focus().toggleItalic().run() ?? false}
        canHighlight={editor?.can().chain().focus().toggleHighlight().run() ?? false}
        canClearHighlight={editor?.can().chain().focus().unsetHighlight().run() ?? false}
        canBulletList={editor?.can().chain().focus().toggleBulletList().run() ?? false}
        canClearColor={editor?.can().chain().focus().unsetColor().run() ?? false}
        isBold={editor?.isActive("bold") ?? false}
        isItalic={editor?.isActive("italic") ?? false}
        isHighlight={editor?.isActive("highlight") ?? false}
        isBulletList={editor?.isActive("bulletList") ?? false}
        colorOptions={swatches}
        highlightOptions={highlightSwatches}
        activeColor={(editor?.getAttributes("textStyle").color as string | undefined) ?? null}
        activeHighlightColor={(editor?.getAttributes("highlight").color as string | undefined) ?? null}
        onToggleBold={() => {
          editor?.chain().focus().toggleBold().run();
        }}
        onToggleItalic={() => {
          editor?.chain().focus().toggleItalic().run();
        }}
        onToggleHighlight={() => {
          editor?.chain().focus().toggleHighlight().run();
        }}
        onToggleBulletList={() => {
          editor?.chain().focus().toggleBulletList().run();
        }}
        onSetColor={(color) => {
          editor?.chain().focus().setColor(color).run();
        }}
        onClearColor={() => {
          editor?.chain().focus().unsetColor().run();
        }}
        onSetHighlightColor={(color) => {
          editor?.chain().focus().setHighlight({ color }).run();
        }}
        onClearHighlight={() => {
          editor?.chain().focus().unsetHighlight().run();
        }}
        canInsertImage={Boolean(onInsertImageRequest)}
        onInsertImage={() => onInsertImageRequest?.()}
        snippetsOpen={snippetsOpen}
        onToggleSnippets={() => setSnippetsOpen((prev) => !prev)}
      />
      <SnippetLibrary
        open={snippetsOpen}
        snippetProjectId={snippetProjectId}
        currentContent={editor ? (editor.getJSON() as TiptapJSON) : null}
        onApplySnippet={(content) => {
          if (!editor) return;
          editor.chain().focus().insertContent(content as JSONContent).run();
        }}
      />
      <EditorContent editor={editor} />
    </div>
  );
}
