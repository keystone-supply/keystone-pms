import type { ProjectDocumentKind } from "@/lib/documentTypes";

export type ProjectWorkspaceLayoutState = {
  file: string | null;
  kind: ProjectDocumentKind | null;
};

const VALID_DOC_KINDS = new Set<ProjectDocumentKind>([
  "rfq",
  "quote",
  "purchase_order",
  "packing_list",
  "bol",
  "invoice",
]);

function toKind(value: string | null): ProjectDocumentKind | null {
  if (!value) return null;
  return VALID_DOC_KINDS.has(value as ProjectDocumentKind)
    ? (value as ProjectDocumentKind)
    : null;
}

export function workspaceLayoutStorageKey(projectId: string): string {
  return `keystone-workspace-layout-v2:${projectId}`;
}

export function parseProjectWorkspaceLayout(
  searchParams: URLSearchParams,
): ProjectWorkspaceLayoutState {
  return {
    file: searchParams.get("file"),
    kind: toKind(searchParams.get("kind") ?? (searchParams.get("tab") === "docs" ? "quote" : null)),
  };
}

export function writeProjectWorkspaceLayoutToSearch(
  searchParams: URLSearchParams,
  next: ProjectWorkspaceLayoutState,
): URLSearchParams {
  const out = new URLSearchParams(searchParams);
  out.delete("view");
  out.delete("tab");
  out.delete("left");
  out.delete("center");
  out.delete("right");
  if (next.file) out.set("file", next.file);
  else out.delete("file");
  if (next.kind) out.set("kind", next.kind);
  else out.delete("kind");
  return out;
}

export function mergeWorkspaceLayout(
  base: ProjectWorkspaceLayoutState,
  patch: Partial<ProjectWorkspaceLayoutState>,
): ProjectWorkspaceLayoutState {
  return { ...base, ...patch };
}

