import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import type { VendorRow } from "@/lib/vendorQueries";
import {
  DOCUMENT_KIND_ACCENT,
  DOCUMENT_KIND_LABEL,
  type DocumentLineItem,
  type OptionGroup,
  type ProjectDocumentDraftMeta,
  type ProjectDocumentKind,
} from "@/lib/documentTypes";
import {
  KEYSTONE_QUOTE_TERMS_BODY_FOR_PDF,
  KEYSTONE_QUOTE_TERMS_EFFECTIVE_DATE,
  KEYSTONE_QUOTE_TERMS_TITLE,
} from "@/lib/documents/keystoneQuoteTerms";

import {
  formatCompanyMultiline,
  formatPhysicalAddress,
  type CompanyBlock,
} from "@/lib/documents/company";
import { serializeRichTextForPdf } from "@/lib/documents/richTextSerializer";
import {
  formatRiversideDateLong,
  formatRiversideDateStampMdY,
} from "@/lib/documents/riversideTime";
import { buildHierarchicalItemNumbers } from "@/lib/documents/itemNumbering";

export type PdfProjectContext = {
  project_number: string;
  project_name: string | null;
  customer: string | null;
  customer_po: string | null;
};

export type PdfParty = {
  label: string;
  name: string;
  lines: string[];
};

/** Pre-resolved customer-facing strings for quote PDFs (set in compose). */
export type QuotePdfResolved = {
  paymentTerms: string;
  customerContact: string;
  accountManager: string;
  quoteDescription: string;
  shippingMethod: string;
};

export type BuildProjectDocumentPdfInput = {
  kind: ProjectDocumentKind;
  documentNumber: string;
  issuedDate: Date;
  company: CompanyBlock;
  logoDataUrl: string | null;
  project: PdfProjectContext;
  /** Shipper / “from” party (usually company); BOL packing may repeat company */
  fromParty: PdfParty;
  /** Customer, vendor, or consignee depending on doc */
  toParty: PdfParty;
  /** Optional second column under “to” (e.g. ship-to) */
  toPartySecondary?: PdfParty;
  meta: ProjectDocumentDraftMeta;
  /** Immutable document revision index (0-based). */
  revisionIndex?: number;
  quoteResolved?: QuotePdfResolved;
};

const MARGIN = 18;
const PAGE_W = 215.9;
const PAGE_H = 279.4;
const TERMS_LINE_HEIGHT = 3.5;
const FOOTER_GAP = 16;
const CONTENT_WIDTH = PAGE_W - 2 * MARGIN;
const CONTINUATION_NOTE = "Continues on next page";
const CONTINUED_FROM_PREFIX = "Continued from page ";
const TABLE_MARGIN = {
  left: MARGIN,
  right: MARGIN,
  top: MARGIN + 10,
  bottom: FOOTER_GAP + 8,
} as const;

export function normalizeRevisionIndex(revisionIndex?: number): number {
  if (typeof revisionIndex !== "number" || !Number.isFinite(revisionIndex)) {
    return 0;
  }
  return Math.max(0, Math.floor(revisionIndex));
}

export function formatRevisionSuffix(revisionIndex?: number): string {
  return `(v${normalizeRevisionIndex(revisionIndex)})`;
}

export function formatPdfJobRevLine(
  projectNumber: string,
  revisionIndex?: number,
): string {
  return `${projectNumber} REV. ${normalizeRevisionIndex(revisionIndex)}`;
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(n);
}

export async function fetchLogoDataUrl(kind?: ProjectDocumentKind): Promise<string | null> {
  try {
    void kind;
    const logoPaths = ["/main-logo.png"];
    for (const path of logoPaths) {
      const res = await fetch(path);
      if (!res.ok) continue;
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    }
    return null;
  } catch {
    return null;
  }
}

export function vendorToParty(v: VendorRow, label = "Vendor"): PdfParty {
  const lines: string[] = [];
  if (v.billing_line1) lines.push(v.billing_line1);
  if (v.billing_line2) lines.push(v.billing_line2);
  const cityLine = [v.billing_city, v.billing_state, v.billing_postal_code]
    .filter(Boolean)
    .join(", ");
  if (cityLine) lines.push(cityLine);
  if (v.billing_country) lines.push(v.billing_country);
  if (v.contact_name || v.contact_phone) {
    lines.push(
      [v.contact_name, v.contact_phone].filter(Boolean).join(" · "),
    );
  }
  return { label, name: v.legal_name, lines };
}

function partyBlockText(p: PdfParty): string {
  return [p.name, ...p.lines].filter(Boolean).join("\n");
}

type FlattenedDocumentLine = {
  line: DocumentLineItem;
  depth: number;
};

function sortLineNodeIndexes(indexes: number[], lines: DocumentLineItem[]): number[] {
  return indexes
    .slice()
    .sort((a, b) => {
      const lineNoDiff = lines[a].lineNo - lines[b].lineNo;
      if (lineNoDiff !== 0) return lineNoDiff;
      return a - b;
    });
}

function normalizeLineId(id: string | undefined): string | null {
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  return trimmed.length ? trimmed : null;
}

export function flattenDocumentLinesForPdf(lines: DocumentLineItem[]): FlattenedDocumentLine[] {
  if (!lines.length) return [];

  const byId = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const id = normalizeLineId(lines[i].id);
    if (id && !byId.has(id)) byId.set(id, i);
  }

  const childrenByParent = new Map<number, number[]>();
  const rootIndexes: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const parentId = normalizeLineId(lines[i].parentId ?? undefined);
    const ownId = normalizeLineId(lines[i].id);
    const parentIndex =
      parentId && parentId !== ownId ? byId.get(parentId) : undefined;

    if (parentIndex == null || parentIndex === i) {
      rootIndexes.push(i);
      continue;
    }

    const bucket = childrenByParent.get(parentIndex);
    if (bucket) {
      bucket.push(i);
    } else {
      childrenByParent.set(parentIndex, [i]);
    }
  }

  for (const [parentIndex, children] of childrenByParent.entries()) {
    childrenByParent.set(parentIndex, sortLineNodeIndexes(children, lines));
  }

  const sortedRoots = sortLineNodeIndexes(rootIndexes, lines);
  const flattened: FlattenedDocumentLine[] = [];
  const seen = new Set<number>();

  const visit = (index: number, depth: number, path: Set<number>) => {
    if (seen.has(index)) return;
    if (path.has(index)) return;

    path.add(index);
    seen.add(index);
    flattened.push({ line: lines[index], depth });

    const children = childrenByParent.get(index) ?? [];
    for (const childIndex of children) {
      visit(childIndex, depth + 1, path);
    }

    path.delete(index);
  };

  for (const rootIndex of sortedRoots) {
    visit(rootIndex, 0, new Set<number>());
  }

  const allIndexes = sortLineNodeIndexes(
    lines.map((_, index) => index),
    lines,
  );
  for (const index of allIndexes) {
    if (!seen.has(index)) {
      // Unvisited nodes usually indicate a parent cycle; treat as a fresh root.
      visit(index, 0, new Set<number>());
    }
  }

  return flattened;
}

function descriptionLinesFromRich(line: DocumentLineItem): string[] {
  if (!line.descriptionRich) {
    return [line.description];
  }
  const serialized = serializeRichTextForPdf(line.descriptionRich);
  if (serialized.blocks.length === 0) {
    return [line.description];
  }
  const lines: string[] = [];
  for (const block of serialized.blocks) {
    if (block.type === "paragraph") {
      lines.push(block.segments.map((segment) => segment.text).join(""));
      continue;
    }
    for (const item of block.items) {
      lines.push(`• ${item.segments.map((segment) => segment.text).join("")}`);
    }
  }
  return lines.length ? lines : [line.description];
}

