import assert from "node:assert/strict";
import { test } from "node:test";

import type { ProjectDocumentDraftMeta } from "@/lib/documentTypes";
import { PROJECT_DOCUMENT_KINDS } from "@/lib/documentTypes";
import {
  buildQuoteLineSections,
  buildDocumentDownloadFilename,
  buildProjectDocumentPdf,
  DOCUMENT_KIND_FILE_CODE,
  expandOptionModeRowsForOverflow,
  expandQuoteTableRowsForOverflow,
  formatRevisionSuffix,
  formatPdfJobRevLine,
  normalizeRevisionIndex,
  optionModeLineColumnStyles,
  quoteLineSectionColumnStyles,
  type BuildProjectDocumentPdfInput,
} from "@/lib/documents/buildProjectDocumentPdf";

function pdfBytesInclude(buf: ArrayBuffer, needle: string): boolean {
  return new TextDecoder("latin1").decode(new Uint8Array(buf)).includes(needle);
}

function pdfBytesIndex(buf: ArrayBuffer, needle: string): number {
  return new TextDecoder("latin1").decode(new Uint8Array(buf)).indexOf(needle);
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

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn8z1sAAAAASUVORK5CYII=";

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
      physicalLine1: "12090 North Hwy 38",
      physicalLine2: "",
      physicalCity: "Deweyville",
      physicalState: "UT",
      physicalPostalCode: "84309",
      physicalCountry: "USA",
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
    revisionIndex: 0,
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
  assert.ok(pdfBytesInclude(buf, "QUOTATION"));
  assert.ok(pdfBytesInclude(buf, "PART #"));
  assert.ok(pdfBytesInclude(buf, "Doc No. Q-TEST-1"));
  assert.ok(pdfBytesInclude(buf, "Date: Mar 29, 2026"));
  assert.ok(!pdfBytesInclude(buf, "Customer PO:"));
});

test("non-quote documents use physical address for SELLER block and consistent VENDOR label (PO, RFQ, invoice, etc.)", () => {
  const input: BuildProjectDocumentPdfInput = {
    kind: "purchase_order",
    documentNumber: "PO-1",
    issuedDate: new Date("2026-03-29"),
    company: {
      legalName: "Keystone Supply",
      line1: "P.O. Box 129",
      line2: "",
      city: "Riverside",
      state: "UT",
      postalCode: "84334",
      country: "USA",
      phone: "(435) 720-3714",
      email: "sales@keystone-supply.com",
      physicalLine1: "12090 North Hwy 38",
      physicalLine2: "",
      physicalCity: "Deweyville",
      physicalState: "UT",
      physicalPostalCode: "84309",
      physicalCountry: "USA",
    },
    logoDataUrl: null,
    project: {
      project_number: "99",
      project_name: "Job",
      customer: "Acme",
      customer_po: "PO-1",
    },
    fromParty: { label: "Seller", name: "Keystone Supply", lines: [] },
    toParty: { label: "Vendor", name: "Acme", lines: [] },
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
    revisionIndex: 3,
  };
  const buf = buildProjectDocumentPdf(input);
  assert.ok(buf.byteLength > 2000);
  assert.ok(pdfBytesInclude(buf, "99 REV. 3"));
  assert.ok(pdfBytesInclude(buf, "PURCHASE ORDER"));
  assert.ok(pdfBytesInclude(buf, "Doc No. PO-1"));
  assert.ok(pdfBytesInclude(buf, "VENDOR")); // consistent label for RFQ/PO (was "SUPPLIER (QUOTE TO)" for RFQ)
  // Physical address must appear (Deweyville not Riverside PO Box)
  assert.ok(pdfBytesInclude(buf, "12090 North Hwy 38"));
  assert.ok(pdfBytesInclude(buf, "Deweyville"));
  assert.ok(pdfBytesInclude(buf, "84309"));
  assert.ok(!pdfBytesInclude(buf, "Customer PO:"));
  assert.ok(!pdfBytesInclude(buf, "Project: "));
});

