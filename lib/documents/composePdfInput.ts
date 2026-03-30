import type { CustomerRow, CustomerShippingRow } from "@/lib/customerQueries";
import type { ProjectRow } from "@/lib/projectTypes";
import type { VendorRow } from "@/lib/vendorQueries";
import type {
  ProjectDocumentDraftMeta,
  ProjectDocumentKind,
} from "@/lib/documentTypes";
import {
  buildProjectDocumentPdf,
  type BuildProjectDocumentPdfInput,
  type PdfParty,
  type PdfProjectContext,
  type QuotePdfResolved,
  vendorToParty,
} from "@/lib/documents/buildProjectDocumentPdf";
import { getCompanyBlock, getQuoteAccountManagerDefault } from "@/lib/documents/company";

function linesFromCustomer(c: CustomerRow): string[] {
  const lines: string[] = [];
  if (c.billing_line1) lines.push(c.billing_line1);
  if (c.billing_line2) lines.push(c.billing_line2);
  const city = [c.billing_city, c.billing_state, c.billing_postal_code]
    .filter(Boolean)
    .join(", ");
  if (city) lines.push(city);
  if (c.billing_country) lines.push(c.billing_country);
  return lines;
}

function partyFromShipMeta(
  label: string,
  meta: ProjectDocumentDraftMeta,
  fallbackName: string,
): PdfParty {
  const lines: string[] = [];
  if (meta.shipToLine1) lines.push(meta.shipToLine1);
  if (meta.shipToLine2) lines.push(meta.shipToLine2);
  const city = [
    meta.shipToCity,
    meta.shipToState,
    meta.shipToPostal,
  ]
    .filter(Boolean)
    .join(", ");
  if (city) lines.push(city);
  if (meta.shipToCountry) lines.push(meta.shipToCountry);
  return {
    label,
    name: meta.shipToLabel?.trim() || fallbackName,
    lines,
  };
}

function partyFromShippingRow(
  label: string,
  c: CustomerRow,
  ship: CustomerShippingRow,
): PdfParty {
  const lines: string[] = [];
  if (ship.line1) lines.push(ship.line1);
  if (ship.line2) lines.push(ship.line2);
  const city = [ship.city, ship.state, ship.postal_code]
    .filter(Boolean)
    .join(", ");
  if (city) lines.push(city);
  if (ship.country) lines.push(ship.country);
  return {
    label,
    name: c.legal_name,
    lines,
  };
}

function sellerParty(): PdfParty {
  const c = getCompanyBlock();
  const lines: string[] = [];
  if (c.line1) lines.push(c.line1);
  if (c.line2) lines.push(c.line2);
  const city = [c.city, c.state, c.postalCode].filter(Boolean).join(", ");
  if (city) lines.push(city);
  if (c.country) lines.push(c.country);
  if (c.phone) lines.push(`Tel: ${c.phone}`);
  return { label: "Seller", name: c.legalName, lines };
}

