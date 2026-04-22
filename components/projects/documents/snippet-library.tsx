"use client";

import { useMemo, useState } from "react";

import type { TiptapJSON } from "@/lib/documentTypes";
import { toPlainTextFromRich } from "@/lib/documents/richTextSerializer";
import { useSnippetLibrary } from "@/hooks/useSnippetLibrary";

type SnippetLibraryProps = {
  open: boolean;
  snippetProjectId?: string | null;
  currentContent: TiptapJSON | null;
  onApplySnippet: (content: TiptapJSON) => void;
};

export function SnippetLibrary({
  open,
  snippetProjectId = null,
  currentContent,
  onApplySnippet,
}: SnippetLibraryProps) {
  const [snippetQuery, setSnippetQuery] = useState("");
  const [newSnippetTitle, setNewSnippetTitle] = useState("");
  const [newSnippetFolder, setNewSnippetFolder] = useState("");
  const [newSnippetTags, setNewSnippetTags] = useState("");
  const [editingSnippetId, setEditingSnippetId] = useState<string | null>(null);
  const [scopeMode, setScopeMode] = useState<"global" | "project">("project");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [folderFilter, setFolderFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  const {
    createSnippet,
    duplicateSnippetToScope,
    removeSnippet,
    searchSnippets,
    foldersForScope,
    togglePinned,
    updateSnippet,
  } = useSnippetLibrary();

  const hasProjectScope = Boolean(snippetProjectId);
  const effectiveScope: "global" | "project" =
    scopeMode === "project" && snippetProjectId ? "project" : "global";
  const effectiveFolderFilter = foldersForScope(effectiveScope, snippetProjectId).includes(folderFilter)
    ? folderFilter
    : "";
  const filteredSnippets = useMemo(
    () =>
      searchSnippets(snippetQuery, {
        scope: effectiveScope,
        projectId: snippetProjectId,
        favoritesOnly,
        folder: effectiveFolderFilter || null,
        tag: tagFilter || null,
      }),
    [
      effectiveFolderFilter,
      effectiveScope,
      favoritesOnly,
      searchSnippets,
      snippetProjectId,
      snippetQuery,
      tagFilter,
    ],
  );
  const folders = useMemo(
    () => foldersForScope(effectiveScope, snippetProjectId),
    [effectiveScope, foldersForScope, snippetProjectId],
  );

  const saveCurrentAsSnippet = () => {
    if (!currentContent) return;
    const tags = newSnippetTags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (editingSnippetId) {
      updateSnippet(editingSnippetId, {
        title: newSnippetTitle.trim(),
        folder: newSnippetFolder || null,
        tags,
        scope: effectiveScope,
        projectId: effectiveScope === "project" ? snippetProjectId : null,
      });
      setEditingSnippetId(null);
      setNewSnippetTitle("");
      setNewSnippetFolder("");
      setNewSnippetTags("");
      return;
    }
    const fallbackTitle = toPlainTextFromRich(currentContent).trim().slice(0, 48) || "Untitled snippet";
    const title = newSnippetTitle.trim() || fallbackTitle;
    createSnippet({
      title,
      content: currentContent,
      scope: effectiveScope,
      projectId: snippetProjectId,
      folder: newSnippetFolder || null,
      tags,
    });
    setNewSnippetTitle("");
    setNewSnippetFolder("");
    setNewSnippetTags("");
  };

  if (!open) return null;

  return (
    <div className="space-y-2 border-b border-zinc-800 bg-zinc-950/70 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`rounded-md border px-2 py-1 text-[11px] ${
            effectiveScope === "project"
              ? "border-blue-500 bg-blue-900/30 text-blue-200"
              : "border-zinc-700 bg-zinc-900 text-zinc-200"
          }`}
          disabled={!hasProjectScope}
          onClick={() => {
            if (!hasProjectScope) return;
            setScopeMode("project");
            setFolderFilter("");
            setTagFilter("");
          }}
        >
          Project scope
        </button>
        <button
          type="button"
          className={`rounded-md border px-2 py-1 text-[11px] ${
            effectiveScope === "global"
              ? "border-blue-500 bg-blue-900/30 text-blue-200"
              : "border-zinc-700 bg-zinc-900 text-zinc-200"
          }`}
          onClick={() => {
            setScopeMode("global");
            setFolderFilter("");
            setTagFilter("");
          }}
        >
          Global scope
        </button>
        <label className="flex items-center gap-1 text-[11px] text-zinc-300">
          <input
            type="checkbox"
            className="size-3.5 rounded border-zinc-600 bg-zinc-900"
            checked={favoritesOnly}
            onChange={(event) => setFavoritesOnly(event.target.checked)}
          />
          Favorites only
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={snippetQuery}
          onChange={(event) => setSnippetQuery(event.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
          placeholder="Search snippets"
        />
        <input
          value={tagFilter}
          onChange={(event) => setTagFilter(event.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
          placeholder="Filter by tag"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          value={effectiveFolderFilter}
          onChange={(event) => setFolderFilter(event.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
        >
          <option value="">All folders</option>
          {folders.map((folder) => (
            <option key={folder} value={folder}>
              {folder}
            </option>
          ))}
        </select>
        <input
          value={newSnippetTitle}
          onChange={(event) => setNewSnippetTitle(event.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
          placeholder="New snippet title (optional)"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr,1fr,auto]">
        <input
          value={newSnippetFolder}
          onChange={(event) => setNewSnippetFolder(event.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
          placeholder="Folder (optional)"
        />
        <input
          value={newSnippetTags}
          onChange={(event) => setNewSnippetTags(event.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
          placeholder="Tags (comma separated)"
        />
        <button
          type="button"
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 hover:bg-zinc-800"
          onClick={saveCurrentAsSnippet}
          disabled={!currentContent}
        >
          {editingSnippetId ? "Save metadata" : "Save current"}
        </button>
      </div>
      {editingSnippetId ? (
        <div className="flex justify-end">
          <button
            type="button"
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-800"
            onClick={() => {
              setEditingSnippetId(null);
              setNewSnippetTitle("");
              setNewSnippetFolder("");
              setNewSnippetTags("");
            }}
          >
            Cancel metadata edit
          </button>
        </div>
      ) : null}
      <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950/60 p-2">
        {filteredSnippets.length === 0 ? (
          <p className="text-xs text-zinc-500">No snippets found.</p>
        ) : (
          filteredSnippets.map((snippet) => (
            <div key={snippet.id} className="rounded border border-zinc-800 bg-zinc-900/70 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-medium text-zinc-100">
                  {snippet.title}
                  {snippet.pinned ? " ★" : ""}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-200 hover:bg-zinc-800"
                    onClick={() => togglePinned(snippet.id)}
                  >
                    {snippet.pinned ? "Unpin" : "Pin"}
                  </button>
                  {snippet.scope === "project" ? (
                    <button
                      type="button"
                      className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-200 hover:bg-zinc-800"
                      onClick={() => duplicateSnippetToScope(snippet.id, "global")}
                    >
                      Copy to global
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
                      disabled={!snippetProjectId}
                      onClick={() => duplicateSnippetToScope(snippet.id, "project", snippetProjectId)}
                    >
                      Copy to project
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-200 hover:bg-zinc-800"
                    onClick={() => onApplySnippet(snippet.content)}
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-200 hover:bg-zinc-800"
                    onClick={() => {
                      setEditingSnippetId(snippet.id);
                      setNewSnippetTitle(snippet.title);
                      setNewSnippetFolder(snippet.folder ?? "");
                      setNewSnippetTags(snippet.tags.join(", "));
                      setScopeMode(
                        snippet.scope === "project" && hasProjectScope ? "project" : "global",
                      );
                      setFolderFilter("");
                      setTagFilter("");
                    }}
                  >
                    Edit meta
                  </button>
                  <button
                    type="button"
                    className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-200 hover:bg-zinc-800"
                    onClick={() => {
                      if (!currentContent) return;
                      updateSnippet(snippet.id, { content: currentContent });
                    }}
                    disabled={!currentContent}
                  >
                    Update
                  </button>
                  <button
                    type="button"
                    className="rounded border border-red-700 px-2 py-0.5 text-[11px] text-red-300 hover:bg-red-950/40"
                    onClick={() => removeSnippet(snippet.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">
                {(snippet.scope === "project" ? "Project" : "Global") +
                  (snippet.folder ? ` • ${snippet.folder}` : "")}
              </p>
              {snippet.tags.length > 0 ? (
                <p className="mt-1 text-[11px] text-zinc-500">#{snippet.tags.join(" #")}</p>
              ) : null}
              <p className="mt-1 truncate text-[11px] text-zinc-400">
                {toPlainTextFromRich(snippet.content) || "No preview text"}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