test("rfq PDF omits Customer PO line and prints heading above job number", () => {
  const input: BuildProjectDocumentPdfInput = {
    kind: "rfq",
    documentNumber: "RFQ-1",
    issuedDate: new Date("2026-03-29"),
    company: {
      legalName: "Keystone Supply",
      line1: "P.O. Box 129",
      line2: "",
      city: "Riverside",
      state: "UT",
      postalCode: "84334",
      country: "USA",
      phone: "(435) 720-3714",
      email: "sales@keystone-supply.com",
      physicalLine1: "12090 North Hwy 38",
      physicalLine2: "",
      physicalCity: "Deweyville",
      physicalState: "UT",
      physicalPostalCode: "84309",
      physicalCountry: "USA",
    },
    logoDataUrl: null,
    project: {
      project_number: "101365",
      project_name: "Bucket liners",
      customer: "Geneva Rock",
      customer_po: "PO-XYZ-123",
    },
    fromParty: { label: "Requesting", name: "Keystone Supply", lines: [] },
    toParty: { label: "Vendor", name: "Acme", lines: ["Ogden, UT"] },
    meta: {
      lines: [
        {
          lineNo: 1,
          description: "Wear plate",
          qty: 5,
          uom: "EA",
          unitPrice: 10,
          extended: 50,
        },
      ],
      packingLines: [],
      bolRows: [],
    },
    revisionIndex: 0,
  };

  const buf = buildProjectDocumentPdf(input);
  assert.ok(buf.byteLength > 2000);
  assert.ok(!pdfBytesInclude(buf, "Customer PO:"));
  const headerIdx = pdfBytesIndex(buf, "REQUEST FOR QUOTATION");
  const jobIdx = pdfBytesIndex(buf, "101365 REV. 0");
  const docNoIdx = pdfBytesIndex(buf, "Doc No. RFQ-1");
  assert.ok(headerIdx >= 0);
  assert.ok(jobIdx >= 0);
  assert.ok(docNoIdx >= 0);
  assert.ok(headerIdx < jobIdx);
  assert.ok(jobIdx < docNoIdx);
});

test("all document kinds render line text when descriptionRich is present", () => {
  for (const kind of PROJECT_DOCUMENT_KINDS) {
    const input: BuildProjectDocumentPdfInput = {
      kind,
      documentNumber: `${DOCUMENT_KIND_FILE_CODE[kind]}-RICH-1`,
      issuedDate: new Date("2026-03-29"),
      company: {
        legalName: "Keystone Supply",
        line1: "P.O. Box 129",
        line2: "",
        city: "Riverside",
        state: "UT",
        postalCode: "84334",
        country: "USA",
        phone: "(435) 720-3714",
        email: "sales@keystone-supply.com",
        physicalLine1: "12090 North Hwy 38",
        physicalLine2: "",
        physicalCity: "Deweyville",
        physicalState: "UT",
        physicalPostalCode: "84309",
        physicalCountry: "USA",
      },
      logoDataUrl: null,
      project: {
        project_number: "101365",
        project_name: "Bucket liners",
        customer: "Geneva Rock",
        customer_po: "PO-XYZ-123",
      },
      fromParty: { label: "Seller", name: "Keystone Supply", lines: [] },
      toParty: { label: "Customer", name: "Geneva Rock", lines: ["Ogden, UT"] },
      meta: {
        lines: [
          {
            lineNo: 1,
            description: "Rich fallback text",
            descriptionRich: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Rich " },
                    { type: "text", text: "fallback", marks: [{ type: "bold" }] },
                    { type: "text", text: " text" },
                  ],
                },
              ],
            },
            qty: 1,
            uom: "EA",
            unitPrice: 10,
            extended: 10,
          },
        ],
        packingLines: [],
        bolRows: [],
      },
      revisionIndex: 0,
      ...(kind === "quote"
        ? {
            quoteResolved: {
              paymentTerms: "NET 30",
              customerContact: "Alex",
              accountManager: "Luke (555-0200)",
              quoteDescription: "BUCKET LINERS",
              shippingMethod: "Prepaid",
            },
          }
        : {}),
    };
    const buf = buildProjectDocumentPdf(input);
    assert.ok(buf.byteLength > 2000);
    assert.ok(pdfBytesInclude(buf, "Rich fallback text"));
  }
});

