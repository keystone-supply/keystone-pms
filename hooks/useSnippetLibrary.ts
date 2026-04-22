"use client";

import { useEffect, useState } from "react";

import type { TiptapJSON } from "@/lib/documentTypes";
import {
  createSnippetInList,
  duplicateSnippetToScopeInList,
  foldersForScopeFromList,
  loadSnippetsFromStorage,
  removeSnippetFromList,
  saveSnippetsToStorage,
  searchSnippetsInList,
  toggleSnippetPinnedInList,
  type SavedSnippet,
  type SnippetScope,
  updateSnippetInList,
} from "@/lib/documents/snippets";

export function useSnippetLibrary() {
  const [snippets, setSnippets] = useState<SavedSnippet[]>(() => loadSnippetsFromStorage());

  useEffect(() => {
    saveSnippetsToStorage(snippets);
  }, [snippets]);

  const createSnippet = (args: {
    title: string;
    content: TiptapJSON;
    scope: SnippetScope;
    projectId?: string | null;
    folder?: string | null;
    tags?: string[];
    pinned?: boolean;
  }) => {
    setSnippets((prev) => createSnippetInList(prev, args));
  };

  const updateSnippet = (
    id: string,
    patch: Partial<
      Pick<SavedSnippet, "title" | "content" | "scope" | "projectId" | "folder" | "tags" | "pinned">
    >,
  ) => {
    setSnippets((prev) => updateSnippetInList(prev, id, patch));
  };

  const removeSnippet = (id: string) => {
    setSnippets((prev) => removeSnippetFromList(prev, id));
  };

  const duplicateSnippetToScope = (
    id: string,
    targetScope: SnippetScope,
    targetProjectId?: string | null,
  ) => {
    setSnippets((prev) => duplicateSnippetToScopeInList(prev, id, targetScope, targetProjectId));
  };

  const togglePinned = (id: string) => {
    setSnippets((prev) => toggleSnippetPinnedInList(prev, id));
  };

  const searchSnippets = (
    query: string,
    options?: {
      scope?: SnippetScope;
      projectId?: string | null;
      favoritesOnly?: boolean;
      folder?: string | null;
      tag?: string | null;
    },
  ): SavedSnippet[] => {
    return searchSnippetsInList(snippets, query, options);
  };

  const foldersForScope = (scope: SnippetScope, projectId?: string | null): string[] => {
    return foldersForScopeFromList(snippets, scope, projectId);
  };

  const snippetCount = snippets.length;
  const hasSnippets = snippetCount > 0;

  return {
    snippets,
    snippetCount,
    hasSnippets,
    createSnippet,
    updateSnippet,
    removeSnippet,
    duplicateSnippetToScope,
    togglePinned,
    searchSnippets,
    foldersForScope,
  };
}
