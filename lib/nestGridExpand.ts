import type { OutlinePoint, PartShape } from "@/lib/utils";
import { placeOutline } from "@/lib/utils";
import type { NestApiSheetPayload } from "@/lib/remnantNestGeometry";
import { isRectNestSheet } from "@/lib/remnantNestGeometry";

export type SheetPlacement = {
  filename?: string;
  id?: number;
  rotation?: number;
  source?: number;
  x?: number;
  y?: number;
};

export type NestGridResultShape = {
  fitness: number;
  area: number;
  totalarea: number;
  mergedLength: number;
  utilisation: number;
  placements: {
    sheet: number;
    sheetid: unknown;
    sheetplacements: SheetPlacement[];
  }[];
};

export type NestGridMetadata = {
  strategy: "grid";
  sheetKind: "rect" | "polygon";
  pitchX: number;
  pitchY: number;
  moduleWidth: number;
  moduleHeight: number;
  stampsPlaced: number;
  gridCapacity: number;
  maxDemand: number;
};

function polygonAreaAbs(ring: OutlinePoint[]): number {
  if (ring.length < 3) return 0;
  let s = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s += ring[i].x * ring[j].y - ring[j].x * ring[i].y;
  }
  return Math.abs(s) / 2;
}

function boundsOfPlacedParts(
  modulePlacements: SheetPlacement[],
  parts: PartShape[],
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  for (const pl of modulePlacements) {
    if (typeof pl.source !== "number") continue;
    const part = parts[pl.source];
    if (!part?.outline?.length) continue;
    const rot = pl.rotation ?? 0;
    const px = pl.x ?? 0;
    const py = pl.y ?? 0;
    const pts = placeOutline(part.outline, rot, px, py);
    for (const p of pts) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      any = true;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!any || maxX <= minX || maxY <= minY) return null;
  return { minX, minY, maxX, maxY };
}

function normalizePlacements(
  placements: SheetPlacement[],
  deltaX: number,
  deltaY: number,
): SheetPlacement[] {
  return placements.map((pl) => ({
    ...pl,
    x: (pl.x ?? 0) - deltaX,
    y: (pl.y ?? 0) - deltaY,
  }));
}

function pointInPolygon(x: number, y: number, ring: OutlinePoint[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i].x;
    const yi = ring[i].y;
    const xj = ring[j].x;
    const yj = ring[j].y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-30) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function ringContainsPlacedParts(
  ring: OutlinePoint[],
  modulePlacements: SheetPlacement[],
  parts: PartShape[],
  ox: number,
  oy: number,
): boolean {
  for (const pl of modulePlacements) {
    if (typeof pl.source !== "number") continue;
    const part = parts[pl.source];
    if (!part?.outline?.length) continue;
    const rot = pl.rotation ?? 0;
    const px = (pl.x ?? 0) + ox;
    const py = (pl.y ?? 0) + oy;
    const pts = placeOutline(part.outline, rot, px, py);
    for (const p of pts) {
      if (!pointInPolygon(p.x, p.y, ring)) return false;
    }
  }
  return true;
}

