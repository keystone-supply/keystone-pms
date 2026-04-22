"use client";

import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type OptionGroupHeaderProps = {
  title: string;
  subtotal: number;
  collapsed: boolean;
  canEdit?: boolean;
  onToggleCollapsed: () => void;
  onTitleChange: (nextTitle: string) => void;
  onRemove: () => void;
};

export function OptionGroupHeader({
  title,
  subtotal,
  collapsed,
  canEdit = true,
  onToggleCollapsed,
  onTitleChange,
  onRemove,
}: OptionGroupHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-950/70 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={onToggleCollapsed}>
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
        </Button>
        <input
          value={title}
          disabled={!canEdit}
          onChange={(event) => onTitleChange(event.target.value)}
          className="min-w-0 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
          placeholder="Option title"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-400">Subtotal: ${subtotal.toFixed(2)}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canEdit}
          className="h-7 px-2 text-red-300 hover:text-red-200"
          onClick={onRemove}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
