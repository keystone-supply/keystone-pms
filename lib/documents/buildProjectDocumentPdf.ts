import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import type { VendorRow } from "@/lib/vendorQueries";
import {
  DOCUMENT_KIND_ACCENT,
  DOCUMENT_KIND_LABEL,
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
  /** Export-time `project_documents.version` (before the post-export +1); PDF `REV.` via `pdfRevFromDocumentVersion`. */
  documentVersion?: number;
  quoteResolved?: QuotePdfResolved;
};

const MARGIN = 18;
const PAGE_W = 215.9;
const PAGE_H = 279.4;
const TERMS_LINE_HEIGHT = 3.5;
const FOOTER_GAP = 16;

/**
 * REV index (`REV. N` / OneDrive `(vN)`) for a PDF built with **export-time**
 * `documentVersion` (the row value **before** the post-export bump).
 * Examples: `1` → `0`, `2` → `1`.
 */
export function pdfRevFromDocumentVersion(version?: number): number {
  const v = version ?? 1;
  return Math.max(0, v - 1);
}

/**
 * REV / `(vK)` index of the **most recent** export, from **stored**
 * `project_documents.version` (after the usual `+1` bump following each export).
 * Matches the last PDF header and OneDrive suffix for that row.
 */
export function lastExportedFileRevisionIndex(storedVersion?: number): number {
  return pdfRevFromDocumentVersion((storedVersion ?? 1) - 1);
}

export function formatPdfJobRevLine(
  projectNumber: string,
  documentVersion?: number,
): string {
  return `${projectNumber} REV. ${pdfRevFromDocumentVersion(documentVersion)}`;
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function fmtDateLong(d: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

export async function fetchLogoDataUrl(kind?: ProjectDocumentKind): Promise<string | null> {
  try {
    const logoPaths = ["/rfq-logo.png", "/logo.png"];
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
      input.documentVersion,
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
  doc.text(`Date: ${fmtDateLong(input.issuedDate)}`, PAGE_W - MARGIN, dateY, {
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

  const body = input.meta.lines.map((l) => [
    l.partRef?.trim() ? l.partRef.trim() : String(l.lineNo),
    l.description.slice(0, 100),
    fmtMoney(l.extended),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["ITEM #", "DESCRIPTION", "TOTAL"]],
    body,
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: compact ? 6 : 8, cellPadding: compact ? 1.2 : 2 },
    columnStyles: {
      2: { halign: "right" },
    },
    headStyles: {
      fillColor: [accent[0], accent[1], accent[2]],
      textColor: [255, 255, 255],
      fontSize: compact ? 6 : 8,
      cellPadding: compact ? 1 : 2,
    },
  });

  const tSlot = doc as jsPDF & { lastAutoTable?: { finalY: number } };
  y = (tSlot.lastAutoTable?.finalY ?? y) + (compact ? 4 : 6);

  const subtotal = input.meta.lines.reduce((s, l) => s + (l.extended || 0), 0);
  const labelX = PAGE_W - MARGIN - 44;
  const amtX = PAGE_W - MARGIN;

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

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("TOTAL", labelX, y, { align: "right" });
  doc.text(fmtMoney(running), amtX, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  y += 8;

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
      input.documentVersion,
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
  doc.text(`Date: ${fmtDateLong(input.issuedDate)}`, PAGE_W - MARGIN, dateY, {
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

  if (
    input.kind === "invoice" ||
    input.kind === "rfq" ||
    input.kind === "purchase_order"
  ) {
    const body = input.meta.lines.map((l) => [
      String(l.lineNo),
      l.partRef ?? "—",
      l.description.slice(0, 80),
      String(l.qty),
      l.uom,
      fmtMoney(l.unitPrice),
      fmtMoney(l.extended),
    ]);
    autoTable(doc, {
      startY: y,
      head: [["#", "Part / dwg", "Description", "Qty", "UOM", "Unit", "Ext."]],
      body,
      margin: { left: MARGIN, right: MARGIN },
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
    const subtotal = input.meta.lines.reduce((s, l) => s + (l.extended || 0), 0);
    addTotals(subtotal);
  } else if (input.kind === "packing_list") {
    const rows = input.meta.packingLines?.length
      ? input.meta.packingLines
      : input.meta.lines.map((l, i) => ({
          lineNo: i + 1,
          description: l.description,
          quantity: l.qty,
          uom: l.uom,
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
      margin: { left: MARGIN, right: MARGIN },
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
      : input.meta.lines.map((l) => ({
          description: l.description,
          weightLb: undefined,
          qty: l.qty,
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
      margin: { left: MARGIN, right: MARGIN },
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

function formatLocalDateMdY(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const y = String(d.getFullYear());
  return `${m}.${day}.${y}`;
}

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
  issuedAt?: Date,
): string {
  const d = issuedAt ?? new Date();
  const stamp = formatLocalDateMdY(d);
  const safeName = sanitizeProjectNameForFilename(projectName);
  const code = DOCUMENT_KIND_FILE_CODE[kind];
  const pn = String(projectNumber).replace(/\s+/g, "");
  return `${pn}_${code}-${safeName}-${stamp}.pdf`.replace(
    /[^a-zA-Z0-9._-]/g,
    "",
  );
}