test("PDF description prefers serialized rich text over plain fallback field", () => {
  const input: BuildProjectDocumentPdfInput = {
    kind: "quote",
    documentNumber: "Q-RICH-SERIALIZER-1",
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
      physicalLine1: "12090 North Hwy 38",
      physicalLine2: "",
      physicalCity: "Deweyville",
      physicalState: "UT",
      physicalPostalCode: "84309",
      physicalCountry: "USA",
    },
    logoDataUrl: null,
    project: {
      project_number: "RICH-1",
      project_name: "Rich serializer test",
      customer: "Geneva Rock",
      customer_po: null,
    },
    fromParty: { label: "Seller", name: "Test Co", lines: [] },
    toParty: { label: "Customer", name: "Geneva Rock", lines: ["Ogden, UT"] },
    meta: {
      ...baseMeta,
      lines: [
        {
          lineNo: 1,
          description: "PLAIN_ONLY",
          descriptionRich: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "RICH_ONLY" }],
              },
              {
                type: "bulletList",
                content: [
                  {
                    type: "listItem",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "RICH_BULLET_ONLY" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          qty: 1,
          uom: "EA",
          unitPrice: 10,
          extended: 10,
        },
      ],
    },
    revisionIndex: 0,
    quoteResolved: {
      paymentTerms: "NET 30",
      customerContact: "Alex",
      accountManager: "Luke (555-0200)",
      quoteDescription: "RICH",
      shippingMethod: "Prepaid",
    },
  };

  const buf = buildProjectDocumentPdf(input);
  assert.ok(pdfBytesInclude(buf, "RICH_ONLY"));
  assert.ok(pdfBytesInclude(buf, "RICH_BULLET_ONLY"));
  assert.ok(!pdfBytesInclude(buf, "PLAIN_ONLY"));
});

test("quote PDF renders hierarchical line order with nested indentation", () => {
  const input: BuildProjectDocumentPdfInput = {
    kind: "quote",
    documentNumber: "Q-HIER-1",
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
      physicalLine1: "12090 North Hwy 38",
      physicalLine2: "",
      physicalCity: "Deweyville",
      physicalState: "UT",
      physicalPostalCode: "84309",
      physicalCountry: "USA",
    },
    logoDataUrl: null,
    project: {
      project_number: "HIER-100",
      project_name: "Hierarchy test",
      customer: "Geneva Rock",
      customer_po: null,
    },
    fromParty: { label: "Seller", name: "Test Co", lines: [] },
    toParty: {
      label: "Customer",
      name: "Geneva Rock",
      lines: ["Ogden, UT"],
    },
    meta: {
      ...baseMeta,
      lines: [
        {
          id: "child-1",
          parentId: "parent-1",
          lineNo: 2,
          description: "Child_L2",
          qty: 1,
          uom: "EA",
          unitPrice: 5,
          extended: 5,
        },
        {
          id: "parent-1",
          lineNo: 9,
          description: "Parent_L1",
          qty: 1,
          uom: "EA",
          unitPrice: 10,
          extended: 10,
        },
        {
          id: "grand-1",
          parentId: "child-1",
          lineNo: 1,
          description: "Grandchild_L3",
          qty: 1,
          uom: "EA",
          unitPrice: 2,
          extended: 2,
        },
        {
          id: "orphan-1",
          parentId: "missing-parent",
          lineNo: 3,
          description: "OrphanRoot_L0",
          qty: 1,
          uom: "EA",
          unitPrice: 7,
          extended: 7,
        },
        {
          id: "cycle-a",
          parentId: "cycle-b",
          lineNo: 4,
          description: "CycleA_L0",
          qty: 1,
          uom: "EA",
          unitPrice: 4,
          extended: 4,
        },
        {
          id: "cycle-b",
          parentId: "cycle-a",
          lineNo: 5,
          description: "CycleB_L0",
          qty: 1,
          uom: "EA",
          unitPrice: 6,
          extended: 6,
        },
      ],
    },
    revisionIndex: 0,
    quoteResolved: {
      paymentTerms: "NET 30",
      customerContact: "Alex",
      accountManager: "Luke (555-0200)",
      quoteDescription: "HIERARCHY",
      shippingMethod: "Prepaid",
    },
  };

  const buf = buildProjectDocumentPdf(input);
  assert.ok(pdfBytesInclude(buf, "OrphanRoot_L0"));
  assert.ok(pdfBytesInclude(buf, "Parent_L1"));
  assert.ok(pdfBytesInclude(buf, "  Child_L2"));
  assert.ok(pdfBytesInclude(buf, "    Grandchild_L3"));
  assert.ok(pdfBytesInclude(buf, "CycleA_L0"));
  assert.ok(pdfBytesInclude(buf, "CycleB_L0"));

  const orphanIdx = pdfBytesIndex(buf, "OrphanRoot_L0");
  const parentIdx = pdfBytesIndex(buf, "Parent_L1");
  const childIdx = pdfBytesIndex(buf, "  Child_L2");
  const grandIdx = pdfBytesIndex(buf, "    Grandchild_L3");
  assert.ok(orphanIdx >= 0);
  assert.ok(parentIdx >= 0);
  assert.ok(childIdx >= 0);
  assert.ok(grandIdx >= 0);
  assert.ok(orphanIdx < parentIdx);
  assert.ok(parentIdx < childIdx);
  assert.ok(childIdx < grandIdx);
});

