import assert from "node:assert/strict";
import { test } from "node:test";

import type { CustomerRow, CustomerShippingRow } from "@/lib/customerQueries";
import type { ProjectDocumentDraftMeta } from "@/lib/documentTypes";
import { composeProjectDocumentPdfInput } from "@/lib/documents/composePdfInput";
import type { ProjectRow } from "@/lib/projectTypes";

const baseProject: ProjectRow = {
  project_number: "101365",
  project_name: "Tuesday Test",
  customer: "Acme Industrial",
};

const baseMeta: ProjectDocumentDraftMeta = {
  lines: [
    {
      lineNo: 1,
      description: "Line",
      qty: 1,
      uom: "EA",
      unitPrice: 1,
      extended: 1,
    },
  ],
};

const customer: CustomerRow = {
  id: "cust-1",
  legal_name: "Acme Industrial",
  account_code: null,
  contact_name: null,
  contact_email: null,
  contact_phone: null,
  billing_line1: "100 Billing Ave",
  billing_line2: null,
  billing_city: "Ogden",
  billing_state: "UT",
  billing_postal_code: "84401",
  billing_country: "USA",
  ap_contact_name: null,
  ap_contact_phone: null,
  ap_contact_email: null,
  payment_terms: null,
  status: "active",
  notes: null,
  follow_up_at: null,
  created_at: "2026-04-01T00:00:00.000Z",
  updated_at: "2026-04-01T00:00:00.000Z",
};

const shipping: CustomerShippingRow = {
  id: "ship-1",
  customer_id: "cust-1",
  label: "Main plant",
  line1: "200 Ship Rd",
  line2: null,
  city: "Salt Lake City",
  state: "UT",
  postal_code: "84101",
  country: "USA",
  is_default: true,
  created_at: "2026-04-01T00:00:00.000Z",
  updated_at: "2026-04-01T00:00:00.000Z",
};

test("BOL consignee uses customer and shipping address", () => {
  const input = composeProjectDocumentPdfInput({
    kind: "bol",
    documentNumber: "BOL-1",
    issuedDate: new Date("2026-04-21"),
    logoDataUrl: null,
    project: baseProject,
    meta: baseMeta,
    vendor: null,
    customer,
    defaultShipTo: shipping,
    documentVersion: 1,
  });

  assert.equal(input.toParty.label, "Consignee");
  assert.equal(input.toParty.name, "Acme Industrial");
  assert.deepEqual(input.toParty.lines, [
    "200 Ship Rd",
    "Salt Lake City, UT, 84101",
    "USA",
  ]);
});

test("packing list consignee uses customer and shipping address", () => {
  const input = composeProjectDocumentPdfInput({
    kind: "packing_list",
    documentNumber: "PL-1",
    issuedDate: new Date("2026-04-21"),
    logoDataUrl: null,
    project: baseProject,
    meta: baseMeta,
    vendor: null,
    customer,
    defaultShipTo: shipping,
    documentVersion: 1,
  });

  assert.equal(input.toParty.label, "Consignee");
  assert.equal(input.toParty.name, "Acme Industrial");
  assert.deepEqual(input.toParty.lines, [
    "200 Ship Rd",
    "Salt Lake City, UT, 84101",
    "USA",
  ]);
});
