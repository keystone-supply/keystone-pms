import assert from "node:assert/strict";
import { test } from "node:test";

import { jsPDF } from "jspdf";
import { PDFDocument } from "pdf-lib";

import {
  buildJobPacketFilename,
  buildJobPacketPdf,
} from "@/lib/documents/buildJobPacket";

function createSinglePagePdf(label: string): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  doc.setFontSize(16);
  doc.text(label, 20, 30);
  return new Uint8Array(doc.output("arraybuffer"));
}

test("buildJobPacketPdf prepends cover and appends selected packet parts", async () => {
  const packet = await buildJobPacketPdf({
    projectNumber: "101365",
    projectName: "Cable Tray Supports",
    generatedAt: new Date("2026-04-22T08:00:00.000Z"),
    sections: [
      {
        id: "doc-quote",
        title: "Quotation REV 3",
        filename: "101365_Q-Cable_Tray_Supports.pdf",
        source: "document",
        pdfBytes: createSinglePagePdf("Quote PDF"),
      },
      {
        id: "file-cad",
        title: "Shop Drawings",
        filename: "shop-drawings.pdf",
        source: "file",
        pdfBytes: createSinglePagePdf("Shop Drawing PDF"),
      },
    ],
  });

  const merged = await PDFDocument.load(packet);
  assert.equal(merged.getPageCount(), 3, "cover page plus two selected PDFs");
});

test("buildJobPacketFilename creates stable project-specific output name", () => {
  const filename = buildJobPacketFilename(
    "101365",
    "Cable Tray / Supports: Rev A",
    new Date("2026-04-22T08:00:00.000Z"),
  );
  assert.equal(filename, "101365_JOB-PACKET-Cable_Tray_-_Supports-_Rev_A-04.22.2026.pdf");
});
