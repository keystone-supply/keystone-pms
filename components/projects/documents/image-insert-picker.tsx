"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { DocumentLineItem } from "@/lib/documentTypes";
import type { ProjectFileRow } from "@/lib/projectFiles";

type ProjectFilesResponse = {
  enabled?: boolean;
  files?: ProjectFileRow[];
  error?: string;
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_DIMENSION_PX = 2000;

function isImageFile(file: ProjectFileRow): boolean {
  if (file.is_folder) return false;
  const mime = (file.mime_type ?? "").toLowerCase();
  const lowerName = file.name.toLowerCase();
  return (
    mime.startsWith("image/") ||
    [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"].some((ext) =>
      lowerName.endsWith(ext),
    )
  );
}

function readableBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function fetchPreviewUrl(
  projectId: string,
  fileId: string,
): Promise<string | null> {
  const response = await fetch(`/api/projects/${projectId}/files/${fileId}/preview`, {
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as { url?: string };
  if (!response.ok || !body.url) return null;
  return body.url;
}

async function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Could not read image dimensions."));
    image.src = url;
  });
}

type ImageInsertPickerProps = {
  open: boolean;
  projectId: string;
  disabled?: boolean;
  initialImageRef?: DocumentLineItem["imageRef"] | null;
  onApply: (nextImageRef: DocumentLineItem["imageRef"] | null) => void;
  onClose: () => void;
};