test("invoice PDF table uses hierarchical line ordering and indentation", () => {
  const input: BuildProjectDocumentPdfInput = {
    kind: "invoice",
    documentNumber: "INV-HIER-1",
    issuedDate: new Date("2026-03-29"),
    company: {
      legalName: "Keystone Supply",
      line1: "P.O. Box 129",
      line2: "",
      city: "Riverside",
      state: "UT",
      postalCode: "84334",
      country: "USA",
      phone: "(435) 720-3714",
      email: "sales@keystone-supply.com",
      physicalLine1: "12090 North Hwy 38",
      physicalLine2: "",
      physicalCity: "Deweyville",
      physicalState: "UT",
      physicalPostalCode: "84309",
      physicalCountry: "USA",
    },
    logoDataUrl: null,
    project: {
      project_number: "101365",
      project_name: "Bucket liners",
      customer: "Geneva Rock",
      customer_po: "PO-XYZ-123",
    },
    fromParty: { label: "Seller", name: "Keystone Supply", lines: [] },
    toParty: { label: "Bill to", name: "Geneva Rock", lines: ["Ogden, UT"] },
    toPartySecondary: {
      label: "Ship to",
      name: "Geneva Rock",
      lines: ["Ogden, UT"],
    },
    meta: {
      lines: [
        {
          id: "child",
          parentId: "parent",
          lineNo: 1,
          description: "InvoiceChild",
          qty: 2,
          uom: "EA",
          unitPrice: 12,
          extended: 24,
          partRef: "INV-C",
        },
        {
          id: "parent",
          lineNo: 2,
          description: "InvoiceParent",
          qty: 1,
          uom: "EA",
          unitPrice: 100,
          extended: 100,
          partRef: "INV-P",
        },
      ],
      packingLines: [],
      bolRows: [],
    },
    revisionIndex: 0,
  };

  const buf = buildProjectDocumentPdf(input);
  assert.ok(pdfBytesInclude(buf, "InvoiceParent"));
  assert.ok(pdfBytesInclude(buf, "  InvoiceChild"));
  const parentIdx = pdfBytesIndex(buf, "InvoiceParent");
  const childIdx = pdfBytesIndex(buf, "  InvoiceChild");
  assert.ok(parentIdx >= 0);
  assert.ok(childIdx >= 0);
  assert.ok(parentIdx < childIdx);
});

test("quote PDF renders option sections with per-option subtotals", () => {
  const input: BuildProjectDocumentPdfInput = {
    kind: "quote",
    documentNumber: "Q-OPT-1",
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
      physicalLine1: "12090 North Hwy 38",
      physicalLine2: "",
      physicalCity: "Deweyville",
      physicalState: "UT",
      physicalPostalCode: "84309",
      physicalCountry: "USA",
    },
    logoDataUrl: null,
    project: {
      project_number: "OPT-101",
      project_name: "Options test",
      customer: "Geneva Rock",
      customer_po: null,
    },
    fromParty: { label: "Seller", name: "Test Co", lines: [] },
    toParty: {
      label: "Customer",
      name: "Geneva Rock",
      lines: ["Ogden, UT"],
    },
    meta: {
      ...baseMeta,
      optionGroups: [{ id: "opt-a", title: "Alt Liner", lineIds: [] }],
      lines: [
        {
          id: "base-line-1",
          lineNo: 1,
          description: "Base line",
          qty: 1,
          uom: "EA",
          unitPrice: 100,
          extended: 100,
        },
        {
          id: "opt-line-1",
          optionGroupId: "opt-a",
          lineNo: 2,
          description: "Option line",
          qty: 1,
          uom: "EA",
          unitPrice: 25,
          extended: 25,
        },
      ],
    },
    revisionIndex: 0,
    quoteResolved: {
      paymentTerms: "NET 30",
      customerContact: "Alex",
      accountManager: "Luke (555-0200)",
      quoteDescription: "OPTIONS",
      shippingMethod: "Prepaid",
    },
  };
  const buf = buildProjectDocumentPdf(input);
  assert.ok(pdfBytesInclude(buf, "BASE SCOPE"));
  assert.ok(pdfBytesInclude(buf, "OPTION: ALT LINER"));
  assert.ok(pdfBytesInclude(buf, "OPTION SUBTOTAL"));
  assert.ok(pdfBytesInclude(buf, "$25.00"));
  assert.ok(pdfBytesInclude(buf, "$125.00"));
});

