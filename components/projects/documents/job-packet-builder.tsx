"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ProjectDocumentRow } from "@/lib/projectDocumentDb";
import type { ProjectFolderSlot } from "@/lib/projectFiles";

type ProjectFileListItem = {
  id: string;
  name: string;
  mime_type: string | null;
  is_folder: boolean;
  folder_slot: ProjectFolderSlot;
  size_bytes: number | null;
};

type ProjectFilesResponse = {
  enabled?: boolean;
  files?: ProjectFileListItem[];
  error?: string;
};

export type JobPacketSelectedFile = {
  id: string;
  name: string;
};

type JobPacketBuilderProps = {
  projectId: string;
  rows: ProjectDocumentRow[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onBuild: (selectedDocumentIds: string[], selectedFiles: JobPacketSelectedFile[]) => Promise<void>;
};

function isPdfLike(file: ProjectFileListItem): boolean {
  if (file.is_folder) return false;
  if (file.mime_type?.toLowerCase().includes("pdf")) return true;
  return file.name.toLowerCase().endsWith(".pdf");
}

function readableBytes(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function JobPacketBuilder({
  projectId,
  rows,
  busy,
  error,
  onClose,
  onBuild,
}: JobPacketBuilderProps) {
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [fileLoadError, setFileLoadError] = useState<string | null>(null);
  const [availableFiles, setAvailableFiles] = useState<ProjectFileListItem[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>(() =>
    rows.map((row) => row.id),
  );
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadFiles = async () => {
      setLoadingFiles(true);
      setFileLoadError(null);
      const response = await fetch(`/api/projects/${projectId}/files`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as ProjectFilesResponse;
      if (!response.ok) {
        if (!cancelled) {
          setFileLoadError(body.error ?? "Could not load project files.");
          setAvailableFiles([]);
          setLoadingFiles(false);
        }
        return;
      }
      if (!body.enabled) {
        if (!cancelled) {
          setAvailableFiles([]);
          setLoadingFiles(false);
        }
        return;
      }
      if (!cancelled) {
        setAvailableFiles(body.files ?? []);
        setLoadingFiles(false);
      }
    };
    void loadFiles();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const selectableFiles = useMemo(
    () => availableFiles.filter((file) => isPdfLike(file)),
    [availableFiles],
  );

  const selectedFiles = useMemo(() => {
    const byId = new Map(selectableFiles.map((file) => [file.id, file]));
    return selectedFileIds
      .map((id) => byId.get(id))
      .filter((file): file is ProjectFileListItem => Boolean(file))
      .map((file) => ({ id: file.id, name: file.name }));
  }, [selectableFiles, selectedFileIds]);

  const toggleDocument = (rowId: string, checked: boolean) => {
    setSelectedDocumentIds((prev) =>
      checked ? [...prev, rowId] : prev.filter((id) => id !== rowId),
    );
  };

  const toggleFile = (fileId: string, checked: boolean) => {
    setSelectedFileIds((prev) =>
      checked ? [...prev, fileId] : prev.filter((id) => id !== fileId),
    );
  };

  const disableBuild = busy || selectedDocumentIds.length + selectedFiles.length === 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">Build Job Packet</h3>
        <p className="mt-2 text-sm text-zinc-400">
          Select generated documents and mirrored PDF files to merge into one download.
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
            <p className="text-xs font-medium uppercase text-zinc-500">Documents</p>
            <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
              {rows.length === 0 ? (
                <p className="text-sm text-zinc-500">No project documents available.</p>
              ) : (
                rows.map((row) => (
                  <label
                    key={row.id}
                    className="flex items-start gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-200"
                  >
                    <input
                      type="checkbox"
                      checked={selectedDocumentIds.includes(row.id)}
                      onChange={(event) => toggleDocument(row.id, event.target.checked)}
                      className="mt-0.5 size-4 rounded border-zinc-600"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-zinc-100">{row.kind}</span>
                      <span className="block truncate text-xs text-zinc-500">
                        {row.number ?? "Unnumbered"} · REV {row.current_revision_index}
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
            <p className="text-xs font-medium uppercase text-zinc-500">Project Files (PDF)</p>
            <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
              {loadingFiles ? (
                <p className="text-sm text-zinc-500">Loading files…</p>
              ) : fileLoadError ? (
                <p className="text-sm text-red-400">{fileLoadError}</p>
              ) : selectableFiles.length === 0 ? (
                <p className="text-sm text-zinc-500">No mirrored PDF files found.</p>
              ) : (
                selectableFiles.map((file) => (
                  <label
                    key={file.id}
                    className="flex items-start gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-200"
                  >
                    <input
                      type="checkbox"
                      checked={selectedFileIds.includes(file.id)}
                      onChange={(event) => toggleFile(file.id, event.target.checked)}
                      className="mt-0.5 size-4 rounded border-zinc-600"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-zinc-100">{file.name}</span>
                      <span className="block text-xs text-zinc-500">
                        {file.folder_slot.toUpperCase()} · {readableBytes(file.size_bytes)}
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </section>
        </div>

        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={disableBuild}
            onClick={() => void onBuild(selectedDocumentIds, selectedFiles)}
          >
            {busy ? "Building…" : "Build Packet"}
          </Button>
        </div>
      </div>
    </div>
  );
}
