"use client";

import { Bold, Highlighter, ImagePlus, Italic, List, NotebookPen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type RichTextToolbarProps = {
  canBold: boolean;
  canItalic: boolean;
  canHighlight: boolean;
  canClearHighlight: boolean;
  canBulletList: boolean;
  canClearColor: boolean;
  canInsertImage?: boolean;
  isBold: boolean;
  isItalic: boolean;
  isHighlight: boolean;
  isBulletList: boolean;
  colorOptions: string[];
  highlightOptions: string[];
  activeColor: string | null;
  activeHighlightColor: string | null;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onToggleHighlight: () => void;
  onToggleBulletList: () => void;
  onSetColor: (color: string) => void;
  onClearColor: () => void;
  onSetHighlightColor: (color: string) => void;
  onClearHighlight: () => void;
  onInsertImage?: () => void;
  snippetsOpen?: boolean;
  onToggleSnippets?: () => void;
};

type ToggleControlProps = {
  active: boolean;
  disabled: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
};

function ToggleControl({ active, disabled, title, onClick, children }: ToggleControlProps) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className="h-8"
    >
      {children}
    </Button>
  );
}

export function RichTextToolbar({
  canBold,
  canItalic,
  canHighlight,
  canClearHighlight,
  canBulletList,
  canClearColor,
  canInsertImage = false,
  isBold,
  isItalic,
  isHighlight,
  isBulletList,
  colorOptions,
  highlightOptions,
  activeColor,
  activeHighlightColor,
  onToggleBold,
  onToggleItalic,
  onToggleHighlight,
  onToggleBulletList,
  onSetColor,
  onClearColor,
  onSetHighlightColor,
  onClearHighlight,
  onInsertImage,
  snippetsOpen = false,
  onToggleSnippets,
}: RichTextToolbarProps) {
  const normalizedActiveColor = activeColor?.toLowerCase() ?? null;
  const normalizedActiveHighlightColor = activeHighlightColor?.toLowerCase() ?? null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-950/60 p-2">
      <ToggleControl active={isBold} disabled={!canBold} title="Bold" onClick={onToggleBold}>
        <Bold />
      </ToggleControl>
      <ToggleControl active={isItalic} disabled={!canItalic} title="Italic" onClick={onToggleItalic}>
        <Italic />
      </ToggleControl>
      <ToggleControl
        active={isHighlight}
        disabled={!canHighlight}
        title="Highlight"
        onClick={onToggleHighlight}
      >
        <Highlighter />
      </ToggleControl>
      <ToggleControl
        active={isBulletList}
        disabled={!canBulletList}
        title="Bullet list"
        onClick={onToggleBulletList}
      >
        <List />
      </ToggleControl>

      <div className="mx-1 h-6 w-px bg-zinc-800" />

      <div className="flex items-center gap-1">
        {colorOptions.map((color) => {
          const isActive = normalizedActiveColor === color.toLowerCase();
          return (
            <Button
              key={color}
              type="button"
              size="icon-xs"
              variant={isActive ? "secondary" : "outline"}
              className={cn("h-7 w-7 rounded-full p-0", isActive ? "ring-2 ring-zinc-500" : "")}
              onClick={() => onSetColor(color)}
              title={`Text color ${color}`}
              aria-label={`Text color ${color}`}
            >
              <span className="h-3.5 w-3.5 rounded-full border border-zinc-600" style={{ backgroundColor: color }} />
            </Button>
          );
        })}
      </div>

      <input
        type="color"
        aria-label="Custom text color"
        className="h-8 w-8 cursor-pointer rounded border border-zinc-700 bg-zinc-900 p-1"
        value={normalizedActiveColor ?? "#111827"}
        onChange={(event) => onSetColor(event.target.value)}
      />

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onClearColor}
        disabled={!canClearColor}
        className="h-8"
      >
        Clear color
      </Button>

      <div className="mx-1 h-6 w-px bg-zinc-800" />

      <div className="flex items-center gap-1">
        {highlightOptions.map((color) => {
          const isActive = normalizedActiveHighlightColor === color.toLowerCase();
          return (
            <Button
              key={color}
              type="button"
              size="icon-xs"
              variant={isActive ? "secondary" : "outline"}
              className={cn("h-7 w-7 rounded-full p-0", isActive ? "ring-2 ring-zinc-500" : "")}
              onClick={() => onSetHighlightColor(color)}
              title={`Highlight ${color}`}
              aria-label={`Highlight ${color}`}
            >
              <span
                className="h-3.5 w-3.5 rounded-full border border-zinc-600"
                style={{ backgroundColor: color }}
              />
            </Button>
          );
        })}
      </div>

      <input
        type="color"
        aria-label="Custom highlight color"
        className="h-8 w-8 cursor-pointer rounded border border-zinc-700 bg-zinc-900 p-1"
        value={normalizedActiveHighlightColor ?? "#fff59d"}
        onChange={(event) => onSetHighlightColor(event.target.value)}
      />

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onClearHighlight}
        disabled={!canClearHighlight}
        className="h-8"
      >
        Clear highlight
      </Button>

      <Button
        type="button"
        size="sm"
        variant={snippetsOpen ? "secondary" : "outline"}
        onClick={() => onToggleSnippets?.()}
        disabled={!onToggleSnippets}
        className="h-8"
      >
        <NotebookPen className="mr-1.5 size-4" />
        Snippets
      </Button>

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onInsertImage?.()}
        disabled={!canInsertImage || !onInsertImage}
        className="h-8"
      >
        <ImagePlus className="mr-1.5 size-4" />
        Insert reference pic
      </Button>
    </div>
  );
}
