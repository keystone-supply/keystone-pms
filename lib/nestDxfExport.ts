import {
  nestSheetPayloadToPreviewOutline,
  nestSheetPreviewDimensions,
  type NestApiSheetPayload,
} from "@/lib/remnantNestGeometry";
import {
  placeOutline,
  placeHoles,
  type OutlinePoint,
} from "@/lib/utils";

/** Single layer DXF matching Fusion reference (AC1014, layer "0"). Sheet outline and text are optionally included on the same layer. */
export const NEST_DXF_LAYER_0 = "0";

export type NestDxfPlacement = {
  source?: number;
  x?: number;
  y?: number;
  rotation?: number;
  filename?: string;
};

export type NestDxfPart = {
  outline: OutlinePoint[];
  holes?: OutlinePoint[][];
  filename?: string;
};

export type BuildNestDxfOptions = {
  /** Default true. */
  includePartNames?: boolean;
  /** Default true. When false, omit the sheet reference outline (SHEET layer). */
  includeSheetOutline?: boolean;
  /** Nominal character height in drawing units (inches). Default 1. */
  textHeight?: number;
};

function dxfNum(n: number): string {
  if (!Number.isFinite(n)) return "0.0";
  const s = n.toFixed(6);
  return s.replace(/\.?0+$/, "") || "0";
}

function nextHandle(i: { n: number }): string {
  i.n += 1;
  return (200 + i.n).toString(16).toUpperCase();
}

/** Opens a TABLES subsection: parent `TABLE` with handle and `AcDbSymbolTable`. */
function pushTableOpen(
  out: string[],
  h: { n: number },
  tableName: string,
  maxEntries: number,
) {
  out.push(
    "0",
    "TABLE",
    "2",
    tableName,
    "5",
    nextHandle(h),
    "100",
    "AcDbSymbolTable",
    "70",
    String(maxEntries),
  );
}

function pushEmptySymbolTable(
  out: string[],
  h: { n: number },
  tableName: string,
  maxEntries: number,
) {
  pushTableOpen(out, h, tableName, maxEntries);
  out.push("0", "ENDTAB");
}

function pushAppIdAcad(out: string[], h: { n: number }) {
  pushTableOpen(out, h, "APPID", 1);
  out.push(
    "0",
    "APPID",
    "5",
    nextHandle(h),
    "100",
    "AcDbSymbolTableRecord",
    "100",
    "AcDbRegAppTableRecord",
    "2",
    "ACAD",
    "70",
    "0",
    "0",
    "ENDTAB",
  );
}

/** OBJECTS section matching working Fusion-exported DXF (root dictionary + ACAD_GROUP + ACAD_MLINESTYLE). Removed dangling dictNested that caused TranslationWorker-InternalFailure. */
function pushObjectsSection(out: string[], h: { n: number }) {
  const root = nextHandle(h);
  const dictGroup = nextHandle(h);
  const dictMline = nextHandle(h);
  out.push(
    "0",
    "SECTION",
    "2",
    "OBJECTS",
    "0",
    "DICTIONARY",
    "5",
    root,
    "100",
    "AcDbDictionary",
    "3",
    "ACAD_GROUP",
    "350",
    dictGroup,
    "3",
    "ACAD_MLINESTYLE",
    "350",
    dictMline,
    "0",
    "DICTIONARY",
    "5",
    dictGroup,
    "100",
    "AcDbDictionary",
    "0",
    "DICTIONARY",
    "5",
    dictMline,
    "100",
    "AcDbDictionary",
    "0",
    "ENDSEC",
  );
}

function polygonCentroid(pts: OutlinePoint[]): { x: number; y: number } {
  const n = pts.length;
  if (n < 3) {
    let ax = 0;
    let ay = 0;
    for (const p of pts) {
      ax += p.x;
      ay += p.y;
    }
    return { x: ax / Math.max(1, n), y: ay / Math.max(1, n) };
  }
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    twiceArea += cross;
    cx += (pts[i].x + pts[j].x) * cross;
    cy += (pts[i].y + pts[j].y) * cross;
  }
  if (Math.abs(twiceArea) < 1e-12) {
    let ax = 0;
    let ay = 0;
    for (const p of pts) {
      ax += p.x;
      ay += p.y;
    }
    return { x: ax / n, y: ay / n };
  }
  const A = twiceArea / 2;
  return { x: cx / (6 * A), y: cy / (6 * A) };
}

