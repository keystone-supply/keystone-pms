import { nestSheetPayloadToPreviewOutline, type NestApiSheetPayload } from "@/lib/remnantNestGeometry";
import { placeOutline, type OutlinePoint } from "@/lib/utils";

type PlacementLike = {
  source?: number;
  x?: number;
  y?: number;
  rotation?: number;
};

type PartLike = {
  outline: OutlinePoint[];
};

type PolygonSheetWithHoles = {
  outline: OutlinePoint[];
  holes?: OutlinePoint[][];
  quantity?: number;
};

export type RemnantGeometry = {
  outline: OutlinePoint[];
  holes: OutlinePoint[][];
};

function cleanLoop(points: OutlinePoint[]): OutlinePoint[] {
  const out = points.filter(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
  );
  if (out.length < 3) return [];
  const first = out[0];
  const last = out[out.length - 1];
  if (first.x === last.x && first.y === last.y) {
    return out.slice(0, -1);
  }
  return out;
}

function formatSvgNum(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const s = n.toFixed(6);
  return s.replace(/\.?0+$/, "") || "0";
}

/**
 * Build remnant geometry as one outer sheet ring + holes for placed part outers.
 * Existing sheet holes are preserved.
 */
export function buildRemnantGeometryFromNest(
  sheet: NestApiSheetPayload,
  parts: PartLike[],
  sheetplacements: PlacementLike[],
): RemnantGeometry | null {
  const outline = cleanLoop(nestSheetPayloadToPreviewOutline(sheet));
  if (outline.length < 3) return null;

  const holes: OutlinePoint[][] = [];

  if ("outline" in sheet && Array.isArray((sheet as PolygonSheetWithHoles).holes)) {
    for (const existingHole of (sheet as PolygonSheetWithHoles).holes ?? []) {
      const clean = cleanLoop(existingHole);
      if (clean.length >= 3) holes.push(clean);
    }
  }

  for (const placement of sheetplacements) {
    if (!placement || typeof placement.source !== "number") continue;
    const part = parts[placement.source];
    if (!part?.outline?.length) continue;
    const placedOuter = cleanLoop(
      placeOutline(
        part.outline,
        placement.rotation ?? 0,
        placement.x ?? 0,
        placement.y ?? 0,
      ),
    );
    if (placedOuter.length >= 3) holes.push(placedOuter);
  }

  return { outline, holes };
}

/**
 * Encode rings (Nest space: y up) into SVG path-space (y down) for DB svg_path.
 * All rings share one transform so relative placement is preserved.
 */
export function nestRingsToSvgPath(ringsNest: OutlinePoint[][]): string {
  const rings = ringsNest
    .map((ring) => cleanLoop(ring))
    .filter((ring) => ring.length >= 3);
  if (!rings.length) return "";

  let maxY = Number.NEGATIVE_INFINITY;
  for (const ring of rings) {
    for (const p of ring) {
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(maxY)) return "";

  return rings
    .map((ring) => {
      const [first, ...rest] = ring;
      const firstY = maxY - first.y;
      const segs = [`M${formatSvgNum(first.x)} ${formatSvgNum(firstY)}`];
      for (const p of rest) {
        segs.push(`L${formatSvgNum(p.x)} ${formatSvgNum(maxY - p.y)}`);
      }
      segs.push("Z");
      return segs.join(" ");
    })
    .join(" ");
}
