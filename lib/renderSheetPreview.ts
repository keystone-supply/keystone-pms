import { supabase } from "@/lib/supabaseClient";
import {
  getSheetPreviewBounds,
  getSheetPreviewRings,
  type PreviewSource,
} from "@/lib/sheetPreviewGeometry";

const SHEET_PREVIEW_BUCKET = "sheet-previews";
const PREVIEW_WIDTH_PX = 320;
const PREVIEW_HEIGHT_PX = 200;
const PREVIEW_PADDING_PX = 16;

export type SheetPreviewUploadFailureReason =
  | "missing_dom"
  | "invalid_geometry"
  | "canvas_context_unavailable"
  | "blob_generation_failed"
  | "storage_upload_failed"
  | "public_url_missing";

export type SheetPreviewUploadResult =
  | { ok: true; publicUrl: string }
  | { ok: false; reason: SheetPreviewUploadFailureReason; details?: string };

function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

export async function renderAndUploadSheetPreviewImage(
  rowId: string,
  source: PreviewSource,
): Promise<string | null> {
  const result = await renderAndUploadSheetPreviewImageDetailed(rowId, source);
  return result.ok ? result.publicUrl : null;
}

export async function renderAndUploadSheetPreviewImageDetailed(
  rowId: string,
  source: PreviewSource,
): Promise<SheetPreviewUploadResult> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { ok: false, reason: "missing_dom" };
  }

  const rings = getSheetPreviewRings(source);
  const bounds = getSheetPreviewBounds(rings);
  if (!bounds) return { ok: false, reason: "invalid_geometry" };

  const canvas = document.createElement("canvas");
  canvas.width = PREVIEW_WIDTH_PX;
  canvas.height = PREVIEW_HEIGHT_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { ok: false, reason: "canvas_context_unavailable" };

  const shapeWidth = bounds.maxX - bounds.minX;
  const shapeHeight = bounds.maxY - bounds.minY;
  const drawWidth = Math.max(1, PREVIEW_WIDTH_PX - PREVIEW_PADDING_PX * 2);
  const drawHeight = Math.max(1, PREVIEW_HEIGHT_PX - PREVIEW_PADDING_PX * 2);
  const scale = Math.min(drawWidth / shapeWidth, drawHeight / shapeHeight);
  const renderWidth = shapeWidth * scale;
  const renderHeight = shapeHeight * scale;
  const x0 = (PREVIEW_WIDTH_PX - renderWidth) / 2;
  const y0 = (PREVIEW_HEIGHT_PX - renderHeight) / 2;

  const mapX = (x: number) => x0 + (x - bounds.minX) * scale;
  const mapY = (y: number) => y0 + (bounds.maxY - y) * scale;

  ctx.clearRect(0, 0, PREVIEW_WIDTH_PX, PREVIEW_HEIGHT_PX);
  ctx.beginPath();

  for (const ring of rings) {
    if (ring.length < 3) continue;
    ctx.moveTo(mapX(ring[0].x), mapY(ring[0].y));
    for (let i = 1; i < ring.length; i += 1) {
      ctx.lineTo(mapX(ring[i].x), mapY(ring[i].y));
    }
    ctx.closePath();
  }

  ctx.fillStyle = "rgba(161, 161, 170, 0.14)";
  ctx.strokeStyle = "rgba(161, 161, 170, 0.85)";
  ctx.lineWidth = 2;
  ctx.fill("evenodd");
  ctx.stroke();

  const blob = await toPngBlob(canvas);
  if (!blob) return { ok: false, reason: "blob_generation_failed" };

  const objectPath = `${rowId}.png`;
  const { error: uploadError } = await supabase.storage
    .from(SHEET_PREVIEW_BUCKET)
    .upload(objectPath, blob, {
      upsert: true,
      contentType: "image/png",
      cacheControl: "3600",
    });
  if (uploadError) {
    return {
      ok: false,
      reason: "storage_upload_failed",
      details: uploadError.message,
    };
  }

  const { data } = supabase.storage
    .from(SHEET_PREVIEW_BUCKET)
    .getPublicUrl(objectPath);
  if (!data?.publicUrl) {
    return { ok: false, reason: "public_url_missing" };
  }

  return { ok: true, publicUrl: data.publicUrl };
}
