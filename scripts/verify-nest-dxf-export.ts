/**
 * Smoke checks for nest DXF Autodesk-style scaffolding (run: npx tsx scripts/verify-nest-dxf-export.ts).
 * Tests 3-layer output with SHEET/PARTS/TEXT for Autodesk viewer compatibility.
 */

import assert from "node:assert/strict";

import { buildNestSheetDxf } from "../lib/nestDxfExport";

const sheet = { width: 96, height: 48 };
const parts = [
  {
    outline: [
      { x: 0, y: 0 },
      { x: 36, y: 0 },
      { x: 36, y: 38 },
      { x: 0, y: 38 },
    ],
  },
];
const placements = [{ source: 0, x: 0.1, y: 0.1, rotation: 0 }];

const dxf = buildNestSheetDxf(sheet, parts, placements, {
  includePartNames: true,
  includeSheetOutline: true,
});

assert.match(dxf, /\$ACADVER\r\n1\r\nAC1014/, "HEADER should use AC1014");
assert.match(dxf, /txt\.shx/, "STYLE should define font for MTEXT");
assert.match(dxf, /\$HANDSEED\r\n5\r\n[0-9A-F]+\r\n/, "HEADER should include $HANDSEED");
assert.match(
  dxf,
  /\r\n2\r\nOBJECTS\r\n/,
  "should include OBJECTS section",
);
assert.match(
  dxf,
  /\r\nDICTIONARY\r\n5\r\n/,
  "OBJECTS should include DICTIONARY",
);
assert.match(dxf, /ACAD_GROUP/, "OBJECTS should reference ACAD_GROUP");
assert.match(
  dxf,
  /\r\n70\r\n1\r\n43\r\n0\.0\r\n10\r\n/,
  "LWPOLYLINE should include closed flag then global width 43",
);
assert.match(dxf, /8\r\n0\r\n/, "should use layer 0");

const lines = dxf.split(/\r\n/);
const handles: string[] = [];
for (let i = 0; i < lines.length - 1; i++) {
  if (lines[i] === "5" && /^[0-9A-F]+$/i.test(lines[i + 1] ?? "")) {
    handles.push(lines[i + 1]!.toUpperCase());
  }
}
assert.ok(handles.length >= 8, "expected multiple hex handles");
assert.equal(
  new Set(handles).size,
  handles.length,
  "all group-5 handles should be unique",
);

console.log("verify-nest-dxf-export: ok");