test("quote PDF can present options without single grand total", () => {
  const input: BuildProjectDocumentPdfInput = {
    kind: "quote",
    documentNumber: "Q-OPT-2",
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
      physicalLine1: "12090 North Hwy 38",
      physicalLine2: "",
      physicalCity: "Deweyville",
      physicalState: "UT",
      physicalPostalCode: "84309",
      physicalCountry: "USA",
    },
    logoDataUrl: null,
    project: {
      project_number: "OPT-102",
      project_name: "Options mode test",
      customer: "Geneva Rock",
      customer_po: null,
    },
    fromParty: { label: "Seller", name: "Test Co", lines: [] },
    toParty: {
      label: "Customer",
      name: "Geneva Rock",
      lines: ["Ogden, UT"],
    },
    meta: {
      ...baseMeta,
      optionGroups: [{ id: "opt-a", title: "Alt A", lineIds: [] }],
      quotePresentAsMultipleOptions: true,
      lines: [
        {
          id: "base-line-1",
          lineNo: 1,
          description: "Base line",
          qty: 1,
          uom: "EA",
          unitPrice: 50,
          extended: 50,
        },
        {
          id: "opt-line-1",
          optionGroupId: "opt-a",
          lineNo: 2,
          description: "Option line",
          qty: 1,
          uom: "EA",
          unitPrice: 10,
          extended: 10,
        },
      ],
    },
    revisionIndex: 0,
    quoteResolved: {
      paymentTerms: "NET 30",
      customerContact: "Alex",
      accountManager: "Luke (555-0200)",
      quoteDescription: "OPTIONS",
      shippingMethod: "Prepaid",
    },
  };
  const buf = buildProjectDocumentPdf(input);
  assert.ok(pdfBytesInclude(buf, "CUSTOMER TO SELECT OPTION"));
  assert.ok(pdfBytesInclude(buf, "No single grand total is presented."));
});

test("quote sections reset item numbering per section", () => {
  const sections = buildQuoteLineSections(
    [
      {
        id: "base-line-1",
        lineNo: 5,
        description: "Base line",
        qty: 1,
        uom: "EA",
        unitPrice: 50,
        extended: 50,
      },
      {
        id: "opt-line-1",
        optionGroupId: "opt-a",
        lineNo: 9,
        description: "Option line 1",
        qty: 1,
        uom: "EA",
        unitPrice: 10,
        extended: 10,
      },
      {
        id: "opt-line-1-1",
        parentId: "opt-line-1",
        optionGroupId: "opt-a",
        lineNo: 10,
        description: "Option line 1.1",
        qty: 1,
        uom: "EA",
        unitPrice: 5,
        extended: 5,
      },
      {
        id: "opt-line-2",
        optionGroupId: "opt-a",
        lineNo: 11,
        description: "Option line 2",
        qty: 1,
        uom: "EA",
        unitPrice: 12,
        extended: 12,
      },
    ],
    [{ id: "opt-a", title: "Alt A", lineIds: [] }],
  );

  assert.deepEqual(
    sections.map((section) => ({
      id: section.id,
      itemNos: section.rows.map((row) => row.displayItemNo),
    })),
    [
      { id: "base-scope", itemNos: ["1"] },
      { id: "opt-a", itemNos: ["1", "1.1", "2"] },
    ],
  );
});

test("PDF section table column widths stay fixed", () => {
  const quoteColumns = quoteLineSectionColumnStyles();
  assert.deepEqual(quoteColumns, {
    0: { cellWidth: 16 },
    1: { cellWidth: 40 },
    2: { cellWidth: 93.9 },
    3: { cellWidth: 30, halign: "right" },
  });

  const optionColumns = optionModeLineColumnStyles();
  assert.deepEqual(optionColumns, {
    0: { cellWidth: 12 },
    1: { cellWidth: 18 },
    2: { cellWidth: 66 },
    3: { cellWidth: 14 },
    4: { cellWidth: 14 },
    5: { cellWidth: 18, halign: "right" },
    6: { cellWidth: 18, halign: "right" },
  });
});

