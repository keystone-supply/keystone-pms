import { Helper } from "dxf";

import { type OutlinePoint, type PartShape } from "@/lib/utils";

type DxfUnitsCode = number;

type PolylineLoop = {
  points: OutlinePoint[];
  signedArea: number;
  area: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
};

type LoopTreeNode = PolylineLoop & {
  index: number;
  parentIndex: number | null;
  depth: number;
};

type OpenPolylinePath = OutlinePoint[];

const POINT_MERGE_EPSILON = 1e-4;

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pointsEqual(a: OutlinePoint, b: OutlinePoint): boolean {
  return a.x === b.x && a.y === b.y;
}

function pointsNear(
  a: OutlinePoint,
  b: OutlinePoint,
  epsilon = POINT_MERGE_EPSILON,
): boolean {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

function stripDuplicateClosingPoint(points: OutlinePoint[]): OutlinePoint[] {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (pointsEqual(first, last)) return points.slice(0, -1);
  return points;
}

function signedPolygonArea(points: OutlinePoint[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function computeBBox(points: OutlinePoint[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function isPointOnSegment(
  point: OutlinePoint,
  a: OutlinePoint,
  b: OutlinePoint,
): boolean {
  const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > 1e-9) return false;

  const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y);
  if (dot < 0) return false;

  const lenSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return dot <= lenSq;
}

function pointInPolygon(point: OutlinePoint, polygon: OutlinePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];

    if (isPointOnSegment(point, pj, pi)) return true;

    const intersects =
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function bboxContains(
  outer: PolylineLoop["bbox"],
  inner: PolylineLoop["bbox"],
): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.maxX <= outer.maxX &&
    inner.minY >= outer.minY &&
    inner.maxY <= outer.maxY
  );
}

function normalizeToOrigin(
  outline: OutlinePoint[],
  holes: OutlinePoint[][],
): { outline: OutlinePoint[]; holes: OutlinePoint[][] } {
  const allPoints = [...outline, ...holes.flat()];
  if (!allPoints.length) return { outline, holes };

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  for (const p of allPoints) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
  }

  const shift = (p: OutlinePoint): OutlinePoint => ({
    x: p.x - minX,
    y: p.y - minY,
  });

  return {
    outline: outline.map(shift),
    holes: holes.map((loop) => loop.map(shift)),
  };
}

function ensureOrientation(
  points: OutlinePoint[],
  shouldBeClockwise: boolean,
): OutlinePoint[] {
  const area = signedPolygonArea(points);
  const isClockwise = area < 0;
  if (isClockwise === shouldBeClockwise) return points;
  return points.slice().reverse();
}

function detectInsUnits(parsed: unknown): DxfUnitsCode | null {
  if (!parsed || typeof parsed !== "object") return null;
  const header = (parsed as { header?: unknown }).header;
  if (!header || typeof header !== "object") return null;

  const raw = (header as { $INSUNITS?: unknown }).$INSUNITS;
  if (raw == null) return null;

  const direct = toFiniteNumber(raw);
  if (direct != null) return direct;

  if (typeof raw === "object") {
    const maybeValue = toFiniteNumber((raw as { value?: unknown }).value);
    if (maybeValue != null) return maybeValue;
  }

  return null;
}

function unitsToInchesMultiplier(unitsCode: DxfUnitsCode | null): number {
  switch (unitsCode) {
    case 1: // Inches
      return 1;
    case 2: // Feet
      return 12;
    case 3: // Miles
      return 63360;
    case 4: // Millimeters
      return 1 / 25.4;
    case 5: // Centimeters
      return 1 / 2.54;
    case 6: // Meters
      return 39.37007874;
    case 7: // Kilometers
      return 39370.07874;
    case 8: // Microinches
      return 1 / 1_000_000;
    case 9: // Mils
      return 1 / 1000;
    case 10: // Yards
      return 36;
    case 14: // Decimeters
      return 3.937007874;
    case 15: // Decameters
      return 393.7007874;
    case 16: // Hectometers
      return 3937.007874;
    case 17: // Gigameters
      return 39_370_078_740.15748;
    default:
      // Unknown or unitless defaults to inches to match existing UI assumptions.
      return 1;
  }
}

