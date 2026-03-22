#!/usr/bin/env node
/**
 * Approximate UTF-8 size of a minimal NestNow /api/nest JSON body with many parts.
 *
 * Usage:
 *   node scripts/estimate-nest-payload-size.mjs
 *   node scripts/estimate-nest-payload-size.mjs 400 8
 *
 * Args: partCount (default 400), verticesPerRectOutline (default 8, min 4).
 */

const partCount = Math.max(
  1,
  parseInt(process.argv[2] || "400", 10) || 400,
);
const verts = Math.max(
  4,
  parseInt(process.argv[3] || "8", 10) || 8,
);

function regularPolygon(cx, cy, r, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({
      x: Math.round((cx + r * Math.cos(a)) * 1000) / 1000,
      y: Math.round((cy + r * Math.sin(a)) * 1000) / 1000,
    });
  }
  return out;
}

const parts = [];
for (let i = 0; i < partCount; i++) {
  const r = 8 + (i % 7);
  parts.push({
    outline: regularPolygon(50, 50, r, verts),
    filename: `part-${i}`,
    quantity: 1,
  });
}

const body = {
  sheets: [{ width: 120, height: 240 }],
  parts,
  config: {
    spacing: 0.125,
    rotations: 4,
    populationSize: 10,
    gaGenerations: 3,
    simplify: false,
  },
  requestTimeoutMs: 600000,
};

const json = JSON.stringify(body);
const bytes = Buffer.byteLength(json, "utf8");

console.log(
  `Synthetic nest payload: ${partCount} parts, ${verts} vertices/outline → ${(bytes / 1024).toFixed(1)} KiB (${bytes} bytes UTF-8)`,
);
console.log(
  "This is a lower bound for “organic” parts if real outlines have more points.",
);
