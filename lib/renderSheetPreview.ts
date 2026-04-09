import { supabase } from "@/lib/supabaseClient";
import { svgPathToNestShape } from "@/lib/svgPathToOutline";
import {
  parseRemnantDims,
  rectOutline,
  type OutlinePoint,
  type Remnant,
} from "@/lib/utils";

const SHEET_PREVIEW_BUCKET = "sheet-previews";
const PREVIEW_WIDTH_PX = 320;
const PREVIEW_HEIGHT_PX = 200;
const PREVIEW_PADDING_PX = 16;

type PreviewSource = Pick<Remnant, "svg_path" | "length_in" | "width_in" | "dims">;

function isFinitePoint(point: OutlinePoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function cleanRing(ring: OutlinePoint[]): OutlinePoint[] {
  return ring.filter(isFinitePoint);
}

function getPreviewRings(source: PreviewSource): OutlinePoint[][] {
  const svgPath = typeof source.svg_path === "string" ? source.svg_path.trim() : "";
  if (svgPath) {
    const parsed = svgPathToNestShape(svgPath);
    if (parsed?.outline?.length) {
      return [parsed.outline, ...(parsed.holes ?? [])]
        .map((ring) => cleanRing(ring))
        .filter((ring) => ring.length >= 3);
    }
  }

  const length = Number(source.length_in);
  const width = Number(source.width_in);
  if (Number.isFinite(length) && Number.isFinite(width) && length > 0 && width > 0) {
    return [rectOutline(length, width)];
  }

  const parsedDims = parseRemnantDims(source.dims, { width: 96, height: 48 });
  return [rectOutline(parsedDims.width, parsedDims.height)];
}

function ringBounds(rings: OutlinePoint[][]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} | null {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const ring of rings) {
    for (const point of ring) {
      if (!isFinitePoint(point)) continue;
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
  }

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxY)
  ) {
    return null;
  }

  if (maxX <= minX || maxY <= minY) return null;
  return { minX, maxX, minY, maxY };
}

function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

export async function renderAndUploadSheetPreviewImage(
  rowId: string,
  source: PreviewSource,
): Promise<string | null> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  const rings = getPreviewRings(source);
  const bounds = ringBounds(rings);
  if (!bounds) return null;

  const canvas = document.createElement("canvas");
  canvas.width = PREVIEW_WIDTH_PX;
  canvas.height = PREVIEW_HEIGHT_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

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
  if (!blob) return null;

  const objectPath = `${rowId}.png`;
  const { error: uploadError } = await supabase.storage
    .from(SHEET_PREVIEW_BUCKET)
    .upload(objectPath, blob, {
      upsert: true,
      contentType: "image/png",
      cacheControl: "3600",
    });
  if (uploadError) return null;

  const { data } = supabase.storage
    .from(SHEET_PREVIEW_BUCKET)
    .getPublicUrl(objectPath);
  return data?.publicUrl ?? null;
}
