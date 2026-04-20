"use client";

import { useEffect, useMemo, useState } from "react";
import { FileUp, RefreshCw, ExternalLink, FileWarning } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { parseDxfToShapes } from "@/lib/parseDxf";
import type { ProjectFileRow, ProjectFolderSlot } from "@/lib/projectFiles";
import { useProjectWorkspaceOptional } from "@/lib/projectWorkspaceContext";
import { buildPdfPageNumbers } from "@/lib/files/pdfPreview";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const SLOT_LABEL: Record<ProjectFolderSlot, string> = {
  cad: "CAD",
  vendors: "Vendors",
  pics: "Pics",
  docs: "Docs",
  gcode: "G-Code",
  root: "Root",
  other: "Other",
};

const SLOT_ORDER: ProjectFolderSlot[] = [
  "cad",
  "vendors",
  "pics",
  "docs",
  "gcode",
  "root",
  "other",
];

const OFFICE_EXTENSIONS = [
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
];
const MIRROR_STATUSES: ProjectFileRow["mirror_status"][] = [
  "not_mirrored",
  "mirroring",
  "synced",
  "stale",
  "error",
];

type PreviewPayload = {
  url: string;
  mimeType: string | null;
  mirrorStatus: string;
};

function isMirrorStatus(value: string): value is ProjectFileRow["mirror_status"] {
  return MIRROR_STATUSES.includes(value as ProjectFileRow["mirror_status"]);
}