type PdfRgbTuple = [number, number, number];

type DescriptionRichStyle = {
  fontStyle: "normal" | "bold" | "italic" | "bolditalic";
  textColor?: PdfRgbTuple;
  fillColor?: PdfRgbTuple;
};

function parseCssHexColor(value: string | undefined): PdfRgbTuple | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  const shortHex = normalized.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split("").map((char) => parseInt(`${char}${char}`, 16));
    return [r, g, b];
  }
  const longHex = normalized.match(/^#([0-9a-f]{6})$/i);
  if (longHex) {
    const raw = longHex[1];
    return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
  }
  return null;
}

function descriptionStyleFromRich(line: DocumentLineItem): DescriptionRichStyle | null {
  if (!line.descriptionRich) return null;
  const serialized = serializeRichTextForPdf(line.descriptionRich);
  if (!serialized.blocks.length) return null;

  let hasBold = false;
  let hasItalic = false;
  let textColor: PdfRgbTuple | null = null;
  let highlightColor: PdfRgbTuple | null = null;

  for (const block of serialized.blocks) {
    const segments = block.type === "paragraph" ? block.segments : block.items.flatMap((item) => item.segments);
    for (const segment of segments) {
      for (const mark of segment.marks) {
        if (mark.kind === "bold") hasBold = true;
        if (mark.kind === "italic") hasItalic = true;
        if (mark.kind === "color" && textColor == null) {
          textColor = parseCssHexColor(mark.value);
        }
        if (mark.kind === "highlight" && highlightColor == null) {
          highlightColor = parseCssHexColor(mark.value) ?? [255, 245, 157];
        }
      }
    }
  }

  const fontStyle: DescriptionRichStyle["fontStyle"] = hasBold
    ? hasItalic
      ? "bolditalic"
      : "bold"
    : hasItalic
      ? "italic"
      : "normal";

  if (fontStyle === "normal" && !textColor && !highlightColor) {
    return null;
  }
  return {
    fontStyle,
    textColor: textColor ?? undefined,
    fillColor: highlightColor ?? undefined,
  };
}

function formatDescriptionForPdf(line: DocumentLineItem, depth: number, _maxLength: number): string {
  void _maxLength;
  const prefix = depth > 0 ? `${"  ".repeat(depth)}` : "";
  return descriptionLinesFromRich(line)
    .map((lineText) => `${prefix}${lineText}`)
    .join("\n");
}

function addLineLinkForTableCell(
  doc: jsPDF,
  data: { cell: { x: number; y: number; width: number; height: number } },
  lineNo: number | null,
): void {
  if (!lineNo || lineNo <= 0) return;
  doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, {
    url: `docline:${lineNo}`,
  });
}

export type QuoteLineSectionRow = FlattenedDocumentLine & {
  displayItemNo: string;
};

export type QuoteLineSection = {
  id: string;
  title: string;
  rows: QuoteLineSectionRow[];
};

export function quoteLineSectionColumnStyles(): Record<number, { cellWidth: number; halign?: "right" }> {
  const itemColWidth = 16;
  const partColWidth = 40;
  const totalColWidth = 30;
  return {
    0: { cellWidth: itemColWidth },
    1: { cellWidth: partColWidth },
    2: { cellWidth: CONTENT_WIDTH - itemColWidth - partColWidth - totalColWidth },
    3: { cellWidth: totalColWidth, halign: "right" },
  };
}

export function optionModeLineColumnStyles(): Record<number, { cellWidth: number; halign?: "right" }> {
  return {
    0: { cellWidth: 12 },
    1: { cellWidth: 18 },
    2: { cellWidth: 66 },
    3: { cellWidth: 14 },
    4: { cellWidth: 14 },
    5: { cellWidth: 18, halign: "right" },
    6: { cellWidth: 18, halign: "right" },
  };
}

function wrapTextForPdfCell(text: string, maxCharsPerRow: number): string[] {
  const normalized = (text ?? "").replace(/\r/g, "");
  if (!normalized.length) return [""];
  const rows: string[] = [];
  for (const sourceLine of normalized.split("\n")) {
    if (!sourceLine.length) {
      rows.push("");
      continue;
    }
    let cursor = sourceLine;
    while (cursor.length > maxCharsPerRow) {
      rows.push(cursor.slice(0, maxCharsPerRow));
      cursor = cursor.slice(maxCharsPerRow);
    }
    rows.push(cursor);
  }
  return rows.length ? rows : [""];
}

function wrapTextToPdfWidth(doc: jsPDF, text: string, maxWidth: number): string[] {
  const normalized = (text ?? "").replace(/\r/g, "");
  if (!normalized.length) return [""];
  const lines = doc.splitTextToSize(normalized, Math.max(1, maxWidth));
  if (!Array.isArray(lines) || lines.length === 0) return [""];
  return lines.map((line) => String(line));
}

type QuoteTableRowPayload = {
  itemNo: string;
  partNo: string;
  description: string;
  total: string;
  lineNo: number;
  descriptionIndentPrefix?: string;
};

export function expandQuoteTableRowsForOverflow(
  rows: QuoteTableRowPayload[],
  partMaxChars = 20,
  descriptionMaxChars = 72,
  partWrapFn?: (text: string) => string[],
  descriptionWrapFn?: (text: string) => string[],
): { body: string[][]; lineNos: number[] } {
  const body: string[][] = [];
  const lineNos: number[] = [];
  for (const row of rows) {
    const partRows = partWrapFn
      ? partWrapFn(row.partNo)
      : wrapTextForPdfCell(row.partNo, partMaxChars);
    const wrappedDescriptionRows = descriptionWrapFn
      ? descriptionWrapFn(row.description)
      : wrapTextForPdfCell(row.description, descriptionMaxChars);
    const descriptionRows = wrappedDescriptionRows.map((line) =>
      `${row.descriptionIndentPrefix ?? ""}${line}`,
    );
    const maxRows = Math.max(partRows.length, descriptionRows.length);
    for (let idx = 0; idx < maxRows; idx += 1) {
      body.push([
        idx === 0 ? row.itemNo : "",
        partRows[idx] ?? "",
        descriptionRows[idx] ?? "",
        idx === 0 ? row.total : "",
      ]);
      lineNos.push(row.lineNo);
    }
  }
  return { body, lineNos };
}

type OptionModeTableRowPayload = {
  itemNo: string;
  partNo: string;
  description: string;
  qty: string;
  uom: string;
  unitPrice: string;
  extPrice: string;
  lineNo: number;
  descriptionIndentPrefix?: string;
};

export function expandOptionModeRowsForOverflow(
  rows: OptionModeTableRowPayload[],
  partMaxChars = 20,
  descriptionMaxChars = 62,
  partWrapFn?: (text: string) => string[],
  descriptionWrapFn?: (text: string) => string[],
): { body: string[][]; lineNos: number[] } {
  const body: string[][] = [];
  const lineNos: number[] = [];
  for (const row of rows) {
    const partRows = partWrapFn
      ? partWrapFn(row.partNo)
      : wrapTextForPdfCell(row.partNo, partMaxChars);
    const wrappedDescriptionRows = descriptionWrapFn
      ? descriptionWrapFn(row.description)
      : wrapTextForPdfCell(row.description, descriptionMaxChars);
    const descriptionRows = wrappedDescriptionRows.map((line) =>
      `${row.descriptionIndentPrefix ?? ""}${line}`,
    );
    const maxRows = Math.max(partRows.length, descriptionRows.length);
    for (let idx = 0; idx < maxRows; idx += 1) {
      body.push([
        idx === 0 ? row.itemNo : "",
        partRows[idx] ?? "",
        descriptionRows[idx] ?? "",
        idx === 0 ? row.qty : "",
        idx === 0 ? row.uom : "",
        idx === 0 ? row.unitPrice : "",
        idx === 0 ? row.extPrice : "",
      ]);
      lineNos.push(row.lineNo);
    }
  }
  return { body, lineNos };
}

