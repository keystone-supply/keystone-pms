import type { Remnant, OutlinePoint } from "@/lib/utils";
import { parseRemnantDims, rectOutline } from "@/lib/utils";
import { svgPathToNestShape } from "@/lib/svgPathToOutline";

/** Sheet entry accepted by NestNow HTTP API (rectangle or polygon). */
export type NestApiSheetPayload =
  | { width: number; height: number; quantity?: number }
  | { outline: OutlinePoint[]; holes?: OutlinePoint[][]; quantity?: number };

/**
 * True if the sheet is axis-aligned rectangle via width/height only.
 */
export function isRectNestSheet(s: NestApiSheetPayload): s is {
  width: number;
  height: number;
  quantity?: number;
} {
  return "width" in s && "height" in s;
}

/**
 * Build NestNow sheet payload from a remnant.
 * If `svg_path` is set (e.g. from sheet_stock), parses to a polygon sheet; otherwise uses
 * rectangular `{ width, height }` from `length_in`×`width_in` or `dims` (never invent a fake outline).
 */
export function remnantToNestSheet(r: Remnant): NestApiSheetPayload {
  const fromSvgShape = r.svg_path ? svgPathToNestShape(r.svg_path) : null;
  if (fromSvgShape?.outline?.length) {
    return {
      outline: fromSvgShape.outline,
      ...(fromSvgShape.holes.length ? { holes: fromSvgShape.holes } : {}),
      quantity: 1,
    };
  }

  if (r.length_in && r.width_in) {
    return { width: r.length_in, height: r.width_in, quantity: 1 };
  }

  const parsed = parseRemnantDims(r.dims);
  const w = parsed.width;
  const h = parsed.height;
  if (w > 0 && h > 0) {
    return { width: w, height: h, quantity: 1 };
  }

  return { width: 1, height: 1, quantity: 1 };
}

/**
 * Optional sheet outline in Nest coordinates for preview (closed polygon, y-up).
 * Rect sheets return a 4-point CCW loop matching `rectOutline(w,h)`.
 */
export function nestSheetPayloadToPreviewOutline(
  s: NestApiSheetPayload,
): OutlinePoint[] {
  if (!isRectNestSheet(s)) {
    return s.outline.length >= 3 ? s.outline : rectOutline(1, 1);
  }
  return rectOutline(s.width, s.height);
}

/** Axis-aligned size of the sheet in Nest units (for aspect ratio / y-flip baseline). */
export function nestSheetPreviewDimensions(s: NestApiSheetPayload): {
  width: number;
  height: number;
} {
  if (isRectNestSheet(s)) {
    return {
      width: Math.max(1e-6, s.width),
      height: Math.max(1e-6, s.height),
    };
  }
  const o = s.outline;
  if (o.length < 3) return { width: 1, height: 1 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of o) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  if (maxX <= minX || maxY <= minY) return { width: 1, height: 1 };
  return { width: maxX - minX, height: maxY - minY };
}
