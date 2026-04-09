import type { OutlinePoint } from "@/lib/utils";

/**
 * Tokenize a minimal SVG path `d` string (numbers, commands).
 */
function tokenizePath(d: string): string[] {
  const s = d.replace(/,/g, " ").trim();
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      out.push(ch);
      i += 1;
      continue;
    }
    let j = i;
    if (s[j] === "-" || s[j] === "+") j += 1;
    while (j < s.length && /[0-9]/.test(s[j])) j += 1;
    if (j < s.length && s[j] === ".") {
      j += 1;
      while (j < s.length && /[0-9]/.test(s[j])) j += 1;
    }
    if (j < s.length && (s[j] === "e" || s[j] === "E")) {
      j += 1;
      if (j < s.length && (s[j] === "+" || s[j] === "-")) j += 1;
      while (j < s.length && /[0-9]/.test(s[j])) j += 1;
    }
    if (j === i) return [];
    out.push(s.slice(i, j));
    i = j;
  }
  return out;
}

/**
 * Parse a closed subpath from SVG `d` (M/L/H/V and m/l/h/v, Z) into absolute points (y-down / path space).
 * Returns rings; each ring is open (first point not repeated at end).
 */
export function parseSvgPathToPathSpaceRings(d: string): OutlinePoint[][] {
  const tokens = tokenizePath(d);
  const rings: OutlinePoint[][] = [];
  let ring: OutlinePoint[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let cmd = "";
  let ti = 0;

  const readNum = (): number | null => {
    if (ti >= tokens.length) return null;
    const v = parseFloat(tokens[ti]);
    ti += 1;
    return Number.isFinite(v) ? v : null;
  };

  const pushPt = (x: number, y: number) => {
    ring.push({ x, y });
    cx = x;
    cy = y;
  };

  while (ti < tokens.length) {
    const t = tokens[ti];
    if (/^[a-zA-Z]$/.test(t)) {
      cmd = t;
      ti += 1;
    }
    if (!cmd) break;

    const upper = cmd.toUpperCase();
    const rel = cmd === cmd.toLowerCase();

    if (upper === "M") {
      const x0 = readNum();
      const y0 = readNum();
      if (x0 == null || y0 == null) return rings;
      const x = rel ? cx + x0 : x0;
      const y = rel ? cy + y0 : y0;
      if (ring.length) {
        if (ring.length >= 3) rings.push(ring);
        ring = [];
      }
      pushPt(x, y);
      sx = cx;
      sy = cy;
      cmd = rel ? "l" : "L";
      continue;
    }

    if (upper === "L") {
      const x0 = readNum();
      const y0 = readNum();
      if (x0 == null || y0 == null) return rings;
      const x = rel ? cx + x0 : x0;
      const y = rel ? cy + y0 : y0;
      pushPt(x, y);
      continue;
    }

    if (upper === "H") {
      const x0 = readNum();
      if (x0 == null) return rings;
      const x = rel ? cx + x0 : x0;
      pushPt(x, rel ? cy : cy);
      continue;
    }

    if (upper === "V") {
      const y0 = readNum();
      if (y0 == null) return rings;
      const y = rel ? cy + y0 : y0;
      pushPt(cx, y);
      continue;
    }

    if (upper === "Z") {
      if (ring.length >= 3) {
        rings.push(ring);
        ring = [];
      }
      cx = sx;
      cy = sy;
      cmd = "";
      continue;
    }

    return rings;
  }

  if (ring.length >= 3) rings.push(ring);
  return rings;
}

type RingNode = {
  index: number;
  points: OutlinePoint[];
  area: number;
  parentIndex: number | null;
  depth: number;
};

function ringAreaAbs(points: OutlinePoint[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum / 2);
}

function pointInPolygon(point: OutlinePoint, polygon: OutlinePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersects =
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pathSpaceRingsToNestRings(rings: OutlinePoint[][]): OutlinePoint[][] {
  if (!rings.length) return [];

  let minX = Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return [];
      if (p.x < minX) minX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxY)) return [];

  return rings.map((ring) =>
    ring.map((p) => ({
      x: p.x - minX,
      y: maxY - p.y,
    })),
  );
}

function buildRingTree(rings: OutlinePoint[][]): RingNode[] {
  const nodes: RingNode[] = rings.map((points, index) => ({
    index,
    points,
    area: ringAreaAbs(points),
    parentIndex: null,
    depth: 0,
  }));

  for (const inner of nodes) {
    let bestParent: RingNode | null = null;
    for (const outer of nodes) {
      if (outer.index === inner.index) continue;
      if (outer.area <= inner.area) continue;
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
    const seen = new Set<number>();
    while (parent != null && !seen.has(parent)) {
      seen.add(parent);
      depth += 1;
      parent = nodes[parent]?.parentIndex ?? null;
    }
    node.depth = depth;
  }

  return nodes;
}

/**
 * Convert path-space points (y increases downward) to NestNow space (origin bottom-left, y up).
 * Normalizes so the axis-aligned bounding box lower-left is (0,0).
 */
export function pathSpaceRingToNestOutline(ring: OutlinePoint[]): OutlinePoint[] {
  return pathSpaceRingsToNestRings([ring])[0] ?? [];
}

/**
 * Parse `svg_path` into a Nest sheet shape with one outer outline and optional holes.
 * Multiple rings are classified by nesting depth (even = outer, odd = hole).
 */
export function svgPathToNestShape(d: string): {
  outline: OutlinePoint[];
  holes: OutlinePoint[][];
} | null {
  const trimmed = (d || "").trim();
  if (!trimmed) return null;

  const ringsPathSpace = parseSvgPathToPathSpaceRings(trimmed)
    .map((ring) => {
      if (ring.length < 3) return [];
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first.x === last.x && first.y === last.y) return ring.slice(0, -1);
      return ring;
    })
    .filter((ring) => ring.length >= 3);
  if (!ringsPathSpace.length) return null;

  const ringsNest = pathSpaceRingsToNestRings(ringsPathSpace)
    .map((ring) => ring.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))
    .filter((ring) => ring.length >= 3);
  if (!ringsNest.length) return null;

  const tree = buildRingTree(ringsNest).filter((node) => node.area > 1e-6);
  if (!tree.length) return null;

  const outerCandidates = tree.filter((node) => node.depth % 2 === 0);
  if (!outerCandidates.length) return null;
  outerCandidates.sort((a, b) => b.area - a.area);
  const chosenOuter = outerCandidates[0];

  const holes = tree
    .filter((node) => {
      if (node.depth % 2 === 0) return false;
      let parent = node.parentIndex;
      let ownerEvenAncestor: number | null = null;
      while (parent != null) {
        const candidate = tree.find((n) => n.index === parent);
        if (!candidate) break;
        if (candidate.depth % 2 === 0) {
          ownerEvenAncestor = candidate.index;
          break;
        }
        parent = candidate.parentIndex;
      }
      return ownerEvenAncestor === chosenOuter.index;
    })
    .map((node) => node.points);

  return { outline: chosenOuter.points, holes };
}

/**
 * Parse `svg_path` (DB or import) into a Nest-oriented outer outline.
 */
export function svgPathToNestOutline(d: string): OutlinePoint[] | null {
  const shape = svgPathToNestShape(d);
  if (!shape?.outline?.length) return null;
  return shape.outline;
}