test("quote PDF overflow creates continuation row for part and description", () => {
  const expanded = expandQuoteTableRowsForOverflow([
    {
      itemNo: "1",
      partNo: "PART-1234567890-ABCDEFG",
      description:
        "This description is intentionally long so it overflows beyond the single row limit and creates continuation rows.",
      total: "$42.00",
      lineNo: 1,
    },
  ]);

  assert.ok(expanded.body.length > 1);
  assert.equal(expanded.body[0][0], "1");
  assert.equal(expanded.body[0][3], "$42.00");
  assert.equal(expanded.body[1][0], "");
  assert.equal(expanded.body[1][3], "");
  assert.ok(expanded.lineNos.every((lineNo) => lineNo === 1));
});

test("option-mode PDF overflow creates continuation row for part and description", () => {
  const expanded = expandOptionModeRowsForOverflow([
    {
      itemNo: "1.1",
      partNo: "PART-1234567890-ABCDEFG",
      description:
        "This description is intentionally long so it overflows beyond the option-mode row and creates continuation rows.",
      qty: "5",
      uom: "EA",
      unitPrice: "$10.00",
      extPrice: "$50.00",
      lineNo: 7,
      descriptionIndentPrefix: "  ",
    },
  ]);

  assert.ok(expanded.body.length > 1);
  assert.equal(expanded.body[0][0], "1.1");
  assert.equal(expanded.body[0][3], "5");
  assert.equal(expanded.body[0][6], "$50.00");
  assert.equal(expanded.body[1][0], "");
  assert.ok(expanded.body[1][2].startsWith("  "));
  assert.equal(expanded.body[1][3], "");
  assert.equal(expanded.body[1][6], "");
  assert.ok(expanded.lineNos.every((lineNo) => lineNo === 7));
});

test("quote PDF preserves long description tail text", () => {
  const tailMarker = "TAIL_MARKER_987654321";
  const longDescription =
    "This is a very long line item description that should not be truncated in PDF output when wrapping is applied. " +
    "It must continue rendering all remaining text until the end. " +
    tailMarker;
  const input: BuildProjectDocumentPdfInput = {
    kind: "quote",
    documentNumber: "Q-LONG-1",
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
      physicalLine1: "12090 North Hwy 38",
      physicalLine2: "",
      physicalCity: "Deweyville",
      physicalState: "UT",
      physicalPostalCode: "84309",
      physicalCountry: "USA",
    },
    logoDataUrl: null,
    project: {
      project_number: "LONG-1",
      project_name: "Long text",
      customer: "Geneva Rock",
      customer_po: null,
    },
    fromParty: { label: "Seller", name: "Test Co", lines: [] },
    toParty: { label: "Customer", name: "Geneva Rock", lines: ["Ogden, UT"] },
    meta: {
      ...baseMeta,
      lines: [
        {
          id: "line-1",
          lineNo: 1,
          description: longDescription,
          qty: 1,
          uom: "EA",
          unitPrice: 10,
          extended: 10,
          partRef: "PART-1",
        },
      ],
    },
    revisionIndex: 0,
    quoteResolved: {
      paymentTerms: "NET 30",
      customerContact: "Alex",
      accountManager: "Luke (555-0200)",
      quoteDescription: "LONG",
      shippingMethod: "Prepaid",
    },
  };

  const buf = buildProjectDocumentPdf(input);
  assert.ok(pdfBytesInclude(buf, tailMarker));
});

test("quote PDF renders reference figures block for imageRef lines", () => {
  const input: BuildProjectDocumentPdfInput = {
    kind: "quote",
    documentNumber: "Q-IMG-1",
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
      physicalLine1: "12090 North Hwy 38",
      physicalLine2: "",
      physicalCity: "Deweyville",
      physicalState: "UT",
      physicalPostalCode: "84309",
      physicalCountry: "USA",
    },
    logoDataUrl: null,
    project: {
      project_number: "IMG-1",
      project_name: "Image ref test",
      customer: "Geneva Rock",
      customer_po: null,
    },
    fromParty: { label: "Seller", name: "Test Co", lines: [] },
    toParty: { label: "Customer", name: "Geneva Rock", lines: ["Ogden, UT"] },
    meta: {
      ...baseMeta,
      lines: [
        {
          id: "line-1",
          lineNo: 1,
          description: "Image backed line",
          qty: 1,
          uom: "EA",
          unitPrice: 10,
          extended: 10,
          imageRef: {
            fileId: "f-1",
            dataUrl: TINY_PNG_DATA_URL,
          },
        },
      ],
    },
    revisionIndex: 0,
    quoteResolved: {
      paymentTerms: "NET 30",
      customerContact: "Alex",
      accountManager: "Luke (555-0200)",
      quoteDescription: "IMAGES",
      shippingMethod: "Prepaid",
    },
  };
  const buf = buildProjectDocumentPdf(input);
  assert.ok(pdfBytesInclude(buf, "Reference figures"));
  assert.ok(pdfBytesInclude(buf, "L1 - BASE SCOPE"));
});