export function buildQuoteLineSections(
  lines: DocumentLineItem[],
  optionGroups: OptionGroup[],
): QuoteLineSection[] {
  const groupSet = new Set(optionGroups.map((group) => group.id));
  const baseLines = lines.filter((line) => !line.optionGroupId || !groupSet.has(line.optionGroupId));
  const baseRows = flattenDocumentLinesForPdf(baseLines);
  const baseItemNos = buildHierarchicalItemNumbers(baseRows.map((entry) => entry.depth));
  const sections: QuoteLineSection[] = [
    {
      id: "base-scope",
      title: "BASE SCOPE",
      rows: baseRows.map((row, index) => ({
        ...row,
        displayItemNo: baseItemNos[index],
      })),
    },
  ];
  for (const group of optionGroups) {
    const groupLines = lines.filter((line) => line.optionGroupId === group.id);
    const groupRows = flattenDocumentLinesForPdf(groupLines);
    const groupItemNos = buildHierarchicalItemNumbers(groupRows.map((entry) => entry.depth));
    sections.push({
      id: group.id,
      title: `OPTION: ${(group.title || "Option").toUpperCase()}`,
      rows: groupRows.map((row, index) => ({
        ...row,
        displayItemNo: groupItemNos[index],
      })),
    });
  }
  return sections;
}

type ReferenceFigureItem = {
  displayItemNo: string;
  sectionLabel: string;
  dataUrl: string;
};

function imageFormatFromDataUrl(dataUrl: string): "PNG" | "JPEG" {
  const prefix = dataUrl.slice(0, 32).toLowerCase();
  if (prefix.includes("image/png")) return "PNG";
  return "JPEG";
}

function collectReferenceFigureItems(
  lines: DocumentLineItem[],
  optionGroups: OptionGroup[],
): ReferenceFigureItem[] {
  const grouped = buildQuoteLineSections(lines, optionGroups);
  return grouped
    .flatMap((section) =>
      section.rows.map(({ line, displayItemNo }) => ({
        line,
        displayItemNo,
        sectionLabel: section.title,
      })),
    )
    .map(({ line, displayItemNo, sectionLabel }) => {
      const dataUrl = line.imageRef?.dataUrl;
      if (!dataUrl || !dataUrl.startsWith("data:image/")) return null;
      return {
        displayItemNo,
        sectionLabel: line.optionGroupId ? sectionLabel : "BASE SCOPE",
        dataUrl,
      } as ReferenceFigureItem;
    })
    .filter((item): item is ReferenceFigureItem => Boolean(item));
}

function collectReferenceFigureItemsForSectionRows(
  rows: QuoteLineSectionRow[],
  sectionLabel: string,
): ReferenceFigureItem[] {
  return rows
    .map(({ line, displayItemNo }) => {
      const dataUrl = line.imageRef?.dataUrl;
      if (!dataUrl || !dataUrl.startsWith("data:image/")) return null;
      return {
        displayItemNo,
        sectionLabel,
        dataUrl,
      } as ReferenceFigureItem;
    })
    .filter((item): item is ReferenceFigureItem => Boolean(item));
}

function renderReferenceFigureBlock(
  doc: jsPDF,
  y: number,
  figures: ReferenceFigureItem[],
): number {
  if (figures.length === 0) return y;
  const available = figures.slice(0, 8);
  const figureWidth = 40;
  const figureHeight = 28;
  const rowGap = 8;
  const colGap = 10;
  const maxY = PAGE_H - FOOTER_GAP - 8;

  const ensureSpace = (requiredHeight: number) => {
    if (y + requiredHeight <= maxY) return;
    doc.addPage();
    y = MARGIN;
  };

  ensureSpace(8);
  doc.setFontSize(9);
  doc.setTextColor(50, 50, 50);
  doc.text("Reference figures", MARGIN, y);
  y += 4;

  for (let rowStart = 0; rowStart < available.length; rowStart += 2) {
    const rowItems = available.slice(rowStart, rowStart + 2);
    ensureSpace(figureHeight + rowGap + 6);
    rowItems.forEach((item, columnIndex) => {
      const x = MARGIN + columnIndex * (figureWidth + colGap);
      doc.setDrawColor(180, 180, 180);
      doc.rect(x, y, figureWidth, figureHeight);
      try {
        doc.addImage(
          item.dataUrl,
          imageFormatFromDataUrl(item.dataUrl),
          x + 1,
          y + 1,
          figureWidth - 2,
          figureHeight - 2,
          undefined,
          "FAST",
        );
      } catch {
        doc.setFontSize(7);
        doc.setTextColor(120, 120, 120);
        doc.text("Image unavailable", x + 3, y + figureHeight / 2);
      }
      doc.setFontSize(7);
      doc.setTextColor(70, 70, 70);
      const caption = `L${item.displayItemNo} - ${item.sectionLabel}`;
      doc.text(caption.slice(0, 38), x, y + figureHeight + 3);
    });
    y += figureHeight + rowGap;
  }

  if (figures.length > available.length) {
    doc.setFontSize(7);
    doc.setTextColor(110, 110, 110);
    doc.text(
      `+${figures.length - available.length} more reference image(s)`,
      MARGIN,
      y,
    );
    y += 4;
  }
  return y + 2;
}

type FooterKind = "default" | "quote_cover" | "quote_terms";

function drawFooter(doc: jsPDF, page: number, total: number, footerKind: FooterKind): void {
  doc.setFontSize(6);
  doc.setTextColor(100, 100, 100);
  let disclaimer: string;
  if (footerKind === "quote_cover") {
    disclaimer =
      "SEE ATTACHED TERMS AND CONDITIONS. AN ADDITIONAL COPY OR FURTHER DETAILS CAN BE PROVIDED UPON REQUEST.";
  } else if (footerKind === "quote_terms") {
    disclaimer = "";
  } else {
    disclaimer =
      "Commercial document — subject to Keystone Supply | Keystone Industrial standard terms. Quantities and pricing exclude tax unless noted.";
  }
  if (disclaimer) {
    doc.text(disclaimer, MARGIN, PAGE_H - 14, { maxWidth: PAGE_W - 2 * MARGIN });
  }
  doc.text(`Page ${page} of ${total}`, PAGE_W - MARGIN, PAGE_H - 10, {
    align: "right",
  });
  doc.setTextColor(0, 0, 0);
}

type CondensedHeaderInput = {
  logoDataUrl: string | null;
  title: string;
  projectNumber: string;
  revisionIndex?: number;
  documentNumber: string;
  issuedDate: Date;
  continuedFromPage: number;
};