function sheetPolygonBBox(ring: OutlinePoint[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (maxX <= minX || maxY <= minY) return null;
  return { minX, minY, maxX, maxY };
}

function collectGridOriginsRect(
  sheetW: number,
  sheetH: number,
  moduleW: number,
  moduleH: number,
  pitchX: number,
  pitchY: number,
): { ox: number; oy: number }[] {
  const out: { ox: number; oy: number }[] = [];
  const eps = 1e-9;
  if (pitchX <= 0 || pitchY <= 0) return out;
  for (let oy = 0; oy + moduleH <= sheetH + eps; oy += pitchY) {
    for (let ox = 0; ox + moduleW <= sheetW + eps; ox += pitchX) {
      out.push({ ox, oy });
    }
  }
  return out;
}

function collectGridOriginsPolygon(
  sheetRing: OutlinePoint[],
  moduleW: number,
  moduleH: number,
  pitchX: number,
  pitchY: number,
  modulePlacementsNorm: SheetPlacement[],
  parts: PartShape[],
): { ox: number; oy: number }[] {
  const bbox = sheetPolygonBBox(sheetRing);
  if (!bbox) return [];
  const out: { ox: number; oy: number }[] = [];
  const eps = 1e-9;
  if (pitchX <= 0 || pitchY <= 0) return out;
  const startX = bbox.minX;
  const startY = bbox.minY;
  const endX = bbox.maxX - moduleW;
  const endY = bbox.maxY - moduleH;
  for (let oy = startY; oy <= endY + eps; oy += pitchY) {
    for (let ox = startX; ox <= endX + eps; ox += pitchX) {
      if (
        ringContainsPlacedParts(
          sheetRing,
          modulePlacementsNorm,
          parts,
          ox,
          oy,
        )
      ) {
        out.push({ ox, oy });
      }
    }
  }
  return out;
}

function maxDemand(parts: PartShape[]): number {
  let m = 0;
  for (const p of parts) {
    m = Math.max(m, Math.max(1, Math.floor(Number(p.quantity)) || 1));
  }
  return m;
}

/**
 * Expand a single-sheet module nest into repeated stamps on the sheet.
 */
export function expandModuleToGrid(args: {
  moduleResult: NestGridResultShape;
  /** Original parts with real quantities (module nest used qty 1 each). */
  parts: PartShape[];
  sheet: NestApiSheetPayload;
  spacing: number;
  sheetKind: "rect" | "polygon";
}): { result: NestGridResultShape; meta: NestGridMetadata } | { error: string } {
  const { moduleResult, parts, sheet, spacing, sheetKind } = args;
  const first = moduleResult.placements?.[0];
  if (!first?.sheetplacements?.length) {
    return { error: "Module nest has no placements" };
  }
  const modPl = first.sheetplacements;

  const bb = boundsOfPlacedParts(modPl, parts);
  if (!bb) {
    return { error: "Could not compute module bounds" };
  }

  const norm = normalizePlacements(modPl, bb.minX, bb.minY);
  const moduleW = bb.maxX - bb.minX;
  const moduleH = bb.maxY - bb.minY;
  if (moduleW <= 0 || moduleH <= 0) {
    return { error: "Invalid module size" };
  }

  const pitchX = moduleW + Math.max(0, spacing);
  const pitchY = moduleH + Math.max(0, spacing);

  let sheetW = 0;
  let sheetH = 0;
  let sheetRing: OutlinePoint[] | null = null;

  if (sheetKind === "rect" && isRectNestSheet(sheet)) {
    sheetW = sheet.width;
    sheetH = sheet.height;
  } else if (!isRectNestSheet(sheet) && sheet.outline.length >= 3) {
    sheetRing = sheet.outline;
    const sb = sheetPolygonBBox(sheet.outline);
    if (!sb) return { error: "Invalid sheet polygon" };
    sheetW = sb.maxX - sb.minX;
    sheetH = sb.maxY - sb.minY;
  } else {
    return { error: "Sheet geometry mismatch for grid expansion" };
  }

  const demand = maxDemand(parts);
  let origins: { ox: number; oy: number }[];

  if (sheetKind === "rect") {
    origins = collectGridOriginsRect(
      sheetW,
      sheetH,
      moduleW,
      moduleH,
      pitchX,
      pitchY,
    );
  } else if (sheetRing) {
    origins = collectGridOriginsPolygon(
      sheetRing,
      moduleW,
      moduleH,
      pitchX,
      pitchY,
      norm,
      parts,
    );
  } else {
    return { error: "Polygon sheet required for grid_polygon" };
  }

  const capacity = origins.length;
  if (capacity === 0) {
    return { error: "Module does not fit on sheet" };
  }

  const stampsPlaced = Math.min(capacity, demand);
  const sheetplacements: SheetPlacement[] = [];
  let nextId = 0;

  for (let t = 0; t < stampsPlaced; t++) {
    const { ox, oy } = origins[t];
    for (const pl of norm) {
      if (typeof pl.source !== "number") continue;
      const need = Math.max(1, Math.floor(Number(parts[pl.source]?.quantity)) || 1);
      if (t >= need) continue;
      sheetplacements.push({
        ...pl,
        x: (pl.x ?? 0) + ox,
        y: (pl.y ?? 0) + oy,
        id: nextId++,
      });
    }
  }

  const sheetArea =
    sheetKind === "rect" && isRectNestSheet(sheet)
      ? sheet.width * sheet.height
      : sheetRing
        ? polygonAreaAbs(sheetRing)
        : sheetW * sheetH;

  let placedArea = 0;
  for (const pl of sheetplacements) {
    if (typeof pl.source !== "number") continue;
    const part = parts[pl.source];
    if (!part?.outline?.length) continue;
    placedArea += polygonAreaAbs(part.outline);
  }

  const utilisation =
    sheetArea > 0 ? Math.min(100, (placedArea / sheetArea) * 100) : 0;

  const result: NestGridResultShape = {
    fitness: -utilisation,
    area: placedArea,
    totalarea: sheetArea,
    mergedLength: moduleResult.mergedLength ?? 0,
    utilisation,
    placements: [
      {
        sheet: 0,
        sheetid: first.sheetid ?? 0,
        sheetplacements,
      },
    ],
  };

  const meta: NestGridMetadata = {
    strategy: "grid",
    sheetKind,
    pitchX,
    pitchY,
    moduleWidth: moduleW,
    moduleHeight: moduleH,
    stampsPlaced,
    gridCapacity: capacity,
    maxDemand: demand,
  };

  return { result, meta };
}
