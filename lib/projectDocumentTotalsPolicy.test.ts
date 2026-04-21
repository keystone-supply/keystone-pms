import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  documentKindSyncsFinancialTotalsToProject,
  projectPatchFromSavedQuoteOrInvoice,
  sumDocumentLineExtendeds,
} from "@/lib/projectDocumentTotalsPolicy";
import type { ProjectDocumentDraftMeta } from "@/lib/documentTypes";

describe("sumDocumentLineExtendeds", () => {
  it("sums extended and rounds to cents", () => {
    assert.equal(
      sumDocumentLineExtendeds([
        {
          lineNo: 1,
          description: "a",
          qty: 1,
          uom: "EA",
          unitPrice: 10.005,
          extended: 10.005,
        },
        {
          lineNo: 2,
          description: "b",
          qty: 2,
          uom: "EA",
          unitPrice: 3,
          extended: 6,
        },
      ]),
      16.01,
    );
  });

  it("ignores non-finite extended values", () => {
    assert.equal(
      sumDocumentLineExtendeds([
        {
          lineNo: 1,
          description: "a",
          qty: 1,
          uom: "EA",
          unitPrice: 1,
          extended: Number.NaN,
        },
        {
          lineNo: 2,
          description: "b",
          qty: 1,
          uom: "EA",
          unitPrice: 5,
          extended: 5,
        },
      ]),
      5,
    );
  });
});

describe("projectPatchFromSavedQuoteOrInvoice", () => {
  const meta = (lines: ProjectDocumentDraftMeta["lines"]): ProjectDocumentDraftMeta => ({
    lines,
    packingLines: [],
    bolRows: [],
  });

  it("maps quote to total_quoted", () => {
    const patch = projectPatchFromSavedQuoteOrInvoice(
      "quote",
      meta([
        {
          lineNo: 1,
          description: "x",
          qty: 1,
          uom: "EA",
          unitPrice: 100,
          extended: 100,
        },
      ]),
    );
    assert.deepEqual(patch, { total_quoted: 100 });
  });

  it("maps quote to total_quoted including quote footer adjustments", () => {
    const patch = projectPatchFromSavedQuoteOrInvoice(
      "quote",
      {
        lines: [
          {
            lineNo: 1,
            description: "x",
            qty: 1,
            uom: "EA",
            unitPrice: 100,
            extended: 100,
          },
        ],
        quotePdfTaxAmount: 5,
        quotePdfLogisticsAmount: 10,
        quotePdfOtherAmount: 2.5,
        packingLines: [],
        bolRows: [],
      },
    );
    assert.deepEqual(patch, { total_quoted: 117.5 });
  });

  it("maps invoice to invoiced_amount", () => {
    const patch = projectPatchFromSavedQuoteOrInvoice(
      "invoice",
      meta([
        {
          lineNo: 1,
          description: "x",
          qty: 1,
          uom: "EA",
          unitPrice: 250,
          extended: 250,
        },
      ]),
    );
    assert.deepEqual(patch, { invoiced_amount: 250 });
  });

  it("returns null for RFQ", () => {
    assert.equal(
      projectPatchFromSavedQuoteOrInvoice(
        "rfq",
        meta([
          {
            lineNo: 1,
            description: "x",
            qty: 1,
            uom: "EA",
            unitPrice: 1,
            extended: 1,
          },
        ]),
      ),
      null,
    );
  });
});

describe("documentKindSyncsFinancialTotalsToProject", () => {
  it("is true only for quote and invoice", () => {
    assert.equal(documentKindSyncsFinancialTotalsToProject("quote"), true);
    assert.equal(documentKindSyncsFinancialTotalsToProject("invoice"), true);
    assert.equal(documentKindSyncsFinancialTotalsToProject("rfq"), false);
  });
});
