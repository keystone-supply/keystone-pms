import assert from "node:assert/strict";
import { test } from "node:test";

import type { ProjectDocumentDraftMeta } from "@/lib/documentTypes";
import { PROJECT_DOCUMENT_KINDS } from "@/lib/documentTypes";
import {
  buildDocumentDownloadFilename,
  buildProjectDocumentPdf,
  DOCUMENT_KIND_FILE_CODE,
  formatPdfJobRevLine,
  lastExportedFileRevisionIndex,
  pdfRevFromDocumentVersion,
  type BuildProjectDocumentPdfInput,
} from "@/lib/documents/buildProjectDocumentPdf";

function pdfBytesInclude(buf: ArrayBuffer, needle: string): boolean {
  return new TextDecoder("latin1").decode(new Uint8Array(buf)).includes(needle);
}

const baseMeta: ProjectDocumentDraftMeta = {
  lines: [
    {
      lineNo: 1,
      description: "Line A",
      qty: 1,
      uom: "EA",
      unitPrice: 100,
      extended: 100,
      partRef: "BKT-1",
    },
  ],
  packingLines: [],
  bolRows: [],
  quotePdfTaxRatePct: 0,
  quotePdfTaxAmount: 0,
  quotePdfLogisticsAmount: 10,
};

test("quote PDF builds without throw and produces non-empty output", () => {
  const input: BuildProjectDocumentPdfInput = {
    kind: "quote",
    documentNumber: "Q-TEST-1",
    issuedDate: new Date(2026, 2, 29),
    company: {
      legalName: "Test Co",
      line1: "1 Main",
      line2: "",
      city: "Riverside",
      state: "UT",
      postalCode: "84334",
      country: "USA",
      phone: "555-0100",
      email: "sales@example.com",
    },
    logoDataUrl: null,
    project: {
      project_number: "101365",
      project_name: "Bucket liners",
      customer: "Geneva Rock",
      customer_po: null,
    },
    fromParty: { label: "Seller", name: "Test Co", lines: [] },
    toParty: {
      label: "Customer",
      name: "Geneva Rock",
      lines: ["Ogden, UT"],
    },
    toPartySecondary: {
      label: "Ship to",
      name: "Geneva Rock",
      lines: ["Ogden, UT"],
    },
    meta: baseMeta,
    documentVersion: 1,
    quoteResolved: {
      paymentTerms: "NET 30",
      customerContact: "Alex",
      accountManager: "Luke (555-0200)",
      quoteDescription: "BUCKET LINERS",
      shippingMethod: "Prepaid",
    },
  };
  const buf = buildProjectDocumentPdf(input);
  assert.ok(buf instanceof ArrayBuffer);
  assert.ok(buf.byteLength > 8000);
  assert.ok(pdfBytesInclude(buf, "101365 REV. 0"));
  assert.ok(pdfBytesInclude(buf, "Date: Mar 29, 2026"));
});

test("non-quote invoice PDF still builds", () => {
  const input: BuildProjectDocumentPdfInput = {
    kind: "invoice",
    documentNumber: "INV-1",
    issuedDate: new Date("2026-03-29"),
    company: {
      legalName: "Test Co",
      line1: "",
      line2: "",
      city: "",
      state: "",
      postalCode: "",
      country: "",
      phone: "",
      email: "",
    },
    logoDataUrl: null,
    project: {
      project_number: "99",
      project_name: "Job",
      customer: "Acme",
      customer_po: "PO-1",
    },
    fromParty: { label: "From", name: "Test Co", lines: [] },
    toParty: { label: "Bill to", name: "Acme", lines: [] },
    meta: {
      lines: [
        {
          lineNo: 1,
          description: "Work",
          qty: 2,
          uom: "HR",
          unitPrice: 50,
          extended: 100,
        },
      ],
      packingLines: [],
      bolRows: [],
    },
    documentVersion: 4,
  };
  const buf = buildProjectDocumentPdf(input);
  assert.ok(buf.byteLength > 2000);
  assert.ok(pdfBytesInclude(buf, "99 REV. 3"));
});

test("buildDocumentDownloadFilename quote matches plan shape", () => {
  const d = new Date(2026, 2, 29);
  assert.equal(
    buildDocumentDownloadFilename("101363", "quote", "Bucket liners", d),
    "101363_Q-Bucket_liners-03.29.2026.pdf",
  );
});

test("buildDocumentDownloadFilename uses correct code per kind", () => {
  const d = new Date(2026, 0, 5);
  for (const kind of PROJECT_DOCUMENT_KINDS) {
    assert.equal(
      buildDocumentDownloadFilename("1", kind, "Job", d),
      `1_${DOCUMENT_KIND_FILE_CODE[kind]}-Job-01.05.2026.pdf`,
    );
  }
});

test("buildDocumentDownloadFilename empty project name becomes PROJECT", () => {
  const d = new Date(2026, 1, 1);
  assert.equal(
    buildDocumentDownloadFilename("99", "invoice", "", d),
    "99_INV-PROJECT-02.01.2026.pdf",
  );
  assert.equal(
    buildDocumentDownloadFilename("99", "invoice", "   ", d),
    "99_INV-PROJECT-02.01.2026.pdf",
  );
});

test("buildDocumentDownloadFilename replaces forbidden characters in name", () => {
  const d = new Date(2026, 5, 15);
  assert.equal(
    buildDocumentDownloadFilename("1", "bol", 'a/b:c*d?x"y', d),
    "1_BOL-a-b-c-d-x-y-06.15.2026.pdf",
  );
});

test("buildDocumentDownloadFilename truncates long project name", () => {
  const d = new Date(2026, 0, 1);
  const long = "x".repeat(150);
  const expected = `1_Q-${"x".repeat(100)}-01.01.2026.pdf`;
  assert.equal(buildDocumentDownloadFilename("1", "quote", long, d), expected);
});

test("buildDocumentDownloadFilename strips spaces from project number", () => {
  const d = new Date(2026, 0, 1);
  assert.equal(
    buildDocumentDownloadFilename("10 13 63", "quote", "A", d),
    "101363_Q-A-01.01.2026.pdf",
  );
});

test("pdfRevFromDocumentVersion maps DB version to PDF REV index", () => {
  assert.equal(pdfRevFromDocumentVersion(undefined), 0);
  assert.equal(pdfRevFromDocumentVersion(1), 0);
  assert.equal(pdfRevFromDocumentVersion(2), 1);
  assert.equal(pdfRevFromDocumentVersion(100), 99);
});

test("formatPdfJobRevLine", () => {
  assert.equal(formatPdfJobRevLine("101363", 2), "101363 REV. 1");
  assert.equal(formatPdfJobRevLine("101363"), "101363 REV. 0");
});

test("lastExportedFileRevisionIndex maps stored row version to last PDF / file (vN)", () => {
  assert.equal(lastExportedFileRevisionIndex(undefined), 0);
  assert.equal(lastExportedFileRevisionIndex(1), 0);
  assert.equal(lastExportedFileRevisionIndex(2), 0);
  assert.equal(lastExportedFileRevisionIndex(3), 1);
  assert.equal(lastExportedFileRevisionIndex(100), 98);
});