export function composeProjectDocumentPdfInput(args: {
  kind: ProjectDocumentKind;
  documentNumber: string;
  issuedDate: Date;
  logoDataUrl: string | null;
  project: ProjectRow;
  meta: ProjectDocumentDraftMeta;
  vendor: VendorRow | null;
  customer: CustomerRow | null;
  defaultShipTo: CustomerShippingRow | null;
  /** Row `version` from `project_documents`; PDF `REV.` uses `pdfRevFromDocumentVersion`. */
  documentVersion?: number;
}): BuildProjectDocumentPdfInput {
  const company = getCompanyBlock();
  const fromParty = sellerParty();
  const proj: PdfProjectContext = {
    project_number: String(args.project.project_number ?? ""),
    project_name: args.project.project_name ?? null,
    customer: args.project.customer ?? null,
    customer_po: args.project.customer_po ?? null,
  };

  let toParty: PdfParty;
  let toPartySecondary: PdfParty | undefined;

  switch (args.kind) {
    case "rfq":
      toParty = args.vendor
        ? vendorToParty(args.vendor, "Supplier (quote to)")
        : { label: "Supplier", name: "— Select vendor —", lines: [] };
      break;
    case "purchase_order":
      toParty = args.vendor
        ? vendorToParty(args.vendor, "Vendor")
        : { label: "Vendor", name: "— Select vendor —", lines: [] };
      if (
        args.meta.shipToLine1 ||
        args.meta.shipToCity ||
        args.meta.shipToLabel
      ) {
        toPartySecondary = partyFromShipMeta(
          "Ship to / deliver to",
          args.meta,
          args.customer?.legal_name ?? args.project.customer ?? "Ship to",
        );
      }
      break;
    case "quote": {
      const c = args.customer;
      const legal = c?.legal_name ?? args.project.customer ?? "Customer";
      toParty = c
        ? { label: "Customer", name: c.legal_name, lines: linesFromCustomer(c) }
        : {
            label: "Customer",
            name: legal,
            lines: [
              args.meta.billToLine1,
              args.meta.billToLine2,
              [args.meta.billToCity, args.meta.billToState]
                .filter(Boolean)
                .join(", "),
            ].filter(Boolean) as string[],
          };
      const ship =
        args.defaultShipTo && c
          ? partyFromShippingRow("Ship to", c, args.defaultShipTo)
          : null;
      if (args.meta.shipToLine1 || args.meta.shipToCity) {
        toPartySecondary = partyFromShipMeta("Ship to", args.meta, legal);
      } else if (ship) {
        toPartySecondary = ship;
      } else {
        toPartySecondary = {
          label: "Ship to",
          name: toParty.name,
          lines: [...toParty.lines],
        };
      }
      break;
    }
    case "invoice": {
      const c = args.customer;
      const legal = c?.legal_name ?? args.project.customer ?? "Customer";
      toParty = c
        ? { label: "Bill to", name: c.legal_name, lines: linesFromCustomer(c) }
        : {
            label: "Bill to",
            name: legal,
            lines: [
              args.meta.billToLine1,
              args.meta.billToLine2,
              [args.meta.billToCity, args.meta.billToState]
                .filter(Boolean)
                .join(", "),
            ].filter(Boolean) as string[],
          };
      const ship =
        args.defaultShipTo && c
          ? partyFromShippingRow("Ship to", c, args.defaultShipTo)
          : null;
      if (args.meta.shipToLine1 || args.meta.shipToCity) {
        toPartySecondary = partyFromShipMeta("Ship to", args.meta, legal);
      } else if (ship) {
        toPartySecondary = ship;
      }
      break;
    }
    case "packing_list":
    case "bol":
      toParty = partyFromShipMeta(
        "Consignee",
        args.meta,
        args.customer?.legal_name ??
          args.project.customer ??
          "Consignee",
      );
      break;
    default:
      toParty = { label: "To", name: "", lines: [] };
  }

  let quoteResolved: QuotePdfResolved | undefined;
  if (args.kind === "quote") {
    const c = args.customer;
    const projName = (args.project.project_name ?? "").trim();
    quoteResolved = {
      quoteDescription:
        args.meta.quoteDescription?.trim() ||
        (projName ? projName.toUpperCase() : "PROJECT"),
      shippingMethod:
        args.meta.shippingMethod?.trim() ||
        args.meta.freightTerms?.trim() ||
        "",
      paymentTerms:
        args.meta.paymentTerms?.trim() || c?.payment_terms?.trim() || "",
      customerContact:
        args.meta.customerContactDisplay?.trim() ||
        [c?.contact_name, c?.contact_phone].filter(Boolean).join(" · ") ||
        "",
      accountManager:
        args.meta.accountManagerDisplay?.trim() ||
        getQuoteAccountManagerDefault(),
    };
  }

  return {
    kind: args.kind,
    documentNumber: args.documentNumber,
    issuedDate: args.issuedDate,
    company,
    logoDataUrl: args.logoDataUrl,
    project: proj,
    fromParty,
    toParty,
    toPartySecondary,
    meta: args.meta,
    documentVersion: args.documentVersion,
    quoteResolved,
  };
}

export function generateProjectDocumentPdfBuffer(args: {
  kind: ProjectDocumentKind;
  documentNumber: string;
  issuedDate: Date;
  logoDataUrl: string | null;
  project: ProjectRow;
  meta: ProjectDocumentDraftMeta;
  vendor: VendorRow | null;
  customer: CustomerRow | null;
  defaultShipTo: CustomerShippingRow | null;
  documentVersion?: number;
}): ArrayBuffer {
  const input = composeProjectDocumentPdfInput(args);
  return buildProjectDocumentPdf(input);
}