export function ImageInsertPicker({
  open,
  projectId,
  disabled = false,
  initialImageRef = null,
  onApply,
  onClose,
}: ImageInsertPickerProps) {
  const [draftFileId, setDraftFileId] = useState("");
  const [draftStorageKey, setDraftStorageKey] = useState("");
  const [imageFilter, setImageFilter] = useState("");
  const [availableImages, setAvailableImages] = useState<ProjectFileRow[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftFileId(initialImageRef?.fileId ?? "");
    setDraftStorageKey(initialImageRef?.storageKey ?? "");
    setImageFilter("");
    setPickerError(null);
  }, [initialImageRef?.fileId, initialImageRef?.storageKey, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPickerLoading(true);
    setPickerError(null);
    void (async () => {
      const response = await fetch(`/api/projects/${projectId}/files`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as ProjectFilesResponse;
      if (cancelled) return;
      if (!response.ok) {
        setPickerError(body.error ?? "Could not load project files.");
        setAvailableImages([]);
        setPickerLoading(false);
        return;
      }
      if (!body.enabled) {
        setPickerError("Project files are disabled for this project.");
        setAvailableImages([]);
        setPickerLoading(false);
        return;
      }
      setAvailableImages((body.files ?? []).filter(isImageFile));
      setPickerLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  const filteredImages = useMemo(() => {
    if (!imageFilter.trim()) return availableImages;
    const query = imageFilter.trim().toLowerCase();
    return availableImages.filter((file) => file.name.toLowerCase().includes(query));
  }, [availableImages, imageFilter]);

  const selectedFile = useMemo(
    () => availableImages.find((file) => file.id === draftFileId) ?? null,
    [availableImages, draftFileId],
  );

  useEffect(() => {
    if (!open || !draftFileId) {
      setSelectedPreviewUrl(null);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setSelectedPreviewUrl(null);
    void (async () => {
      const nextUrl = await fetchPreviewUrl(projectId, draftFileId);
      if (cancelled) return;
      setSelectedPreviewUrl(nextUrl);
      setPreviewLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [draftFileId, open, projectId]);

  const applyImageRef = async () => {
    const fileId = draftFileId.trim();
    if (!fileId) {
      setPickerError("Choose an image first.");
      return;
    }
    const selected = availableImages.find((row) => row.id === fileId) ?? null;
    if (!selected) {
      setPickerError("Selected image was not found in project files.");
      return;
    }
    if (selected.size_bytes != null && selected.size_bytes > MAX_IMAGE_BYTES) {
      setPickerError(
        `Selected image is ${readableBytes(selected.size_bytes)}. Max allowed is ${readableBytes(MAX_IMAGE_BYTES)}.`,
      );
      return;
    }
    setSaveBusy(true);
    setPickerError(null);
    try {
      const previewUrl = selectedPreviewUrl ?? (await fetchPreviewUrl(projectId, fileId));
      if (!previewUrl) {
        throw new Error("Could not load image preview.");
      }
      const dims = await getImageDimensions(previewUrl);
      if (dims.width > MAX_IMAGE_DIMENSION_PX || dims.height > MAX_IMAGE_DIMENSION_PX) {
        throw new Error(
          `Image is ${dims.width}x${dims.height}px. Max allowed is ${MAX_IMAGE_DIMENSION_PX}px on either side.`,
        );
      }
      const storageKey = draftStorageKey.trim();
      onApply({
        fileId,
        ...(storageKey ? { storageKey } : {}),
      });
      onClose();
    } catch (error: unknown) {
      setPickerError(
        error instanceof Error ? error.message : "Image validation failed before insert.",
      );
    } finally {
      setSaveBusy(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="space-y-2 rounded-md border border-zinc-700 bg-zinc-900/60 p-3">
      <p className="text-xs text-zinc-400">
        Select an image from project files (max {readableBytes(MAX_IMAGE_BYTES)} and{" "}
        {MAX_IMAGE_DIMENSION_PX}px max dimension).
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100"
          value={draftFileId}
          onChange={(event) => setDraftFileId(event.target.value)}
          placeholder="fileId"
          disabled={disabled || saveBusy}
        />
        <input
          className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100"
          value={draftStorageKey}
          onChange={(event) => setDraftStorageKey(event.target.value)}
          placeholder="storageKey"
          disabled={disabled || saveBusy}
        />
        <input
          className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100"
          value={imageFilter}
          onChange={(event) => setImageFilter(event.target.value)}
          placeholder="Filter images by name"
          disabled={disabled || saveBusy}
        />
      </div>
      <div className="max-h-44 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950/60 p-2">
        {pickerLoading ? (
          <p className="text-xs text-zinc-500">Loading image files...</p>
        ) : pickerError ? (
          <p className="text-xs text-red-300">{pickerError}</p>
        ) : filteredImages.length === 0 ? (
          <p className="text-xs text-zinc-500">No image files found.</p>
        ) : (
          <div className="space-y-1">
            {filteredImages.map((file) => (
              <button
                key={file.id}
                type="button"
                className={`w-full rounded border px-2 py-1.5 text-left text-xs hover:bg-zinc-900 ${
                  draftFileId === file.id
                    ? "border-blue-500 bg-blue-950/20 text-blue-100"
                    : "border-zinc-800 text-zinc-200 hover:border-zinc-600"
                }`}
                onClick={() => {
                  setDraftFileId(file.id);
                  setDraftStorageKey(file.storage_object_key ?? "");
                }}
                disabled={disabled || saveBusy}
              >
                <div className="truncate font-medium">{file.name}</div>
                <div className="truncate text-[11px] text-zinc-500">
                  {file.size_bytes != null ? readableBytes(file.size_bytes) : "Size unknown"} • {file.id}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {selectedFile ? (
        <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-2">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-zinc-400">Selected preview</p>
          {previewLoading ? (
            <p className="text-xs text-zinc-500">Loading thumbnail…</p>
          ) : selectedPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selectedPreviewUrl}
              alt={selectedFile.name}
              className="h-24 w-24 rounded border border-zinc-700 object-cover"
            />
          ) : (
            <p className="text-xs text-zinc-500">Preview unavailable for this file.</p>
          )}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled || saveBusy || !draftFileId.trim()}
          onClick={() => void applyImageRef()}
        >
          {saveBusy ? "Validating..." : "Save reference image"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || saveBusy}
          onClick={() => {
            onApply(null);
            onClose();
          }}
        >
          Clear
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={saveBusy} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