function drawCondensedContinuationHeader(
  doc: jsPDF,
  accent: [number, number, number],
  input: CondensedHeaderInput,
): void {
  const y = 9;
  doc.setDrawColor(220, 220, 220);
  doc.line(MARGIN, y + 10, PAGE_W - MARGIN, y + 10);

  if (input.logoDataUrl) {
    try {
      doc.addImage(input.logoDataUrl, "PNG", MARGIN, y - 1, 22, 10);
    } catch {
      /* ignore bad image */
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.text(input.title.toUpperCase(), PAGE_W - MARGIN, y + 1, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(60, 60, 60);
  doc.text(
    `${formatPdfJobRevLine(input.projectNumber, input.revisionIndex)}  •  Doc No. ${input.documentNumber}`,
    PAGE_W - MARGIN,
    y + 5,
    { align: "right" },
  );
  doc.text(
    `Date: ${formatRiversideDateLong(input.issuedDate)}  •  ${CONTINUED_FROM_PREFIX}${input.continuedFromPage}`,
    PAGE_W - MARGIN,
    y + 8.5,
    { align: "right" },
  );
  doc.setTextColor(0, 0, 0);
}

function drawContinuationNoteAboveFooter(doc: jsPDF): void {
  doc.setFontSize(7);
  doc.setTextColor(85, 85, 85);
  doc.text(CONTINUATION_NOTE, PAGE_W - MARGIN, PAGE_H - FOOTER_GAP - 2.5, {
    align: "right",
  });
  doc.setTextColor(0, 0, 0);
}

function annotateFirstPageContinuation(
  doc: jsPDF,
  accent: [number, number, number],
  input: CondensedHeaderInput,
  pageCount: number,
): void {
  if (pageCount <= 1) return;
  doc.setPage(1);
  drawContinuationNoteAboveFooter(doc);
  doc.setPage(2);
  drawCondensedContinuationHeader(doc, accent, input);
}

function appendQuoteTermsPages(doc: jsPDF, accent: [number, number, number]): void {
  doc.addPage();
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(0, 0, PAGE_W, 5, "F");
  doc.setFillColor(255, 255, 255);

  let y = MARGIN + 4;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(25, 25, 25);
  doc.text(KEYSTONE_QUOTE_TERMS_TITLE, MARGIN, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(70, 70, 70);
  doc.text(`Effective Date: ${KEYSTONE_QUOTE_TERMS_EFFECTIVE_DATE}`, MARGIN, y);
  y += 5;
  doc.setFontSize(5);
  doc.setTextColor(25, 25, 25);
  const maxW = PAGE_W - 2 * MARGIN;
  const blocks = KEYSTONE_QUOTE_TERMS_BODY_FOR_PDF.split(/\n\n+/);
  for (const block of blocks) {
    const chunk = block.trim();
    if (!chunk) continue;
    const lines = doc.splitTextToSize(chunk, maxW);
    for (const line of lines) {
      if (y > PAGE_H - FOOTER_GAP) {
        doc.addPage();
        doc.setFillColor(accent[0], accent[1], accent[2]);
        doc.rect(0, 0, PAGE_W, 5, "F");
        doc.setFillColor(255, 255, 255);
        y = MARGIN;
      }
      doc.text(line, MARGIN, y);
      y += TERMS_LINE_HEIGHT;
    }
    y += 1.5;
  }
}

function defaultQuoteResolved(
  input: BuildProjectDocumentPdfInput,
): QuotePdfResolved {
  const projName = (input.project.project_name ?? "").trim();
  return {
    quoteDescription:
      input.meta.quoteDescription?.trim() ||
      (projName ? projName.toUpperCase() : "PROJECT"),
    shippingMethod:
      input.meta.shippingMethod?.trim() ||
      input.meta.freightTerms?.trim() ||
      "",
    paymentTerms: input.meta.paymentTerms?.trim() || "",
    customerContact: input.meta.customerContactDisplay?.trim() || "",
    accountManager: input.meta.accountManagerDisplay?.trim() || "",
  };
}

function buildQuoteDocumentPdf(input: BuildProjectDocumentPdfInput): ArrayBuffer {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const accent = DOCUMENT_KIND_ACCENT.quote;
  const qr = input.quoteResolved ?? defaultQuoteResolved(input);
  const compact = true;

  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(0, 0, PAGE_W, 5, "F");
  doc.setFillColor(255, 255, 255);

  let y = MARGIN + 2;

  if (input.logoDataUrl) {
    try {
      doc.addImage(input.logoDataUrl, "PNG", MARGIN, y, 42, 20);
    } catch {
      /* ignore bad image */
    }
  }

  doc.setFontSize(8);
  doc.setTextColor(55, 55, 55);
  const companyText = formatCompanyMultiline(input.company);
  const companyY = input.logoDataUrl ? y + 27 : y + 4;
  doc.text(companyText.split("\n"), MARGIN, companyY, {
    lineHeightFactor: 1.15,
  });
  const titleY = y + 7;
  const jobRevY = titleY + 8;
  const docNoY = jobRevY + 5.5;
  const dateY = docNoY + 5.5;

  doc.setFontSize(19);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.text("QUOTATION", PAGE_W - MARGIN, titleY, { align: "right" });

  doc.setFontSize(17);
  doc.setTextColor(30, 30, 30);
  doc.text(
    formatPdfJobRevLine(
      input.project.project_number,
      input.revisionIndex,
    ),
    PAGE_W - MARGIN,
    jobRevY,
    { align: "right" },
  );
  doc.setFont("helvetica", "normal");

  doc.setFontSize(9);
  doc.setTextColor(45, 45, 45);
  doc.text(`Doc No. ${input.documentNumber}`, PAGE_W - MARGIN, docNoY, { align: "right" });
  doc.setFontSize(8);
  doc.setTextColor(40, 40, 40);
  doc.text(`Date: ${formatRiversideDateLong(input.issuedDate)}`, PAGE_W - MARGIN, dateY, {
    align: "right",
  });
  y = Math.max(companyY + 20, dateY + 1.5, MARGIN + 32);

  if (input.meta.validUntil) {
    doc.setFontSize(compact ? 7 : 8);
    doc.setTextColor(90, 90, 90);
    doc.text(`Valid through: ${input.meta.validUntil}`, PAGE_W - MARGIN, y, {
      align: "right",
    });
    y += compact ? 3 : 4;
  }

  y += compact ? 2 : 4;
  doc.setDrawColor(220, 220, 220);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += compact ? 4 : 5;

  const colW = (PAGE_W - 2 * MARGIN - 8) / 2;
  doc.setFontSize(compact ? 6 : 8);
  doc.setTextColor(120, 120, 120);
  doc.text(input.toParty.label.toUpperCase(), MARGIN, y);
  if (input.toPartySecondary) {
    doc.text(input.toPartySecondary.label.toUpperCase(), MARGIN + colW + 8, y);
  }
  y += compact ? 3 : 4;
  doc.setFontSize(compact ? 7 : 9);
  doc.setTextColor(30, 30, 30);
  doc.text(partyBlockText(input.toParty).split("\n"), MARGIN, y, {
    lineHeightFactor: compact ? 1.05 : 1.2,
  });
  if (input.toPartySecondary) {
    doc.text(
      partyBlockText(input.toPartySecondary).split("\n"),
      MARGIN + colW + 8,
      y,
      { lineHeightFactor: compact ? 1.05 : 1.2 },
    );
  }

  const partyRows = Math.max(
    input.toParty.lines.length + 2,
    input.toPartySecondary ? input.toPartySecondary.lines.length + 2 : 2,
  );
  y += Math.max(partyRows * (compact ? 3.15 : 4.2), compact ? 14 : 16);

  y += compact ? 2 : 3;
  doc.setFontSize(compact ? 6 : 8);
  doc.setTextColor(120, 120, 120);
  doc.text("QUOTE DESCRIPTION", MARGIN, y);
  doc.text("SHIPPING METHOD", MARGIN + colW + 8, y);
  y += compact ? 3 : 4;
  doc.setFontSize(compact ? 7 : 9);
  doc.setTextColor(35, 35, 35);
  const qDesc = doc.splitTextToSize(qr.quoteDescription, colW - 2);
  doc.text(qDesc, MARGIN, y);
  const shipM = doc.splitTextToSize(
    qr.shippingMethod || "—",
    colW - 2,
  );
  doc.text(shipM, MARGIN + colW + 8, y);
  y += Math.max(qDesc.length, shipM.length) * (compact ? 2.8 : 3.6) + (compact ? 3 : 4);

  y += compact ? 1 : 2;

  const quoteSections = buildQuoteLineSections(
    input.meta.lines,
    input.meta.optionGroups ?? [],
  );
  const showSectionSubtotals = quoteSections.length > 1;
  const subtotalTopGap = compact ? 2 : 3;
  const noteTopGap = compact ? 7 : 10;
  let subtotal = 0;
  for (const section of quoteSections) {
    doc.setFontSize(compact ? 7 : 8);
    doc.setTextColor(85, 85, 85);
    doc.text(section.title, MARGIN, y);
    y += compact ? 2.5 : 3;

    const tableRows = section.rows.map(({ line, depth, displayItemNo }) => ({
      itemNo: `${"  ".repeat(depth)}${displayItemNo}`,
      partNo: line.partRef?.trim() ? line.partRef.trim() : "—",
      description: formatDescriptionForPdf(line, 0, 100),
      total: fmtMoney(line.extended),
      lineNo: line.lineNo,
      descriptionIndentPrefix: "  ".repeat(depth),
    }));
    const quoteColumns = quoteLineSectionColumnStyles();
    const quoteBodyFontSize = compact ? 6 : 8;
    const quoteCellPadding = compact ? 1.2 : 2;
    doc.setFontSize(quoteBodyFontSize);
    const expandedRows = expandQuoteTableRowsForOverflow(
      tableRows,
      20,
      72,
      (value) => wrapTextToPdfWidth(doc, value, quoteColumns[1].cellWidth - quoteCellPadding * 2),
      (value) => wrapTextToPdfWidth(doc, value, quoteColumns[2].cellWidth - quoteCellPadding * 2),
    );
    const body = expandedRows.body;
    const sectionLineNos = expandedRows.lineNos;
    const sectionLineStyles = new Map(
      section.rows.map(({ line }) => [line.lineNo, descriptionStyleFromRich(line)]),
    );
    if (body.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["ITEM #", "PART #", "DESCRIPTION", "TOTAL"]],
        body,
        margin: TABLE_MARGIN,
        styles: { fontSize: quoteBodyFontSize, cellPadding: quoteCellPadding },
        columnStyles: quoteColumns,
        headStyles: {
          fillColor: [accent[0], accent[1], accent[2]],
          textColor: [255, 255, 255],
          fontSize: compact ? 6 : 8,
          cellPadding: compact ? 1 : 2,
        },
        didParseCell: (data) => {
          if (data.section !== "body" || data.column.index !== 2) return;
          const lineNo = sectionLineNos[data.row.index] ?? null;
          if (!lineNo) return;
          const richStyle = sectionLineStyles.get(lineNo);
          if (!richStyle) return;
          data.cell.styles.fontStyle = richStyle.fontStyle;
          if (richStyle.textColor) data.cell.styles.textColor = richStyle.textColor;
          if (richStyle.fillColor) data.cell.styles.fillColor = richStyle.fillColor;
        },
        didDrawCell: (data) => {
          if (data.section !== "body" || data.column.index !== 2) return;
          addLineLinkForTableCell(doc, data, sectionLineNos[data.row.index] ?? null);
        },
      });
      const tableSlot = doc as jsPDF & { lastAutoTable?: { finalY: number } };
      y = (tableSlot.lastAutoTable?.finalY ?? y) + (compact ? 2 : 3);
    } else {
      doc.setFontSize(compact ? 6 : 8);
      doc.setTextColor(120, 120, 120);
      doc.text("No line items in this section.", MARGIN, y + 1.5);
      y += compact ? 4 : 5;
    }

    const sectionSubtotal = section.rows.reduce((sum, row) => sum + (row.line.extended || 0), 0);
    subtotal += sectionSubtotal;
    if (showSectionSubtotals) {
      y += subtotalTopGap;
      doc.setFontSize(compact ? 7 : 8);
      doc.setTextColor(55, 55, 55);
      doc.text(section.id === "base-scope" ? "SUBTOTAL" : "OPTION SUBTOTAL", PAGE_W - MARGIN - 44, y, {
        align: "right",
      });
      doc.text(fmtMoney(sectionSubtotal), PAGE_W - MARGIN, y, { align: "right" });
      y += compact ? 4 : 6;
    }

    const sectionFigures = collectReferenceFigureItemsForSectionRows(section.rows, section.title);
    y = renderReferenceFigureBlock(doc, y, sectionFigures);
  }

  const labelX = PAGE_W - MARGIN - 44;
  const amtX = PAGE_W - MARGIN;
  const presentAsMultipleOptions =
    Boolean(input.meta.quotePresentAsMultipleOptions) &&
    (input.meta.optionGroups?.length ?? 0) > 0;

  if (presentAsMultipleOptions) {
    y += noteTopGap;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(50, 50, 50);
    doc.text("CUSTOMER TO SELECT OPTION", MARGIN, y);
    y += 4.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text("Totals are shown per section above. No single grand total is presented.", MARGIN, y);
    y += 6;
  } else {
    y += compact ? 6 : 8;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(40, 40, 40);
    doc.text("SUBTOTAL", labelX, y, { align: "right" });
    doc.text(fmtMoney(subtotal), amtX, y, { align: "right" });
    y += 5;

    let running = subtotal;
    const meta = input.meta;
    const taxPct = meta.quotePdfTaxRatePct;
    const taxAmt = meta.quotePdfTaxAmount;

    if (taxPct != null && Number.isFinite(taxPct)) {
      doc.text(`(TAX RATE) ${taxPct}%`, labelX, y, { align: "right" });
      y += 5;
    }
    if (taxAmt != null && Number.isFinite(taxAmt)) {
      doc.text("TAX", labelX, y, { align: "right" });
      doc.text(fmtMoney(taxAmt), amtX, y, { align: "right" });
      running += taxAmt;
      y += 5;
    }

    const logAmt = meta.quotePdfLogisticsAmount;
    if (logAmt != null && Number.isFinite(logAmt)) {
      doc.text("LOGISTICS", labelX, y, { align: "right" });
      doc.text(fmtMoney(logAmt), amtX, y, { align: "right" });
      running += logAmt;
      y += 5;
    }

    const otherAmt = meta.quotePdfOtherAmount;
    if (otherAmt != null && Number.isFinite(otherAmt)) {
      doc.text("OTHER", labelX, y, { align: "right" });
      doc.text(fmtMoney(otherAmt), amtX, y, { align: "right" });
      running += otherAmt;
      y += 5;
    }

    y += compact ? 6 : 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("TOTAL", labelX, y, { align: "right" });
    doc.text(fmtMoney(running), amtX, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 8;
  }

  if (!presentAsMultipleOptions) {
    y += noteTopGap;
  }
  doc.setFontSize(8);
  doc.setTextColor(45, 45, 45);
  if (qr.paymentTerms.trim()) {
    doc.text(`PAYMENT TERMS — ${qr.paymentTerms}`, MARGIN, y);
    y += 4;
  }
  const lead = input.meta.leadTime?.trim() ?? "";
  const parts: string[] = [];
  if (lead) parts.push(`Lead time (following P.O.): ${lead}`);
  if (qr.customerContact.trim()) parts.push(`Customer contact: ${qr.customerContact}`);
  if (parts.length) {
    const line = doc.splitTextToSize(parts.join("    •    "), PAGE_W - 2 * MARGIN);
    doc.text(line, MARGIN, y);
    y += line.length * 3.5 + 2;
  }
  if (qr.accountManager.trim()) {
    doc.text(`ACCOUNT MANAGER: ${qr.accountManager}`, MARGIN, y);
    y += 5;
  }

  if (input.meta.notes?.trim()) {
    y += 2;
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    doc.text("Notes:", MARGIN, y);
    y += 4;
    doc.setFontSize(8);
    const noteLines = doc.splitTextToSize(
      input.meta.notes.trim(),
      PAGE_W - 2 * MARGIN,
    );
    doc.text(noteLines, MARGIN, y);
    y += noteLines.length * 3.5 + 4;
  }

  const quoteBodyPageCount = doc.getNumberOfPages();
  annotateFirstPageContinuation(
    doc,
    accent,
    {
      logoDataUrl: input.logoDataUrl,
      title: "Quotation",
      projectNumber: input.project.project_number,
      revisionIndex: input.revisionIndex,
      documentNumber: input.documentNumber,
      issuedDate: input.issuedDate,
      continuedFromPage: 1,
    },
    quoteBodyPageCount,
  );

  appendQuoteTermsPages(doc, accent);

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const fk: FooterKind =
      i === 1 ? "quote_cover" : "quote_terms";
    drawFooter(doc, i, totalPages, fk);
  }

  return doc.output("arraybuffer");
}

export function buildProjectDocumentPdf(input: BuildProjectDocumentPdfInput): ArrayBuffer {
  const flattenedLines = flattenDocumentLinesForPdf(input.meta.lines);

  if (input.kind === "quote") {
    return buildQuoteDocumentPdf(input);
  }

  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const accent = DOCUMENT_KIND_ACCENT.quote;
  const title = DOCUMENT_KIND_LABEL[input.kind];

  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(0, 0, PAGE_W, 5, "F");
  doc.setFillColor(255, 255, 255);

  let y = MARGIN + 2;

  if (input.logoDataUrl) {
    try {
      doc.addImage(input.logoDataUrl, "PNG", MARGIN, y, 42, 20);
    } catch {
      /* ignore bad image */
    }
  }

  doc.setTextColor(55, 55, 55);
  const companyText = formatCompanyMultiline(input.company);
  let rfqDateBaselineY: number | null = null;
  doc.setFontSize(8);
  const companyY = input.logoDataUrl ? y + 27 : y + 4;
  doc.text(companyText.split("\n"), MARGIN, companyY, {
    lineHeightFactor: 1.15,
  });
  const titleY = y + 7;
  const jobRevY = titleY + 8;
  const docNoY = jobRevY + 5.5;
  const dateY = docNoY + 5.5;

  doc.setFontSize(19);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.text(title.toUpperCase(), PAGE_W - MARGIN, titleY, { align: "right" });

  doc.setFontSize(17);
  doc.setTextColor(30, 30, 30);
  doc.text(
    formatPdfJobRevLine(
      input.project.project_number,
      input.revisionIndex,
    ),
    PAGE_W - MARGIN,
    jobRevY,
    { align: "right" },
  );
  doc.setFont("helvetica", "normal");

  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text(`Doc No. ${input.documentNumber}`, PAGE_W - MARGIN, docNoY, {
    align: "right",
  });

  doc.setFontSize(8);
  doc.text(`Date: ${formatRiversideDateLong(input.issuedDate)}`, PAGE_W - MARGIN, dateY, {
    align: "right",
  });
  rfqDateBaselineY = dateY;
  y = Math.max(companyY + 20, dateY + 1.5, MARGIN + 32);

  if (input.meta.responseDue && input.kind === "rfq") {
    const responseY = (rfqDateBaselineY ?? y) + 2.5;
    doc.setFontSize(8);
    doc.setTextColor(40, 40, 40);
    doc.text(`Response requested by: ${input.meta.responseDue}`, PAGE_W - MARGIN, responseY, {
      align: "right",
    });
    y = Math.max(y, responseY + 2);
  }

  const rfqCompact = true;

  y += rfqCompact ? 0 : 1;
  doc.setDrawColor(220, 220, 220);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += rfqCompact ? 4 : 6;

  const colW = (PAGE_W - 2 * MARGIN - 8) / 2;
  const invoiceDualParty = input.kind === "invoice" && !!input.toPartySecondary;
  doc.setFontSize(rfqCompact ? 6 : 8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    (invoiceDualParty ? input.toParty.label : input.fromParty.label).toUpperCase(),
    MARGIN,
    y,
  );
  doc.text(
    (invoiceDualParty ? input.toPartySecondary?.label : input.toParty.label)?.toUpperCase() ??
      "",
    MARGIN + colW + 8,
    y,
  );
  y += rfqCompact ? 3 : 4;
  doc.setFontSize(rfqCompact ? 7 : 9);
  doc.setTextColor(30, 30, 30);

  // Use physical address + "REQUESTING" label for RFQ and Purchase Order;
  // "SELLER" + physical for BOL/Invoice/Packing List; mailing address for quotes.
  // Matches company.ts intent for physical/ship-from on PO/RFQ.
  const fromText =
    input.kind === "bol" ||
    input.kind === "invoice" ||
    input.kind === "packing_list" ||
    input.kind === "rfq" ||
    input.kind === "purchase_order"
      ? formatPhysicalAddress(input.company)
      : partyBlockText(input.fromParty);

  const leftBlockText = invoiceDualParty ? partyBlockText(input.toParty) : fromText;
  const rightBlockText = invoiceDualParty
    ? partyBlockText(input.toPartySecondary as PdfParty)
    : partyBlockText(input.toParty);

  doc.text(leftBlockText.split("\n"), MARGIN, y, {
    lineHeightFactor: rfqCompact ? 1.05 : 1.2,
  });
  doc.text(rightBlockText.split("\n"), MARGIN + colW + 8, y, {
    lineHeightFactor: rfqCompact ? 1.05 : 1.2,
  });

  const leftPartyRows = invoiceDualParty
    ? input.toParty.lines.length + 2
    : input.fromParty.lines.length + 2;
  const rightPartyRows = invoiceDualParty
    ? (input.toPartySecondary?.lines.length ?? 0) + 2
    : input.toParty.lines.length + 2;
  y += Math.max(
    leftPartyRows * (rfqCompact ? 3.15 : 4.2),
    rightPartyRows * (rfqCompact ? 3.15 : 4.2),
    rfqCompact ? 14 : 18,
  );

  if (input.toPartySecondary && !invoiceDualParty) {
    doc.setFontSize(rfqCompact ? 6 : 8);
    doc.setTextColor(120, 120, 120);
    doc.text(input.toPartySecondary.label.toUpperCase(), MARGIN + colW + 8, y);
    y += rfqCompact ? 3 : 4;
    doc.setFontSize(rfqCompact ? 7 : 9);
    doc.setTextColor(30, 30, 30);
    doc.text(
      partyBlockText(input.toPartySecondary).split("\n"),
      MARGIN + colW + 8,
      y,
      { lineHeightFactor: rfqCompact ? 1.05 : 1.2 },
    );
    y += Math.max(
      (rfqCompact ? 3.15 : 4.2) * (input.toPartySecondary.lines.length + 2),
      rfqCompact ? 11 : 14,
    );
  }

  y += rfqCompact ? 2 : 4;
  doc.setFontSize(rfqCompact ? 6 : 8);
  doc.setTextColor(90, 90, 90);
  if (input.kind !== "rfq" && input.kind !== "purchase_order") {
    doc.text(
      `Project: ${input.project.project_number} — ${(input.project.project_name ?? "").toUpperCase()}`,
      MARGIN,
      y,
    );
    y += rfqCompact ? 3 : 4;
  }
  if (input.project.customer && input.kind !== "rfq" && input.kind !== "purchase_order") {
    doc.text(`Customer ref: ${input.project.customer}`, MARGIN, y);
    y += rfqCompact ? 3 : 4;
  }
  if (
    input.project.customer_po &&
    input.kind !== "rfq" &&
    input.kind !== "purchase_order"
  ) {
    doc.text(`Customer PO: ${input.project.customer_po}`, MARGIN, y);
    y += rfqCompact ? 3 : 4;
  }
  if (input.meta.freightTerms) {
    doc.text(`Freight: ${input.meta.freightTerms}`, MARGIN, y);
    y += rfqCompact ? 3 : 4;
  }
  if (input.meta.incoterms && input.kind === "rfq") {
    doc.text(`Incoterms: ${input.meta.incoterms}`, MARGIN, y);
    y += rfqCompact ? 3 : 4;
  }
  if (input.kind === "bol") {
    if (input.meta.carrier) {
      doc.text(`Carrier: ${input.meta.carrier}`, MARGIN, y);
      y += 4;
    }
    if (input.meta.scac) {
      doc.text(`SCAC: ${input.meta.scac}`, MARGIN, y);
      y += 4;
    }
    if (input.meta.bolNumber) {
      doc.text(`BOL #: ${input.meta.bolNumber}`, MARGIN, y);
      y += 4;
    }
  }

  y += rfqCompact ? 2 : 4;

  const addTotals = (subtotal: number) => {
    doc.setFontSize(10);
    doc.text(`Subtotal: ${fmtMoney(subtotal)}`, PAGE_W - MARGIN, y + 6, {
      align: "right",
    });
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`Total: ${fmtMoney(subtotal)}`, PAGE_W - MARGIN, y + 14, {
      align: "right",
    });
    doc.setFont("helvetica", "normal");
    y += 20;
  };

  let renderedReferenceFiguresInline = false;

  if (
    input.kind === "invoice" ||
    input.kind === "rfq" ||
    input.kind === "purchase_order"
  ) {
    const optionsModeEnabled =
      (input.kind === "rfq" || input.kind === "purchase_order") &&
      (input.meta.optionGroups?.length ?? 0) > 0;
    const presentAsMultipleOptions =
      optionsModeEnabled && Boolean(input.meta.quotePresentAsMultipleOptions);

    if (optionsModeEnabled) {
      const sections = buildQuoteLineSections(input.meta.lines, input.meta.optionGroups ?? []);
      const optionSubtotalTopGap = rfqCompact ? 2 : 3;
      const optionNoteTopGap = rfqCompact ? 7 : 10;
      let runningSubtotal = 0;
      for (const section of sections) {
        doc.setFontSize(rfqCompact ? 6 : 8);
        doc.setTextColor(90, 90, 90);
        doc.text(section.title, MARGIN, y);
        y += rfqCompact ? 3 : 4;

        const tableRows = section.rows.map(({ line, depth, displayItemNo }) => ({
          itemNo: `${"  ".repeat(depth)}${displayItemNo}`,
          partNo: line.partRef ?? "—",
          description: formatDescriptionForPdf(line, 0, 80),
          qty: String(line.qty),
          uom: line.uom,
          unitPrice: fmtMoney(line.unitPrice),
          extPrice: fmtMoney(line.extended),
          lineNo: line.lineNo,
          descriptionIndentPrefix: "  ".repeat(depth),
        }));
        const optionColumns = optionModeLineColumnStyles();
        const optionBodyFontSize = rfqCompact ? 6 : 8;
        const optionCellPadding = rfqCompact ? 1.2 : 2;
        doc.setFontSize(optionBodyFontSize);
        const expandedRows = expandOptionModeRowsForOverflow(
          tableRows,
          20,
          62,
          (value) => wrapTextToPdfWidth(doc, value, optionColumns[1].cellWidth - optionCellPadding * 2),
          (value) => wrapTextToPdfWidth(doc, value, optionColumns[2].cellWidth - optionCellPadding * 2),
        );
        const body = expandedRows.body;
        const sectionLineNos = expandedRows.lineNos;
        const sectionLineStyles = new Map(
          section.rows.map(({ line }) => [line.lineNo, descriptionStyleFromRich(line)]),
        );
        autoTable(doc, {
          startY: y,
          head: [["#", "Part / dwg", "Description", "Qty", "UOM", "Unit", "Ext."]],
          body,
          margin: TABLE_MARGIN,
          styles: {
            fontSize: optionBodyFontSize,
            cellPadding: optionCellPadding,
          },
          columnStyles: optionColumns,
          headStyles: {
            fillColor: [accent[0], accent[1], accent[2]],
            textColor: [255, 255, 255],
            fontSize: rfqCompact ? 6 : 8,
            cellPadding: rfqCompact ? 1 : 2,
          },
          didParseCell: (data) => {
            if (data.section !== "body" || data.column.index !== 2) return;
            const lineNo = sectionLineNos[data.row.index] ?? null;
            if (!lineNo) return;
            const richStyle = sectionLineStyles.get(lineNo);
            if (!richStyle) return;
            data.cell.styles.fontStyle = richStyle.fontStyle;
            if (richStyle.textColor) data.cell.styles.textColor = richStyle.textColor;
            if (richStyle.fillColor) data.cell.styles.fillColor = richStyle.fillColor;
          },
          didDrawCell: (data) => {
            if (data.section !== "body" || data.column.index !== 2) return;
            addLineLinkForTableCell(doc, data, sectionLineNos[data.row.index] ?? null);
          },
        });
        const t = doc as jsPDF & { lastAutoTable?: { finalY: number } };
        y = (t.lastAutoTable?.finalY ?? y) + (rfqCompact ? 2 : 3);
        const sectionSubtotal = section.rows.reduce(
          (sum, row) => sum + (row.line.extended || 0),
          0,
        );
        y += optionSubtotalTopGap;
        doc.setFontSize(rfqCompact ? 7 : 9);
        doc.setTextColor(50, 50, 50);
        doc.text(
          section.id === "base-scope" ? "Subtotal" : "Option subtotal",
          PAGE_W - MARGIN - 36,
          y,
          { align: "right" },
        );
        doc.text(fmtMoney(sectionSubtotal), PAGE_W - MARGIN, y, { align: "right" });
        y += rfqCompact ? 4 : 6;
        const sectionFigures = collectReferenceFigureItemsForSectionRows(section.rows, section.title);
        if (sectionFigures.length > 0) {
          y = renderReferenceFigureBlock(doc, y, sectionFigures);
          renderedReferenceFiguresInline = true;
        }
        runningSubtotal += sectionSubtotal;
      }

      if (presentAsMultipleOptions) {
        y += optionNoteTopGap;
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(50, 50, 50);
        doc.text("OPTION SELECTION REQUIRED", MARGIN, y);
        y += 4.5;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        doc.text("Section subtotals are shown above; no single grand total is presented.", MARGIN, y);
        y += 6;
      } else {
        addTotals(runningSubtotal);
      }
    } else {
      const body = flattenedLines.map(({ line, depth }) => [
        String(line.lineNo),
        line.partRef ?? "—",
        formatDescriptionForPdf(line, depth, 80),
        String(line.qty),
        line.uom,
        fmtMoney(line.unitPrice),
        fmtMoney(line.extended),
      ]);
      const flattenedLineNos = flattenedLines.map(({ line }) => line.lineNo);
      const flattenedLineStyles = new Map(
        flattenedLines.map(({ line }) => [line.lineNo, descriptionStyleFromRich(line)]),
      );
      autoTable(doc, {
        startY: y,
        head: [["#", "Part / dwg", "Description", "Qty", "UOM", "Unit", "Ext."]],
        body,
        margin: TABLE_MARGIN,
        styles: {
          fontSize: rfqCompact ? 6 : 8,
          cellPadding: rfqCompact ? 1.2 : 2,
        },
        headStyles: {
          fillColor: [accent[0], accent[1], accent[2]],
          textColor: [255, 255, 255],
          fontSize: rfqCompact ? 6 : 8,
          cellPadding: rfqCompact ? 1 : 2,
        },
        didParseCell: (data) => {
          if (data.section !== "body" || data.column.index !== 2) return;
          const lineNo = flattenedLineNos[data.row.index] ?? null;
          if (!lineNo) return;
          const richStyle = flattenedLineStyles.get(lineNo);
          if (!richStyle) return;
          data.cell.styles.fontStyle = richStyle.fontStyle;
          if (richStyle.textColor) data.cell.styles.textColor = richStyle.textColor;
          if (richStyle.fillColor) data.cell.styles.fillColor = richStyle.fillColor;
        },
        didDrawCell: (data) => {
          if (data.section !== "body" || data.column.index !== 2) return;
          addLineLinkForTableCell(doc, data, flattenedLineNos[data.row.index] ?? null);
        },
      });
      const t = doc as jsPDF & { lastAutoTable?: { finalY: number } };
      y = (t.lastAutoTable?.finalY ?? y) + (rfqCompact ? 5 : 8);
      const subtotal = flattenedLines.reduce((s, { line }) => s + (line.extended || 0), 0);
      addTotals(subtotal);
    }
  } else if (input.kind === "packing_list") {
    const rows = input.meta.packingLines?.length
      ? input.meta.packingLines
      : flattenedLines.map(({ line, depth }, i) => ({
          lineNo: i + 1,
          description: formatDescriptionForPdf(line, depth, 72),
          quantity: line.qty,
          uom: line.uom,
          weightLb: undefined,
          dims: undefined,
        }));
    const body = rows.map((r) => [
      String(r.lineNo),
      r.description.slice(0, 72),
      String(r.quantity),
      r.uom,
      r.weightLb != null ? String(r.weightLb) : "—",
      r.dims ?? "—",
    ]);
    autoTable(doc, {
      startY: y,
      head: [["#", "Description", "Qty", "UOM", "Wt (lb)", "Dims"]],
      body,
      margin: TABLE_MARGIN,
      styles: {
        fontSize: rfqCompact ? 6 : 8,
        cellPadding: rfqCompact ? 1.2 : 2,
      },
      headStyles: {
        fillColor: [accent[0], accent[1], accent[2]],
        textColor: [255, 255, 255],
        fontSize: rfqCompact ? 6 : 8,
        cellPadding: rfqCompact ? 1 : 2,
      },
    });
    const t = doc as jsPDF & { lastAutoTable?: { finalY: number } };
    y = (t.lastAutoTable?.finalY ?? y) + (rfqCompact ? 5 : 8);
  } else if (input.kind === "bol") {
    const bolRows = input.meta.bolRows?.length
      ? input.meta.bolRows
      : flattenedLines.map(({ line, depth }) => ({
          description: formatDescriptionForPdf(line, depth, 56),
          weightLb: undefined,
          qty: line.qty,
          nmfc: undefined,
        }));
    const body = bolRows.map((r) => [
      r.description.slice(0, 56),
      String(r.qty),
      r.weightLb != null ? String(r.weightLb) : "—",
      r.nmfc ?? "—",
    ]);
    autoTable(doc, {
      startY: y,
      head: [["Commodity / description", "Qty", "Weight (lb)", "NMFC"]],
      body,
      margin: TABLE_MARGIN,
      styles: {
        fontSize: rfqCompact ? 6 : 8,
        cellPadding: rfqCompact ? 1.2 : 2,
      },
      headStyles: {
        fillColor: [accent[0], accent[1], accent[2]],
        textColor: [255, 255, 255],
        fontSize: rfqCompact ? 6 : 8,
        cellPadding: rfqCompact ? 1 : 2,
      },
    });
    const t = doc as jsPDF & { lastAutoTable?: { finalY: number } };
    y = (t.lastAutoTable?.finalY ?? y) + (rfqCompact ? 6 : 12);
    doc.setDrawColor(80, 80, 80);
    doc.rect(MARGIN, y, PAGE_W - 2 * MARGIN, 28);
    doc.setFontSize(rfqCompact ? 7 : 9);
    doc.text(
      "Receiver signature — goods received in apparent good order unless noted:",
      MARGIN + 3,
      y + 8,
    );
    doc.line(MARGIN + 3, y + 22, MARGIN + 85, y + 22);
    doc.text("Print name", MARGIN + 3, y + 26);
    doc.line(PAGE_W - MARGIN - 60, y + 22, PAGE_W - MARGIN - 3, y + 22);
    doc.text("Date", PAGE_W - MARGIN - 60, y + 26);
    y += 36;
  }

  if (!renderedReferenceFiguresInline) {
    y = renderReferenceFigureBlock(
      doc,
      y,
      collectReferenceFigureItems(input.meta.lines, input.meta.optionGroups ?? []),
    );
  }

  if (input.meta.notes) {
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    doc.text("Notes:", MARGIN, y);
    y += 4;
    doc.setFontSize(8);
    const noteLines = doc.splitTextToSize(
      input.meta.notes,
      PAGE_W - 2 * MARGIN,
    );
    doc.text(noteLines, MARGIN, y);
    y += noteLines.length * 3.5 + 4;
  }

  const bodyPageCount = doc.getNumberOfPages();
  annotateFirstPageContinuation(
    doc,
    accent,
    {
      logoDataUrl: input.logoDataUrl,
      title,
      projectNumber: input.project.project_number,
      revisionIndex: input.revisionIndex,
      documentNumber: input.documentNumber,
      issuedDate: input.issuedDate,
      continuedFromPage: 1,
    },
    bodyPageCount,
  );

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(doc, i, totalPages, "default");
  }

  return doc.output("arraybuffer");
}

