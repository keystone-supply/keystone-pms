import type { TiptapJSON } from "@/lib/documentTypes";
import { toPlainTextFromRich } from "@/lib/documents/richTextSerializer";

export type SnippetScope = "global" | "project";

export type SavedSnippet = {
  id: string;
  title: string;
  content: TiptapJSON;
  scope: SnippetScope;
  projectId: string | null;
  folder: string | null;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export const SNIPPETS_STORAGE_KEY = "keystone:doc-snippets:v1";
export const MAX_SNIPPETS = 200;

function nowIso(): string {
  return new Date().toISOString();
}

export function createSnippetId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `snippet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeFolder(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    deduped.add(trimmed.toLowerCase());
  }
  return Array.from(deduped);
}

export function sortSnippets(rows: SavedSnippet[]): SavedSnippet[] {
  return [...rows].sort((a, b) =>
    a.pinned === b.pinned ? b.updatedAt.localeCompare(a.updatedAt) : a.pinned ? -1 : 1,
  );
}

function normalizeSnippet(raw: unknown): SavedSnippet | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<SavedSnippet>;
  if (!value.content || typeof value.content !== "object") return null;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (!title) return null;
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : nowIso();
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : createdAt;
  const id = typeof value.id === "string" && value.id.trim() ? value.id : createSnippetId();
  const scope: SnippetScope = value.scope === "project" ? "project" : "global";
  const projectId =
    scope === "project" && typeof value.projectId === "string" && value.projectId.trim()
      ? value.projectId.trim()
      : null;
  return {
    id,
    title,
    content: value.content as TiptapJSON,
    scope,
    projectId,
    folder: normalizeFolder(value.folder),
    tags: normalizeTags(value.tags),
    pinned: Boolean(value.pinned),
    createdAt,
    updatedAt,
  };
}

export function loadSnippetsFromStorage(): SavedSnippet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SNIPPETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return sortSnippets(
      parsed
        .map(normalizeSnippet)
        .filter((snippet): snippet is SavedSnippet => Boolean(snippet)),
    ).slice(0, MAX_SNIPPETS);
  } catch {
    return [];
  }
}

export function saveSnippetsToStorage(snippets: SavedSnippet[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SNIPPETS_STORAGE_KEY, JSON.stringify(snippets));
}

export function createSnippetInList(
  prev: SavedSnippet[],
  args: {
    title: string;
    content: TiptapJSON;
    scope: SnippetScope;
    projectId?: string | null;
    folder?: string | null;
    tags?: string[];
    pinned?: boolean;
  },
): SavedSnippet[] {
  const { title, content, scope, projectId = null, folder = null, tags = [], pinned = false } = args;
  const normalizedTitle = title.trim();
  if (!normalizedTitle) return prev;
  const timestamp = nowIso();
  const next: SavedSnippet = {
    id: createSnippetId(),
    title: normalizedTitle,
    content,
    scope,
    projectId: scope === "project" ? projectId?.trim() || null : null,
    folder: normalizeFolder(folder),
    tags: normalizeTags(tags),
    pinned: Boolean(pinned),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return sortSnippets([next, ...prev]).slice(0, MAX_SNIPPETS);
}

export function updateSnippetInList(
  prev: SavedSnippet[],
  id: string,
  patch: Partial<Pick<SavedSnippet, "title" | "content" | "scope" | "projectId" | "folder" | "tags" | "pinned">>,
): SavedSnippet[] {
  return sortSnippets(
    prev.map((snippet) => {
      if (snippet.id !== id) return snippet;
      const nextTitle = patch.title === undefined ? snippet.title : patch.title.trim() || snippet.title;
      const nextScope: SnippetScope =
        patch.scope === "project" ? "project" : patch.scope === "global" ? "global" : snippet.scope;
      return {
        ...snippet,
        title: nextTitle,
        content: patch.content ?? snippet.content,
        scope: nextScope,
        projectId: nextScope === "project" ? patch.projectId?.trim() || snippet.projectId || null : null,
        folder: patch.folder === undefined ? snippet.folder : normalizeFolder(patch.folder),
        tags: patch.tags === undefined ? snippet.tags : normalizeTags(patch.tags),
        pinned: patch.pinned === undefined ? snippet.pinned : Boolean(patch.pinned),
        updatedAt: nowIso(),
      };
    }),
  );
}

export function removeSnippetFromList(prev: SavedSnippet[], id: string): SavedSnippet[] {
  return prev.filter((snippet) => snippet.id !== id);
}

export function duplicateSnippetToScopeInList(
  prev: SavedSnippet[],
  id: string,
  targetScope: SnippetScope,
  targetProjectId?: string | null,
): SavedSnippet[] {
  const source = prev.find((snippet) => snippet.id === id);
  if (!source) return prev;
  const timestamp = nowIso();
  const duplicate: SavedSnippet = {
    ...source,
    id: createSnippetId(),
    scope: targetScope,
    projectId: targetScope === "project" ? targetProjectId?.trim() || null : null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  if (targetScope === "project" && !duplicate.projectId) return prev;
  return sortSnippets([duplicate, ...prev]).slice(0, MAX_SNIPPETS);
}

export function toggleSnippetPinnedInList(prev: SavedSnippet[], id: string): SavedSnippet[] {
  return sortSnippets(
    prev.map((snippet) =>
      snippet.id === id ? { ...snippet, pinned: !snippet.pinned, updatedAt: nowIso() } : snippet,
    ),
  );
}

export function searchSnippetsInList(
  snippets: SavedSnippet[],
  query: string,
  options?: {
    scope?: SnippetScope;
    projectId?: string | null;
    favoritesOnly?: boolean;
    folder?: string | null;
    tag?: string | null;
  },
): SavedSnippet[] {
  const q = query.trim().toLowerCase();
  const scope = options?.scope ?? "global";
  const projectId = options?.projectId?.trim() || null;
  const favoritesOnly = Boolean(options?.favoritesOnly);
  const folder = options?.folder?.trim().toLowerCase() || "";
  const tag = options?.tag?.trim().toLowerCase() || "";
  return snippets.filter((snippet) => {
    if (scope === "global" && snippet.scope !== "global") return false;
    if (scope === "project" && (snippet.scope !== "project" || !projectId || snippet.projectId !== projectId)) {
      return false;
    }
    if (favoritesOnly && !snippet.pinned) return false;
    if (folder && (snippet.folder ?? "").toLowerCase() !== folder) return false;
    if (tag && !snippet.tags.includes(tag)) return false;
    const plain = toPlainTextFromRich(snippet.content).toLowerCase();
    if (!q) return true;
    return (
      snippet.title.toLowerCase().includes(q) ||
      plain.includes(q) ||
      (snippet.folder ?? "").toLowerCase().includes(q) ||
      snippet.tags.some((snippetTag) => snippetTag.includes(q))
    );
  });
}

export function foldersForScopeFromList(
  snippets: SavedSnippet[],
  scope: SnippetScope,
  projectId?: string | null,
): string[] {
  const filtered = searchSnippetsInList(snippets, "", { scope, projectId });
  const deduped = new Set<string>();
  for (const snippet of filtered) {
    if (!snippet.folder) continue;
    deduped.add(snippet.folder);
  }
  return Array.from(deduped).sort((a, b) => a.localeCompare(b));
}