test("quote PDF renders option-specific reference figure captions", () => {
  const input: BuildProjectDocumentPdfInput = {
    kind: "quote",
    documentNumber: "Q-IMG-OPT-1",
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
      physicalLine1: "12090 North Hwy 38",
      physicalLine2: "",
      physicalCity: "Deweyville",
      physicalState: "UT",
      physicalPostalCode: "84309",
      physicalCountry: "USA",
    },
    logoDataUrl: null,
    project: {
      project_number: "IMG-2",
      project_name: "Image option test",
      customer: "Geneva Rock",
      customer_po: null,
    },
    fromParty: { label: "Seller", name: "Test Co", lines: [] },
    toParty: { label: "Customer", name: "Geneva Rock", lines: ["Ogden, UT"] },
    meta: {
      ...baseMeta,
      optionGroups: [{ id: "opt-1", title: "Alt Liner", lineIds: [] }],
      lines: [
        {
          id: "line-1",
          lineNo: 1,
          description: "Option image line",
          qty: 1,
          uom: "EA",
          unitPrice: 10,
          extended: 10,
          optionGroupId: "opt-1",
          imageRef: {
            fileId: "f-1",
            dataUrl: TINY_PNG_DATA_URL,
          },
        },
      ],
    },
    revisionIndex: 0,
    quoteResolved: {
      paymentTerms: "NET 30",
      customerContact: "Alex",
      accountManager: "Luke (555-0200)",
      quoteDescription: "IMAGES",
      shippingMethod: "Prepaid",
    },
  };
  const buf = buildProjectDocumentPdf(input);
  assert.ok(pdfBytesInclude(buf, "L1 - OPTION: ALT LINER"));
});

test("purchase order PDF supports option sections with selection-required mode", () => {
  const input: BuildProjectDocumentPdfInput = {
    kind: "purchase_order",
    documentNumber: "PO-OPT-1",
    issuedDate: new Date("2026-03-29"),
    company: {
      legalName: "Keystone Supply",
      line1: "P.O. Box 129",
      line2: "",
      city: "Riverside",
      state: "UT",
      postalCode: "84334",
      country: "USA",
      phone: "(435) 720-3714",
      email: "sales@keystone-supply.com",
      physicalLine1: "12090 North Hwy 38",
      physicalLine2: "",
      physicalCity: "Deweyville",
      physicalState: "UT",
      physicalPostalCode: "84309",
      physicalCountry: "USA",
    },
    logoDataUrl: null,
    project: {
      project_number: "POPT-1",
      project_name: "PO options test",
      customer: "Acme",
      customer_po: "PO-77",
    },
    fromParty: { label: "Requesting", name: "Keystone Supply", lines: [] },
    toParty: { label: "Vendor", name: "Acme", lines: ["Ogden, UT"] },
    meta: {
      lines: [
        {
          id: "base-line",
          lineNo: 1,
          description: "Base scope line",
          qty: 1,
          uom: "EA",
          unitPrice: 100,
          extended: 100,
        },
        {
          id: "opt-line",
          lineNo: 2,
          description: "Alt option line",
          qty: 1,
          uom: "EA",
          unitPrice: 20,
          extended: 20,
          optionGroupId: "opt-po",
        },
      ],
      optionGroups: [{ id: "opt-po", title: "Alternate Layout", lineIds: [] }],
      quotePresentAsMultipleOptions: true,
      packingLines: [],
      bolRows: [],
    },
    revisionIndex: 0,
  };
  const buf = buildProjectDocumentPdf(input);
  assert.ok(pdfBytesInclude(buf, "BASE SCOPE"));
  assert.ok(pdfBytesInclude(buf, "OPTION: ALTERNATE LAYOUT"));
  assert.ok(pdfBytesInclude(buf, "OPTION SELECTION REQUIRED"));
});

