import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import type { VendorRow } from "@/lib/vendorQueries";
import {
  DOCUMENT_KIND_ACCENT,
  DOCUMENT_KIND_LABEL,
  type ProjectDocumentDraftMeta,
  type ProjectDocumentKind,
} from "@/lib/documentTypes";

import { formatCompanyMultiline, type CompanyBlock } from "@/lib/documents/company";

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
};

const MARGIN = 18;
const PAGE_W = 215.9;
const PAGE_H = 279.4;

function fmtMoney(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

export async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch("/logo.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
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

function drawFooter(doc: jsPDF, page: number, total: number): void {
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  const disclaimer =
    "Commercial document — subject to Keystone Supply standard terms. Quantities and pricing exclude tax unless noted.";
  doc.text(disclaimer, MARGIN, PAGE_H - 14, { maxWidth: PAGE_W - 2 * MARGIN });
  doc.text(`Page ${page} of ${total}`, PAGE_W - MARGIN, PAGE_H - 10, {
    align: "right",
  });
  doc.setTextColor(0, 0, 0);
}

export function buildProjectDocumentPdf(input: BuildProjectDocumentPdfInput): ArrayBuffer {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const accent = DOCUMENT_KIND_ACCENT[input.kind];
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

  doc.setFontSize(9);
  doc.setTextColor(55, 55, 55);
  const companyText = formatCompanyMultiline(input.company);
  doc.text(companyText.split("\n"), input.logoDataUrl ? MARGIN + 48 : MARGIN, y + 4, {
    lineHeightFactor: 1.25,
  });

  y = Math.max(y + 22, MARGIN + 28);

  doc.setFontSize(16);
  doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.text(title.toUpperCase(), MARGIN, y);
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text(`No. ${input.documentNumber}`, PAGE_W - MARGIN, y, { align: "right" });
  y += 7;
  doc.setFontSize(9);
  doc.text(`Date: ${fmtDate(input.issuedDate)}`, PAGE_W - MARGIN, y, {
    align: "right",
  });
  y += 2;

  if (input.meta.validUntil && input.kind === "quote") {
    y += 4;
    doc.text(`Valid through: ${input.meta.validUntil}`, PAGE_W - MARGIN, y, {
      align: "right",
    });
    y -= 4;
  }
  if (input.meta.responseDue && input.kind === "rfq") {
    y += 4;
    doc.text(`Response requested by: ${input.meta.responseDue}`, PAGE_W - MARGIN, y, {
      align: "right",
    });
    y -= 4;
  }

  y += 10;
  doc.setDrawColor(220, 220, 220);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 6;

  const colW = (PAGE_W - 2 * MARGIN - 8) / 2;
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(input.fromParty.label.toUpperCase(), MARGIN, y);
  doc.text(input.toParty.label.toUpperCase(), MARGIN + colW + 8, y);
  y += 4;
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  doc.text(partyBlockText(input.fromParty).split("\n"), MARGIN, y, {
    lineHeightFactor: 1.2,
  });
  doc.text(partyBlockText(input.toParty).split("\n"), MARGIN + colW + 8, y, {
    lineHeightFactor: 1.2,
  });

  const leftH = input.fromParty.lines.length + 2;
  const rightH = input.toParty.lines.length + 2;
  y += Math.max(leftH * 4.2, rightH * 4.2, 18);

  if (input.toPartySecondary) {
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(input.toPartySecondary.label.toUpperCase(), MARGIN + colW + 8, y);
    y += 4;
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text(
      partyBlockText(input.toPartySecondary).split("\n"),
      MARGIN + colW + 8,
      y,
      { lineHeightFactor: 1.2 },
    );
    y += Math.max(4.2 * (input.toPartySecondary.lines.length + 2), 14);
  }

  y += 4;
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text(
    `Project: ${input.project.project_number} — ${(input.project.project_name ?? "").toUpperCase()}`,
    MARGIN,
    y,
  );
  y += 4;
  if (input.project.customer) {
    doc.text(`Customer ref: ${input.project.customer}`, MARGIN, y);
    y += 4;
  }
  if (input.project.customer_po) {
    doc.text(`Customer PO: ${input.project.customer_po}`, MARGIN, y);
    y += 4;
  }
  if (input.meta.freightTerms) {
    doc.text(`Freight: ${input.meta.freightTerms}`, MARGIN, y);
    y += 4;
  }
  if (input.meta.incoterms && (input.kind === "rfq" || input.kind === "quote")) {
    doc.text(`Incoterms: ${input.meta.incoterms}`, MARGIN, y);
    y += 4;
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

  y += 4;

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
    input.kind === "quote" ||
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
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: {
        fillColor: [accent[0], accent[1], accent[2]],
        textColor: [255, 255, 255],
      },
    });
    const t = doc as jsPDF & { lastAutoTable?: { finalY: number } };
    y = (t.lastAutoTable?.finalY ?? y) + 8;
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
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: {
        fillColor: [accent[0], accent[1], accent[2]],
        textColor: [255, 255, 255],
      },
    });
    const t = doc as jsPDF & { lastAutoTable?: { finalY: number } };
    y = (t.lastAutoTable?.finalY ?? y) + 8;
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
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: {
        fillColor: [accent[0], accent[1], accent[2]],
        textColor: [255, 255, 255],
      },
    });
    const t = doc as jsPDF & { lastAutoTable?: { finalY: number } };
    y = (t.lastAutoTable?.finalY ?? y) + 12;
    doc.setDrawColor(80, 80, 80);
    doc.rect(MARGIN, y, PAGE_W - 2 * MARGIN, 28);
    doc.setFontSize(9);
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
    drawFooter(doc, i, totalPages);
  }

  return doc.output("arraybuffer");
}

export function buildDocumentDownloadFilename(
  projectNumber: string,
  kind: ProjectDocumentKind,
  documentNumber: string,
): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const safeNum = documentNumber
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 40);
  const kindSlug = kind.replace(/_/g, "-");
  const pn = String(projectNumber).replace(/\s+/g, "");
  return `${pn}_${kindSlug}_${safeNum || "DRAFT"}_${stamp}.pdf`.replace(
    /[^a-zA-Z0-9._-]/g,
    "",
  );
}
