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

/**
 * Convert path-space points (y increases downward) to NestNow space (origin bottom-left, y up).
 * Normalizes so the axis-aligned bounding box lower-left is (0,0).
 */
export function pathSpaceRingToNestOutline(ring: OutlinePoint[]): OutlinePoint[] {
  if (ring.length < 3) return [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return [];
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return [];
  return ring.map((p) => ({
    x: p.x - minX,
    y: maxY - p.y,
  }));
}

/**
 * Parse `svg_path` (DB or import) into a Nest-oriented outer outline.
 */
export function svgPathToNestOutline(d: string): OutlinePoint[] | null {
  const trimmed = (d || "").trim();
  if (!trimmed) return null;
  const rings = parseSvgPathToPathSpaceRings(trimmed);
  const outer = rings[0];
  if (!outer || outer.length < 3) return null;
  const nest = pathSpaceRingToNestOutline(outer);
  return nest.length >= 3 ? nest : null;
}