function readableBytes(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function isOfficeLike(file: ProjectFileRow): boolean {
  const lower = file.name.toLowerCase();
  return (
    file.mime_type?.includes("officedocument") === true ||
    OFFICE_EXTENSIONS.some((ext) => lower.endsWith(ext))
  );
}

function buildDxfPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  let d = `M ${points[0].x} ${-points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    d += ` L ${points[i].x} ${-points[i].y}`;
  }
  return `${d} Z`;
}

export function ProjectFilesPanel({
  projectId,
}: {
  projectId: string;
}) {
  const workspace = useProjectWorkspaceOptional();
  const [files, setFiles] = useState<ProjectFileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFileIdLocal, setSelectedFileIdLocal] = useState<string | null>(null);
  const selectedFileId = workspace?.selectedFileId ?? selectedFileIdLocal;
  const setSelectedFileId = workspace?.selectFile ?? setSelectedFileIdLocal;
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  const selected = useMemo(
    () => files.find((file) => file.id === selectedFileId) ?? null,
    [files, selectedFileId],
  );

  const grouped = useMemo(() => {
    const map = new Map<ProjectFolderSlot, ProjectFileRow[]>();
    for (const slot of SLOT_ORDER) map.set(slot, []);
    for (const file of files) {
      const bucket = map.get(file.folder_slot) ?? [];
      bucket.push(file);
      map.set(file.folder_slot, bucket);
    }
    return map;
  }, [files]);

  async function loadFiles() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/files`, {
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as {
      enabled?: boolean;
      files?: ProjectFileRow[];
      error?: string;
    };
    if (!res.ok) {
      setError(body.error ?? "Could not load files.");
      setFiles([]);
      setLoading(false);
      return;
    }
    if (!body.enabled) {
      setError("Files panel is disabled for this project.");
      setFiles([]);
      setLoading(false);
      return;
    }
    setFiles(body.files ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!workspace) return;
    if (workspace.filesSyncVersion < 1) return;
    void refreshFromOneDrive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.filesSyncVersion]);

  async function refreshFromOneDrive() {
    setRefreshing(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/files/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full: false }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Sync failed.");
      setRefreshing(false);
      return;
    }
    await loadFiles();
    setRefreshing(false);
  }

  async function openPreview(file: ProjectFileRow) {
    setSelectedFileId(file.id);
    setPreview(null);
    setPdfPageCount(null);
    setPreviewError(null);
    if (isOfficeLike(file)) return;
    if (file.name.toLowerCase().endsWith(".dxf")) return;
    setPreviewBusy(true);
    const res = await fetch(`/api/projects/${projectId}/files/${file.id}/preview`, {
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as {
      url?: string;
      mimeType?: string | null;
      mirrorStatus?: string;
      error?: string;
      webUrl?: string;
    };
    if (!res.ok) {
      setPreviewError(body.error ?? "Preview failed.");
      setPreviewBusy(false);
      return;
    }
    if (!body.url) {
      setPreviewError("No preview URL was returned.");
      setPreviewBusy(false);
      return;
    }
    setPreview({
      url: body.url,
      mimeType: body.mimeType ?? null,
      mirrorStatus: body.mirrorStatus ?? "unknown",
    });
    if (body.mirrorStatus && isMirrorStatus(body.mirrorStatus)) {
      const nextMirrorStatus = body.mirrorStatus;
      setFiles((current) =>
        current.map((row) =>
          row.id === file.id ? { ...row, mirror_status: nextMirrorStatus } : row,
        ),
      );
    }
    setPreviewBusy(false);
  }

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || !selected) return;
    setUploadBusy(true);
    setError(null);
    for (const file of Array.from(fileList)) {
      const form = new FormData();
      form.append("file", file);
      form.append("folderSlot", selected.folder_slot);
      const res = await fetch(`/api/projects/${projectId}/files/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Upload failed for ${file.name}.`);
        break;
      }
    }
    setUploadBusy(false);
    await loadFiles();
  }

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Project files</h2>
          <p className="mt-1 text-sm text-zinc-500">
            OneDrive folder mirror with inline previews.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={refreshing}
            onClick={() => void refreshFromOneDrive()}
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh from OneDrive
          </Button>
          <label className="inline-flex cursor-pointer items-center">
            <input
              type="file"
              multiple
              className="sr-only"
              onChange={(event) => void uploadFiles(event.target.files)}
            />
            <span className="inline-flex h-8 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700">
              <FileUp className="size-4" />
              {uploadBusy ? "Uploading..." : "Upload files"}
            </span>
          </label>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-3">
          {loading ? (
            <p className="px-2 py-3 text-sm text-zinc-500">Loading files...</p>
          ) : (
            <div className="space-y-4">
              {SLOT_ORDER.map((slot) => {
                const rows = grouped.get(slot) ?? [];
                if (rows.length === 0) return null;
                return (
                  <details key={slot} className="rounded-lg border border-zinc-800">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-zinc-200">
                      {SLOT_LABEL[slot]} ({rows.length})
                    </summary>
                    <div className="space-y-1 px-2 pb-2">
                      {rows.map((file) => (
                        <button
                          key={file.id}
                          type="button"
                          onClick={() => void openPreview(file)}
                          className={`w-full rounded-md px-2 py-2 text-left text-sm transition ${
                            selected?.id === file.id
                              ? "bg-blue-600/20 text-blue-200"
                              : workspace?.highlightedFileName === file.name
                                ? "bg-emerald-600/20 text-emerald-200"
                              : "text-zinc-300 hover:bg-zinc-800/80"
                          }`}
                        >
                          <div className="truncate">{file.name}</div>
                          <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                            <span>{readableBytes(file.size_bytes)}</span>
                            <Badge variant="outline">{file.mirror_status}</Badge>
                          </div>
                        </button>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </div>

        <div
          className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-4"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void uploadFiles(event.dataTransfer.files);
          }}
        >
          {!selected ? (
            <div className="flex h-full min-h-[360px] items-center justify-center text-zinc-500">
              Select a file to preview.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-medium text-white">{selected.name}</h3>
                  <p className="text-xs text-zinc-500">{selected.mime_type ?? "Unknown MIME"}</p>
                </div>
                <div className="flex gap-2">
                  {workspace ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        workspace.focus("calc", {
                          seedFileId: selected.id,
                          seedTapeName: selected.name,
                        })
                      }
                    >
                      Start calc referencing this file
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={async () => {
                      const res = await fetch(
                        `/api/projects/${projectId}/files/${selected.id}/open`,
                      );
                      const body = (await res.json().catch(() => ({}))) as {
                        webUrl?: string;
                      };
                      if (body.webUrl) window.open(body.webUrl, "_blank", "noopener,noreferrer");
                    }}
                  >
                    <ExternalLink className="size-4" />
                    Open in OneDrive
                  </Button>
                </div>
              </div>

              {previewBusy ? (
                <p className="text-sm text-zinc-400">Loading preview...</p>
              ) : previewError ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {previewError}
                </div>
              ) : isOfficeLike(selected) ? (
                <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-zinc-800 text-zinc-400">
                  Office files open in OneDrive.
                </div>
              ) : selected.name.toLowerCase().endsWith(".dxf") ? (
                <DxfPreview file={selected} />
              ) : preview?.mimeType?.startsWith("image/") ? (
                <Image
                  src={preview.url}
                  alt={selected.name}
                  width={1280}
                  height={720}
                  className="max-h-[640px] w-full rounded-xl border border-zinc-800 object-contain"
                />
              ) : preview?.mimeType === "application/pdf" ? (
                <div className="overflow-auto rounded-xl border border-zinc-800 bg-zinc-900/50 p-2">
                  <Document
                    file={preview.url}
                    onLoadSuccess={({ numPages }) => {
                      setPdfPageCount(numPages);
                    }}
                    onLoadError={(error) => {
                      setPreviewError(error.message);
                    }}
                  >
                    <div className="space-y-3">
                      {buildPdfPageNumbers(pdfPageCount).map((pageNumber) => (
                        <Page key={pageNumber} pageNumber={pageNumber} width={900} />
                      ))}
                    </div>
                  </Document>
                </div>
              ) : preview?.url ? (
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  Download file preview
                </a>
              ) : (
                <div className="flex min-h-[320px] items-center justify-center text-zinc-500">
                  No preview available.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function DxfPreview({ file }: { file: ProjectFileRow }) {
  const [svgPaths, setSvgPaths] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      const previewRes = await fetch(`/api/projects/${file.project_id}/files/${file.id}/preview`, {
        cache: "no-store",
      });
      const previewBody = (await previewRes.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!previewRes.ok || !previewBody.url) {
        if (!cancelled) {
          setError(previewBody.error ?? "Could not load DXF source.");
          setLoading(false);
        }
        return;
      }
      const source = await fetch(previewBody.url);
      const text = await source.text();
      const shapes = parseDxfToShapes(text, file.name);
      const nextPaths: string[] = [];
      for (const shape of shapes) {
        if (shape.kind !== "polygon") continue;
        nextPaths.push(buildDxfPath(shape.outline));
        for (const hole of shape.holes ?? []) {
          nextPaths.push(buildDxfPath(hole));
        }
      }
      if (!cancelled) {
        setSvgPaths(nextPaths);
        setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [file.id, file.name, file.project_id]);

  if (loading) return <p className="text-sm text-zinc-400">Rendering DXF...</p>;
  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
        <FileWarning className="mr-2 inline size-4" />
        {error}
      </div>
    );
  }
  if (svgPaths.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 px-3 py-2 text-sm text-zinc-400">
        No polygon outlines found in DXF.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-2">
      <svg
        viewBox="-10 -200 400 400"
        className="h-[540px] w-full rounded-lg bg-zinc-950"
        fillRule="evenodd"
      >
        {svgPaths.map((path, index) => (
          <path
            key={`${path}-${index}`}
            d={path}
            fill="rgba(59,130,246,0.16)"
            stroke="rgba(147,197,253,0.9)"
            strokeWidth={1.2}
          />
        ))}
      </svg>
    </div>
  );
}
