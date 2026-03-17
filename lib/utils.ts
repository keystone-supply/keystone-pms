import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface Remnant {
  id: string;
  // Optional backing Supabase sheet_stock row id and label
  db_id?: string;
  label?: string | null;
  img_url?: string;
  svg_path?: string; // e.g., "M10 10 L20 30 ... Z"
  dims?: string;
  // Normalised numeric dimensions for sheet/remnant rectangles (inches)
  length_in?: number;
  width_in?: number;
  material: string;
  thickness_in: number;
  est_weight_lbs: number;
  status: "Available" | "Allocated" | "Consumed" | "Scrap" | "Archived";
  notes?: string | null;
}

export type OutlinePoint = { x: number; y: number };

export type PartShapeKind = "rect" | "round" | "round_hole" | "polygon";

export interface PartShape {
  id: string;
  name: string;
  kind: PartShapeKind;
  outline: OutlinePoint[];
  quantity: number;
  canRotate: boolean;
  meta?: {
    source?: "ui" | "dxf";
    originalParams?: unknown;
  };
}

export interface PartDims {
  width: number;
  height: number;
}

const DENSITIES = {
  // lb/in³
  "A36 Steel": 0.283,
  "304 SS": 0.289,
  HiAce: 0.295,
  // ...
};

export function calcPolygonArea(points: number[][]): number {
  // Shoelace
  const n = points.length;
  return (
    Math.abs(
      points.reduce(
        (sum, [x, y], i) =>
          sum +
          (points[(i + 1) % n][0] * y - points[i][1] * points[(i + 1) % n][0]),
        0,
      ),
    ) / 2
  );
}

export function calcWeight(
  areaIn2: number,
  thicknessIn: number,
  material: string,
): number {
  const density = DENSITIES[material as keyof typeof DENSITIES] || 0.283;
  return +(areaIn2 * thicknessIn * density).toFixed(1);
}

/**
 * Parse remnant dims string (e.g. '96x48"', '120x60"') to width and height in numeric form.
 * Returns fallback { width: 96, height: 48 } if parsing fails.
 */
export function parseRemnantDims(
  dims: string | undefined,
  fallback = { width: 96, height: 48 },
): { width: number; height: number } {
  if (!dims || typeof dims !== "string") return fallback;
  const cleaned = dims.replace(/"/g, "").trim();
  const parts = cleaned.split(/x/i);
  if (parts.length !== 2) return fallback;
  const width = parseFloat(parts[0].trim());
  const height = parseFloat(parts[1].trim());
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return fallback;
  }
  return { width, height };
}

// Mock for demo: Random polygon SVG path
export function genMockSVG(width = 100, height = 50): string {
  const points = [
    [0, 0],
    [width, 0],
    [width * 0.8, height],
    [width * 0.2, height],
  ];
  return `M${points.map(([x, y]) => `${x},${y}`).join(" L")} Z`;
}

export function rectOutline(
  width: number,
  height: number,
): OutlinePoint[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return [];
  }
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

export function circleOutline(
  diameter: number,
  segments = 48,
): OutlinePoint[] {
  if (!Number.isFinite(diameter) || diameter <= 0 || !Number.isFinite(segments) || segments < 3) {
    return [];
  }
  const radius = diameter / 2;
  const pts: OutlinePoint[] = [];
  for (let i = 0; i < segments; i += 1) {
    const theta = (2 * Math.PI * i) / segments;
    pts.push({
      x: radius + radius * Math.cos(theta),
      y: radius + radius * Math.sin(theta),
    });
  }
  return pts;
}

export function ringOutline(
  od: number,
  id: number,
  segments = 48,
): { outer: OutlinePoint[]; inner: OutlinePoint[] } {
  const outer = circleOutline(od, segments);
  const inner = circleOutline(id, segments).slice().reverse();
  return { outer, inner };
}

function getOutlineBoundingBox(outline: OutlinePoint[]): PartDims | null {
  if (!outline?.length) return null;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const p of outline) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxY)
  ) {
    return null;
  }

  const width = maxX - minX;
  const height = maxY - minY;

  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

export function getPartDims(part: PartShape): PartDims | null {
  if (!part) return null;

  const source = part.meta?.source;

  if (part.kind === "rect" && source === "ui") {
    const params = part.meta?.originalParams as
      | { width_in?: number; height_in?: number }
      | undefined;
    const width = params?.width_in;
    const height = params?.height_in;
    if (
      typeof width === "number" &&
      typeof height === "number" &&
      width > 0 &&
      height > 0
    ) {
      return { width, height };
    }
  }

  if ((part.kind === "round" || part.kind === "round_hole") && source === "ui") {
    const params = part.meta?.originalParams as
      | { od_in?: number; id_in?: number }
      | undefined;
    const od = params?.od_in;
    if (typeof od === "number" && od > 0) {
      return { width: od, height: od };
    }
  }

  const bbox = getOutlineBoundingBox(part.outline ?? []);
  if (!bbox) return null;
  return bbox;
}

export function formatPartDims(
  dims: PartDims | null | undefined,
): string {
  if (!dims) return "—";
  const { width, height } = dims;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return "—";
  }
  const w = width.toFixed(2);
  const h = height.toFixed(2);
  return `${w}" x ${h}"`;
}

/**
 * Rotate outline by degrees CCW around origin (0,0). Same formula as NestNow.
 */
export function rotateOutline(
  outline: OutlinePoint[],
  degrees: number,
): OutlinePoint[] {
  if (!outline?.length) return [];
  const angle = (degrees * Math.PI) / 180;
  return outline.map((p) => ({
    x: p.x * Math.cos(angle) - p.y * Math.sin(angle),
    y: p.x * Math.sin(angle) + p.y * Math.cos(angle),
  }));
}

/**
 * Place outline: rotate by degrees then translate by (x, y). Matches NestNow placement.
 */
export function placeOutline(
  outline: OutlinePoint[],
  degrees: number,
  x: number,
  y: number,
): OutlinePoint[] {
  const rotated = rotateOutline(outline, degrees);
  return rotated.map((p) => ({ x: p.x + x, y: p.y + y }));
}