function loopBBox(pts: OutlinePoint[]): {
  w: number;
  h: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  if (maxX <= minX || maxY <= minY) return { w: 4, h: 4 };
  return { w: maxX - minX, h: maxY - minY };
}

/** Word-wrap for MTEXT using \\P line breaks (max chars per line). */
export function wrapPartNameForMtext(
  raw: string,
  maxCharsPerLine = 28,
): string {
  const s = raw.trim();
  if (!s) return "";
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (w.length > maxCharsPerLine) {
      if (cur) {
        lines.push(cur);
        cur = "";
      }
      for (let i = 0; i < w.length; i += maxCharsPerLine) {
        lines.push(w.slice(i, i + maxCharsPerLine));
      }
      continue;
    }
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxCharsPerLine) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.join("\\P");
}

function escapeMtextContent(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}

function pushLwpolyline(
  lines: string[],
  h: { n: number },
  layer: string,
  pts: OutlinePoint[],
) {
  const clean = pts.filter(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
  );
  if (clean.length < 3) return;
  const handle = nextHandle(h);
  lines.push(
    "0",
    "LWPOLYLINE",
    "5",
    handle,
    "100",
    "AcDbEntity",
    "8",
    layer,
    "100",
    "AcDbPolyline",
    "90",
    String(clean.length),
    "70",
    "1",
    "43",
    "0.0",
  );
  for (const p of clean) {
    lines.push("10", dxfNum(p.x), "20", dxfNum(p.y));
  }
}

/** Split MTEXT into 250-char chunks for group 3 / 1. */
function mtextChunks(escapedContent: string): { leading: string[]; last: string } {
  if (escapedContent.length <= 250) {
    return { leading: [], last: escapedContent };
  }
  const leading: string[] = [];
  let i = 0;
  while (i + 250 < escapedContent.length) {
    leading.push(escapedContent.slice(i, i + 250));
    i += 250;
  }
  return { leading, last: escapedContent.slice(i) };
}

function pushMtext(
  lines: string[],
  h: { n: number },
  cx: number,
  cy: number,
  height: number,
  rotationDeg: number,
  columnWidth: number,
  display: string,
  layer: string = NEST_DXF_LAYER_0,
) {
  const content = escapeMtextContent(display);
  const { leading, last } = mtextChunks(content);
  const handle = nextHandle(h);
  const rotRad = (rotationDeg * Math.PI) / 180;
  lines.push(
    "0",
    "MTEXT",
    "5",
    handle,
    "100",
    "AcDbEntity",
    "8",
    layer,
    "100",
    "AcDbMText",
    "10",
    dxfNum(cx),
    "20",
    dxfNum(cy),
    "30",
    "0.0",
    "40",
    dxfNum(height),
    "41",
    dxfNum(columnWidth),
    "50",
    dxfNum(rotRad),
    "71",
    "5",
    "72",
    "1",
    "7",
    "STANDARD",
  );
  for (const chunk of leading) {
    lines.push("3", chunk);
  }
  lines.push("1", last);
}

/**
 * Build an ASCII DXF (inches, y-up matching Nest) for one sheet: optional sheet outline,
 * part cut loops (outer + holes per instance), optional MTEXT labels at each part centroid.
 * Uses AC1021 for better Autodesk online viewer compatibility. Includes enhanced HEADER
 * ($ACADVER, $EXTMIN/$EXTMAX from sheet bounds, etc.), full LAYER table with colors,
 * and OBJECTS dictionary. Layers: SHEET (boundary), PARTS (nested cut geometry), TEXT (labels).
 */
