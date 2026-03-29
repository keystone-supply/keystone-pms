/** Project PDF document kinds (matches `project_documents.kind` in Supabase). */

import type { QuoteFinancialsSnapshotV1 } from "@/lib/quoteFinancialsSnapshot";

export type ProjectDocumentKind =
  | "rfq"
  | "quote"
  | "purchase_order"
  | "packing_list"
  | "bol"
  | "invoice";

export const PROJECT_DOCUMENT_KINDS: readonly ProjectDocumentKind[] = [
  "rfq",
  "quote",
  "purchase_order",
  "packing_list",
  "bol",
  "invoice",
] as const;

export const DOCUMENT_KIND_LABEL: Record<ProjectDocumentKind, string> = {
  rfq: "Request for quotation",
  quote: "Quotation",
  purchase_order: "Purchase order",
  packing_list: "Packing list",
  bol: "Bill of lading",
  invoice: "Invoice",
};

/** RGB 0–255 for jsPDF accents. */
export const DOCUMENT_KIND_ACCENT: Record<ProjectDocumentKind, [number, number, number]> = {
  rfq: [45, 122, 115],
  quote: [37, 71, 121],
  purchase_order: [180, 125, 40],
  packing_list: [40, 120, 72],
  bol: [196, 95, 28],
  invoice: [88, 55, 135],
};

export type DocumentLineItem = {
  lineNo: number;
  description: string;
  qty: number;
  uom: string;
  unitPrice: number;
  extended: number;
  partRef?: string;
};

export type PackingLineItem = {
  lineNo: number;
  description: string;
  quantity: number;
  uom: string;
  weightLb?: number;
  dims?: string;
};

export type BolCommoditiesRow = {
  description: string;
  weightLb?: number;
  qty: number;
  nmfc?: string;
};

/** Editable payload stored in `project_documents.metadata` / UI state. */
export type ProjectDocumentDraftMeta = {
  lines: DocumentLineItem[];
  /** For packing lists */
  packingLines?: PackingLineItem[];
  /** BOL commodity rows */
  bolRows?: BolCommoditiesRow[];
  shipToLabel?: string;
  shipToLine1?: string;
  shipToLine2?: string;
  shipToCity?: string;
  shipToState?: string;
  shipToPostal?: string;
  shipToCountry?: string;
  billToLine1?: string;
  billToLine2?: string;
  billToCity?: string;
  billToState?: string;
  billToPostalOverride?: string;
  /** Customer-facing quote validity end (ISO date string) */
  validUntil?: string;
  /** RFQ response requested by */
  responseDue?: string;
  freightTerms?: string;
  incoterms?: string;
  carrier?: string;
  scac?: string;
  bolNumber?: string;
  notes?: string;
  internalNotes?: string;
  /** Captured project financial fields when the quote/invoice draft was saved. */
  quoteFinancialsSnapshot?: QuoteFinancialsSnapshotV1;
};
