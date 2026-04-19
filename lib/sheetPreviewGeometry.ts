import { svgPathToNestShape } from "@/lib/svgPathToOutline";
import {
  parseRemnantDims,
  rectOutline,
  type OutlinePoint,
  type Remnant,
} from "@/lib/utils";

export type PreviewSource = Pick<Remnant, "svg_path" | "length_in" | "width_in" | "dims">;

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type SheetPreviewSvgResult =
  | { ok: true; svg: string }
  | { ok: false; reason: "invalid_geometry" };

function isFinitePoint(point: OutlinePoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function cleanRing(ring: OutlinePoint[]): OutlinePoint[] {
  return ring.filter(isFinitePoint);
}

export function getSheetPreviewRings(source: PreviewSource): OutlinePoint[][] {
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

export function getSheetPreviewBounds(rings: OutlinePoint[][]): Bounds | null {
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

function toSvgPathData(ring: OutlinePoint[]): string {
  if (ring.length < 3) return "";
  const [first, ...rest] = ring;
  const segments = [`M ${first.x} ${first.y}`];
  for (const point of rest) {
    segments.push(`L ${point.x} ${point.y}`);
  }
  segments.push("Z");
  return segments.join(" ");
}

export function buildSheetPreviewSvgMarkup(source: PreviewSource): SheetPreviewSvgResult {
  const rings = getSheetPreviewRings(source);
  const bounds = getSheetPreviewBounds(rings);
  if (!bounds) {
    return { ok: false, reason: "invalid_geometry" };
  }

  const pathData = rings
    .map((ring) => toSvgPathData(ring))
    .filter((value) => value.length > 0)
    .join(" ");
  if (!pathData) {
    return { ok: false, reason: "invalid_geometry" };
  }

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const padX = Math.max(width * 0.06, 0.5);
  const padY = Math.max(height * 0.06, 0.5);
  const viewBox = [
    bounds.minX - padX,
    bounds.minY - padY,
    width + padX * 2,
    height + padY * 2,
  ].join(" ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none"><path d="${pathData}" fill="rgba(161,161,170,0.14)" stroke="rgba(161,161,170,0.85)" stroke-width="2" fill-rule="evenodd" /></svg>`;
  return { ok: true, svg };
}
