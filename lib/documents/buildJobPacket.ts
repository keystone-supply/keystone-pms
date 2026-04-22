import { jsPDF } from "jspdf";
import { PDFDocument } from "pdf-lib";

import { formatRiversideDateStampMdY } from "@/lib/documents/riversideTime";

export type JobPacketSectionInput = {
  id: string;
  title: string;
  filename: string;
  source: "document" | "file";
  pdfBytes: Uint8Array | ArrayBuffer;
};

export type BuildJobPacketInput = {
  projectNumber: string;
  projectName: string;
  generatedAt: Date;
  sections: JobPacketSectionInput[];
};

function toUint8Array(bytes: Uint8Array | ArrayBuffer): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

function sanitizeForFilename(raw: string): string {
  const sanitized = raw
    .trim()
    .replace(/[\/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 90)
    .replace(/^_+|_+$/g, "");
  return sanitized || "PROJECT";
}

function buildCoverPdfBytes(
  input: BuildJobPacketInput,
  sectionPageCounts: number[],
): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const generatedStamp = formatRiversideDateStampMdY(input.generatedAt);
  const cleanProjectName = input.projectName.trim() || "Project";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("JOB PACKET", 18, 24);
  doc.setFontSize(12);
  doc.text(input.projectNumber, 18, 32);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(cleanProjectName, 18, 38);
  doc.text(`Generated: ${generatedStamp}`, 18, 44);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Table of contents", 18, 56);

  let y = 63;
  let startPage = 2; // cover is page 1.
  for (let index = 0; index < input.sections.length; index += 1) {
    const section = input.sections[index];
    const pages = sectionPageCounts[index] ?? 0;
    const endPage = pages > 0 ? startPage + pages - 1 : startPage;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`${index + 1}. ${section.title}`, 20, y, { maxWidth: 132 });
    doc.text(section.source === "document" ? "Document" : "File", 156, y, { align: "right" });
    doc.text(`${startPage}-${endPage}`, 196, y, { align: "right" });
    y += 6;
    startPage += pages;
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

export function buildJobPacketFilename(
  projectNumber: string,
  projectName: string,
  issuedAt: Date,
): string {
  const pn = String(projectNumber).replace(/\s+/g, "");
  const cleanName = sanitizeForFilename(projectName);
  const dateStamp = formatRiversideDateStampMdY(issuedAt);
  return `${pn}_JOB-PACKET-${cleanName}-${dateStamp}.pdf`.replace(/[^a-zA-Z0-9._()\- ]/g, "");
}

export async function buildJobPacketPdf(input: BuildJobPacketInput): Promise<Uint8Array> {
  const packet = await PDFDocument.create();
  const pageCounts: number[] = [];
  const parsedSections: PDFDocument[] = [];

  for (const section of input.sections) {
    const parsed = await PDFDocument.load(toUint8Array(section.pdfBytes));
    parsedSections.push(parsed);
    pageCounts.push(parsed.getPageCount());
  }

  const coverBytes = buildCoverPdfBytes(input, pageCounts);
  const coverPdf = await PDFDocument.load(coverBytes);
  const coverPages = await packet.copyPages(coverPdf, coverPdf.getPageIndices());
  for (const page of coverPages) {
    packet.addPage(page);
  }

  for (const parsed of parsedSections) {
    const copiedPages = await packet.copyPages(parsed, parsed.getPageIndices());
    for (const page of copiedPages) {
      packet.addPage(page);
    }
  }

  return packet.save();
}