/** Short codes used in exported PDF basenames (e.g. `101363_Q-My_Job-03.29.2026.pdf`). */
export const DOCUMENT_KIND_FILE_CODE: Record<ProjectDocumentKind, string> = {
  quote: "Q",
  invoice: "INV",
  bol: "BOL",
  packing_list: "PL",
  rfq: "RFQ",
  purchase_order: "PO",
};

function sanitizeProjectNameForFilename(raw: string): string {
  let s = raw
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 100);
  s = s.replace(/^_+|_+$/g, "");
  if (!s) return "PROJECT";
  return s;
}

export function buildDocumentDownloadFilename(
  projectNumber: string,
  kind: ProjectDocumentKind,
  projectName: string,
  revisionIndex?: number,
  issuedAt?: Date,
): string {
  const d = issuedAt ?? new Date();
  const stamp = formatRiversideDateStampMdY(d);
  const safeName = sanitizeProjectNameForFilename(projectName);
  const code = DOCUMENT_KIND_FILE_CODE[kind];
  const pn = String(projectNumber).replace(/\s+/g, "");
  const revision = formatRevisionSuffix(revisionIndex);
  return `${pn}_${code}-${safeName}-${stamp} ${revision}.pdf`.replace(
    /[^a-zA-Z0-9._()\- ]/g,
    "",
  );
}