test("purchase order PDF adds continuation markers when first page overflows", () => {
  const lines = Array.from({ length: 90 }, (_, index) => ({
    lineNo: index + 1,
    description: `Overflow line ${index + 1} - extended description to force pagination`,
    qty: 1,
    uom: "EA",
    unitPrice: 10,
    extended: 10,
    partRef: `PART-${index + 1}`,
  }));

  const input: BuildProjectDocumentPdfInput = {
    kind: "purchase_order",
    documentNumber: "PO-CONT-1",
    issuedDate: new Date("2026-03-29"),
    company: {
      legalName: "Keystone Supply",
      line1: "P.O. Box 129",
      line2: "",
      city: "Riverside",
      state: "UT",
      postalCode: "84334",
      country: "USA",
      phone: "(435) 720-3714",
      email: "sales@keystone-supply.com",
      physicalLine1: "12090 North Hwy 38",
      physicalLine2: "",
      physicalCity: "Deweyville",
      physicalState: "UT",
      physicalPostalCode: "84309",
      physicalCountry: "USA",
    },
    logoDataUrl: null,
    project: {
      project_number: "PO-CONT",
      project_name: "Continuation test",
      customer: "Acme",
      customer_po: "PO-77",
    },
    fromParty: { label: "Requesting", name: "Keystone Supply", lines: [] },
    toParty: { label: "Vendor", name: "Acme", lines: ["Ogden, UT"] },
    meta: {
      lines,
      optionGroups: [],
      packingLines: [],
      bolRows: [],
    },
    revisionIndex: 0,
  };

  const buf = buildProjectDocumentPdf(input);
  assert.ok(pdfBytesInclude(buf, "Continues on next page"));
  assert.ok(pdfBytesInclude(buf, "Continued from page 1"));
});

test("buildDocumentDownloadFilename quote matches plan shape", () => {
  const d = new Date(2026, 2, 29);
  assert.equal(
    buildDocumentDownloadFilename("101363", "quote", "Bucket liners", 0, d),
    "101363_Q-Bucket_liners-03.29.2026 (v0).pdf",
  );
});

test("buildDocumentDownloadFilename uses correct code per kind", () => {
  const d = new Date(2026, 0, 5);
  for (const kind of PROJECT_DOCUMENT_KINDS) {
    assert.equal(
      buildDocumentDownloadFilename("1", kind, "Job", 3, d),
      `1_${DOCUMENT_KIND_FILE_CODE[kind]}-Job-01.05.2026 (v3).pdf`,
    );
  }
});

test("buildDocumentDownloadFilename empty project name becomes PROJECT", () => {
  const d = new Date(2026, 1, 1);
  assert.equal(
    buildDocumentDownloadFilename("99", "invoice", "", 0, d),
    "99_INV-PROJECT-02.01.2026 (v0).pdf",
  );
  assert.equal(
    buildDocumentDownloadFilename("99", "invoice", "   ", 0, d),
    "99_INV-PROJECT-02.01.2026 (v0).pdf",
  );
});

test("buildDocumentDownloadFilename replaces forbidden characters in name", () => {
  const d = new Date(2026, 5, 15);
  assert.equal(
    buildDocumentDownloadFilename("1", "bol", 'a/b:c*d?x"y', 0, d),
    "1_BOL-a-b-c-d-x-y-06.15.2026 (v0).pdf",
  );
});

test("buildDocumentDownloadFilename truncates long project name", () => {
  const d = new Date(2026, 0, 1);
  const long = "x".repeat(150);
  const expected = `1_Q-${"x".repeat(100)}-01.01.2026 (v0).pdf`;
  assert.equal(buildDocumentDownloadFilename("1", "quote", long, 0, d), expected);
});

test("buildDocumentDownloadFilename strips spaces from project number", () => {
  const d = new Date(2026, 0, 1);
  assert.equal(
    buildDocumentDownloadFilename("10 13 63", "quote", "A", 12, d),
    "101363_Q-A-01.01.2026 (v12).pdf",
  );
});

test("normalizeRevisionIndex maps nullable values to non-negative revision", () => {
  assert.equal(normalizeRevisionIndex(undefined), 0);
  assert.equal(normalizeRevisionIndex(-5), 0);
  assert.equal(normalizeRevisionIndex(0), 0);
  assert.equal(normalizeRevisionIndex(2), 2);
});

test("formatPdfJobRevLine", () => {
  assert.equal(formatPdfJobRevLine("101363", 2), "101363 REV. 2");
  assert.equal(formatPdfJobRevLine("101363"), "101363 REV. 0");
});

test("formatRevisionSuffix always returns (vN) from revision index", () => {
  assert.equal(formatRevisionSuffix(undefined), "(v0)");
  assert.equal(formatRevisionSuffix(0), "(v0)");
  assert.equal(formatRevisionSuffix(12), "(v12)");
});