function polylineToLoop(
  pointsInput: OutlinePoint[],
): PolylineLoop | null {
  const deduped = stripDuplicateClosingPoint(pointsInput);
  if (deduped.length < 3) return null;

  const signedArea = signedPolygonArea(deduped);
  const area = Math.abs(signedArea);
  if (!Number.isFinite(area) || area <= 1e-6) return null;

  return {
    points: deduped,
    signedArea,
    area,
    bbox: computeBBox(deduped),
  };
}

function toOutlinePoint(
  point: unknown,
  inchesMultiplier: number,
): OutlinePoint | null {
  if (Array.isArray(point)) {
    if (point.length < 2) return null;
    const x = toFiniteNumber(point[0]);
    const y = toFiniteNumber(point[1]);
    if (x == null || y == null) return null;
    return { x: x * inchesMultiplier, y: y * inchesMultiplier };
  }

  if (point && typeof point === "object") {
    const x = toFiniteNumber((point as { x?: unknown }).x);
    const y = toFiniteNumber((point as { y?: unknown }).y);
    if (x == null || y == null) return null;
    return { x: x * inchesMultiplier, y: y * inchesMultiplier };
  }

  return null;
}

function normalizePointList(points: OutlinePoint[]): OutlinePoint[] {
  if (points.length <= 1) return points;
  const out: OutlinePoint[] = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    if (!pointsNear(points[i], out[out.length - 1])) {
      out.push(points[i]);
    }
  }
  return out;
}

function extractPolylinePoints(
  polyline: unknown,
  inchesMultiplier: number,
): OutlinePoint[] {
  let rawPoints: unknown[] = [];
  if (Array.isArray(polyline)) {
    rawPoints = polyline;
  } else if (polyline && typeof polyline === "object") {
    const vertices = (polyline as { vertices?: unknown }).vertices;
    const points = (polyline as { points?: unknown }).points;
    if (Array.isArray(vertices)) rawPoints = vertices;
    else if (Array.isArray(points)) rawPoints = points;
  }

  return normalizePointList(
    rawPoints
      .map((point) => toOutlinePoint(point, inchesMultiplier))
      .filter((point): point is OutlinePoint => point != null),
  );
}

function reversePath(path: OpenPolylinePath): OpenPolylinePath {
  return path.slice().reverse();
}

function appendPath(
  base: OpenPolylinePath,
  next: OpenPolylinePath,
): OpenPolylinePath {
  if (!base.length) return next.slice();
  if (!next.length) return base.slice();
  if (pointsNear(base[base.length - 1], next[0])) {
    return [...base, ...next.slice(1)];
  }
  return [...base, ...next];
}

function tryMergePaths(
  pathA: OpenPolylinePath,
  pathB: OpenPolylinePath,
): OpenPolylinePath | null {
  if (!pathA.length || !pathB.length) return null;

  const aStart = pathA[0];
  const aEnd = pathA[pathA.length - 1];
  const bStart = pathB[0];
  const bEnd = pathB[pathB.length - 1];

  if (pointsNear(aEnd, bStart)) return appendPath(pathA, pathB);
  if (pointsNear(aEnd, bEnd)) return appendPath(pathA, reversePath(pathB));
  if (pointsNear(aStart, bEnd)) return appendPath(pathB, pathA);
  if (pointsNear(aStart, bStart)) return appendPath(reversePath(pathB), pathA);

  return null;
}

function stitchPathsToLoops(paths: OpenPolylinePath[]): PolylineLoop[] {
  const pool = paths
    .map((path) => normalizePointList(path))
    .filter((path) => path.length >= 2);
  const loops: PolylineLoop[] = [];

  while (pool.length) {
    let current = pool.pop() as OpenPolylinePath;
    let merged = true;

    while (merged) {
      merged = false;
      for (let i = 0; i < pool.length; i += 1) {
        const mergedPath = tryMergePaths(current, pool[i]);
        if (!mergedPath) continue;
        current = normalizePointList(mergedPath);
        pool.splice(i, 1);
        merged = true;
        break;
      }
    }

    if (
      current.length >= 4 &&
      pointsNear(current[0], current[current.length - 1])
    ) {
      const deduped = stripDuplicateClosingPoint(current);
      const asLoop = polylineToLoop(deduped);
      if (asLoop) loops.push(asLoop);
    }
  }

  return loops;
}