export function buildNestSheetDxf(
  sheet: NestApiSheetPayload,
  parts: NestDxfPart[],
  sheetplacements: NestDxfPlacement[],
  options: BuildNestDxfOptions = {},
): string {
  const includeSheetOutline = options.includeSheetOutline !== false;
  const includePartNames = options.includePartNames !== false;
  const textHeight =
    typeof options.textHeight === "number" &&
    Number.isFinite(options.textHeight) &&
    options.textHeight > 0
      ? options.textHeight
      : 1;

  // Single layer "0" to match Fusion reference for maximum compatibility
  const layerName = NEST_DXF_LAYER_0;

  const sheetOutline = nestSheetPayloadToPreviewOutline(sheet);
  const sheetDim = nestSheetPreviewDimensions(sheet);
  const sheetWidth = sheetDim.width;
  const sheetHeight = sheetDim.height;
  const handleGen = { n: 0 };
  const body: string[] = [];

  body.push("0", "SECTION", "2", "TABLES");

  // Improved VPORT table with *Active entry to match working Fusion DXF
  pushTableOpen(body, handleGen, "VPORT", 1);
  body.push(
    "0",
    "VPORT",
    "5",
    nextHandle(handleGen),
    "100",
    "AcDbSymbolTableRecord",
    "100",
    "AcDbViewportTableRecord",
    "2",
    "*Active",
    "70",
    "0",
    "10",
    "0.0",
    "20",
    "0.0",
    "11",
    "1.0",
    "21",
    "1.0",
    "12",
    "0.0",
    "22",
    "0.0",
    "13",
    "0.0",
    "23",
    "0.0",
    "14",
    "1.0",
    "24",
    "1.0",
    "40",
    "1.0",
    "41",
    "1.0",
    "0",
    "ENDTAB",
  );

  pushTableOpen(body, handleGen, "LTYPE", 3);
  body.push(
    "0",
    "LTYPE",
    "5",
    nextHandle(handleGen),
    "100",
    "AcDbSymbolTableRecord",
    "100",
    "AcDbLinetypeTableRecord",
    "2",
    "BYBLOCK",
    "70",
    "0",
    "0",
    "LTYPE",
    "5",
    nextHandle(handleGen),
    "100",
    "AcDbSymbolTableRecord",
    "100",
    "AcDbLinetypeTableRecord",
    "2",
    "BYLAYER",
    "70",
    "0",
    "0",
    "LTYPE",
    "5",
    nextHandle(handleGen),
    "100",
    "AcDbSymbolTableRecord",
    "100",
    "AcDbLinetypeTableRecord",
    "2",
    "CONTINUOUS",
    "70",
    "0",
    "3",
    "Solid line",
    "72",
    "65",
    "73",
    "0",
    "40",
    "0.0",
    "0",
    "ENDTAB",
  );

  // Single layer "0" to match Fusion reference
  pushTableOpen(body, handleGen, "LAYER", 1);
  body.push(
    "0",
    "LAYER",
    "5",
    nextHandle(handleGen),
    "100",
    "AcDbSymbolTableRecord",
    "100",
    "AcDbLayerTableRecord",
    "2",
    NEST_DXF_LAYER_0,
    "70",
    "0",
    "62",
    "7",
    "6",
    "CONTINUOUS",
    "370",
    "0",
  );
  body.push("0", "ENDTAB");

  pushTableOpen(body, handleGen, "STYLE", 1);
  body.push(
    "0",
    "STYLE",
    "5",
    nextHandle(handleGen),
    "100",
    "AcDbSymbolTableRecord",
    "100",
    "AcDbTextStyleTableRecord",
    "2",
    "STANDARD",
    "70",
    "0",
    "3",
    "txt.shx", // font for MTEXT compatibility (matches common Autodesk DXFs)
    "40",
    "0.0",
    "0",
    "ENDTAB",
  );

  pushEmptySymbolTable(body, handleGen, "VIEW", 0);
  pushEmptySymbolTable(body, handleGen, "UCS", 0);
  pushAppIdAcad(body, handleGen);
  pushEmptySymbolTable(body, handleGen, "DIMSTYLE", 0);

  pushTableOpen(body, handleGen, "BLOCK_RECORD", 2);
  body.push(
    "0",
    "BLOCK_RECORD",
    "5",
    nextHandle(handleGen),
    "100",
    "AcDbSymbolTableRecord",
    "100",
    "AcDbBlockTableRecord",
    "2",
    "*MODEL_SPACE",
    "0",
    "BLOCK_RECORD",
    "5",
    nextHandle(handleGen),
    "100",
    "AcDbSymbolTableRecord",
    "100",
    "AcDbBlockTableRecord",
    "2",
    "*PAPER_SPACE",
    "0",
    "ENDTAB",
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "BLOCKS",
    "0",
    "BLOCK",
    "5",
    nextHandle(handleGen),
    "100",
    "AcDbEntity",
    "100",
    "AcDbBlockBegin",
    "2",
    "*MODEL_SPACE",
    "0",
    "ENDBLK",
    "5",
    nextHandle(handleGen),
    "100",
    "AcDbEntity",
    "100",
    "AcDbBlockEnd",
    "0",
    "BLOCK",
    "5",
    nextHandle(handleGen),
    "100",
    "AcDbEntity",
    "100",
    "AcDbBlockBegin",
    "2",
    "*PAPER_SPACE",
    "0",
    "ENDBLK",
    "5",
    nextHandle(handleGen),
    "100",
    "AcDbEntity",
    "100",
    "AcDbBlockEnd",
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "ENTITIES",
  );

  if (includeSheetOutline && sheetOutline.length >= 3) {
    pushLwpolyline(body, handleGen, layerName, sheetOutline);
  }

  for (const p of sheetplacements) {
    if (!p || typeof p.source !== "number") continue;
    const part = parts[p.source];
    const outline = part?.outline;
    if (!outline || outline.length < 3) continue;
    const rot = p.rotation ?? 0;
    const px = p.x ?? 0;
    const py = p.y ?? 0;
    const outerPlaced = placeOutline(outline, rot, px, py);
    pushLwpolyline(body, handleGen, layerName, outerPlaced);
    const holesPlaced = placeHoles(part.holes, rot, px, py);
    for (const hole of holesPlaced) {
      if (hole.length >= 3) {
        pushLwpolyline(body, handleGen, layerName, hole);
      }
    }

    if (includePartNames) {
      const name =
        part.filename?.trim() ||
        p.filename?.trim() ||
        `Part ${p.source + 1}`;
      const c = polygonCentroid(outerPlaced);
      const { w, h } = loopBBox(outerPlaced);
      const colW = Math.min(
        12,
        Math.max(2, Math.min(w, h) * 0.85, textHeight * (name.length > 20 ? 14 : 10)),
      );
      const wrapped = wrapPartNameForMtext(name, 28);
      pushMtext(
        body,
        handleGen,
        c.x,
        c.y,
        textHeight,
        rot,
        colW,
        wrapped,
        layerName,
      );
    }
  }

  body.push("0", "ENDSEC");
  pushObjectsSection(body, handleGen);
  const handSeed = nextHandle(handleGen);

  const header = [
    "0",
    "SECTION",
    "2",
    "HEADER",
    "9",
    "$ACADVER",
    "1",
    "AC1014",
    "9",
    "$INSUNITS",
    "70",
    "1", // inches
    "9",
    "$DWGCODEPAGE",
    "3",
    "ANSI_1252",
    "9",
    "$INSBASE",
    "10",
    "0.0",
    "20",
    "0.0",
    "9",
    "$EXTMIN",
    "10",
    "0.0",
    "20",
    "0.0",
    "9",
    "$EXTMAX",
    "10",
    dxfNum(sheetWidth),
    "20",
    dxfNum(sheetHeight),
    "9",
    "$HANDSEED",
    "5",
    handSeed,
    "0",
    "ENDSEC",
  ];

  return [...header, ...body, "0", "EOF"].join("\r\n");
}

export function nestDxfFilename(sheetIndex1Based: number): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `Nest_Sheet${sheetIndex1Based}_${stamp}.dxf`;
}