function buildLoopTree(loops: PolylineLoop[]): LoopTreeNode[] {
  const nodes: LoopTreeNode[] = loops.map((loop, index) => ({
    ...loop,
    index,
    parentIndex: null,
    depth: 0,
  }));

  for (const inner of nodes) {
    let bestParent: LoopTreeNode | null = null;
    for (const outer of nodes) {
      if (outer.index === inner.index) continue;
      if (outer.area <= inner.area) continue;
      if (!bboxContains(outer.bbox, inner.bbox)) continue;
      if (!pointInPolygon(inner.points[0], outer.points)) continue;

      if (!bestParent || outer.area < bestParent.area) {
        bestParent = outer;
      }
    }
    inner.parentIndex = bestParent?.index ?? null;
  }

  for (const node of nodes) {
    let depth = 0;
    let parent = node.parentIndex;
    const visited = new Set<number>();
    while (parent != null && !visited.has(parent)) {
      visited.add(parent);
      depth += 1;
      parent = nodes[parent]?.parentIndex ?? null;
    }
    node.depth = depth;
  }

  return nodes;
}

function toPartName(filename: string, index: number): string {
  const stem = filename.replace(/\.[^/.]+$/u, "") || "DXF";
  return `${stem} ${index + 1}`;
}

function makePartId(filename: string, index: number): string {
  const safeFile = filename
    .replace(/\.[^/.]+$/u, "")
    .replace(/[^a-z0-9_-]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const rand = Math.random().toString(36).slice(2, 8);
  return `dxf-${safeFile || "part"}-${Date.now()}-${index + 1}-${rand}`;
}

function extractRawPolylines(toPolylinesResult: unknown): unknown[] {
  if (Array.isArray(toPolylinesResult)) {
    return toPolylinesResult;
  }

  if (toPolylinesResult && typeof toPolylinesResult === "object") {
    const maybePolylines = (toPolylinesResult as { polylines?: unknown })
      .polylines;
    if (Array.isArray(maybePolylines)) {
      return maybePolylines;
    }
  }

  return [];
}

export function parseDxfToShapes(
  dxfText: string,
  filename: string,
): PartShape[] {
  const helper = new Helper(dxfText);
  const insUnits = detectInsUnits(helper.parsed);
  const inchesMultiplier = unitsToInchesMultiplier(insUnits);
  const rawPolylines = extractRawPolylines(helper.toPolylines());

  const directLoops: PolylineLoop[] = [];
  const openPaths: OpenPolylinePath[] = [];

  for (const rawPolyline of rawPolylines) {
    const points = extractPolylinePoints(rawPolyline, inchesMultiplier);
    if (points.length < 2) continue;

    const loop = polylineToLoop(points);
    if (loop) {
      directLoops.push(loop);
      continue;
    }

    openPaths.push(points);
  }

  const stitchedLoops = stitchPathsToLoops(openPaths);
  const loops = [...directLoops, ...stitchedLoops];

  if (!loops.length) return [];

  const tree = buildLoopTree(loops);
  const parts: PartShape[] = [];

  const evenDepthNodes = tree.filter((node) => node.depth % 2 === 0);
  for (let i = 0; i < evenDepthNodes.length; i += 1) {
    const outerNode = evenDepthNodes[i];

    const holeNodes = tree.filter((node) => {
      if (node.depth % 2 === 0) return false;
      let parent = node.parentIndex;
      let ownerEvenAncestor: number | null = null;
      while (parent != null) {
        const candidate = tree[parent];
        if (!candidate) break;
        if (candidate.depth % 2 === 0) {
          ownerEvenAncestor = candidate.index;
          break;
        }
        parent = candidate.parentIndex;
      }
      return ownerEvenAncestor === outerNode.index;
    });

    const outer = ensureOrientation(outerNode.points, false);
    const holes = holeNodes.map((hole) => ensureOrientation(hole.points, true));
    const normalized = normalizeToOrigin(outer, holes);

    parts.push({
      id: makePartId(filename, i),
      name: toPartName(filename, i),
      kind: "polygon",
      outline: normalized.outline,
      ...(normalized.holes.length ? { holes: normalized.holes } : {}),
      quantity: 1,
      canRotate: true,
      meta: {
        source: "dxf",
        originalParams: {
          filename,
          insUnits,
          unitsMultiplierToInches: inchesMultiplier,
        },
      },
    });
  }

  return parts;
}
