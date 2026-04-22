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

/** Minimal JSON value shape for editor payloads in metadata. */
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JSONValue }
  | JSONValue[];

/** Minimal Tiptap-compatible JSON document/node type. */
export type TiptapJSON = { [key: string]: JSONValue };

export type DocumentLineItem = {
  id?: string;
  lineNo: number;
  description: string;
  descriptionRich?: TiptapJSON;
  qty: number;
  uom: string;
  unitPrice: number;
  extended: number;
  partRef?: string;
  sourceCalcLineId?: string;
  parentId?: string | null;
  optionGroupId?: string | null;
  calcTapeId?: string | null;
  calcLineId?: string | null;
  calcSyncBaseline?: {
    description: string;
    qty: number;
    uom: string;
    totalSell: number;
  } | null;
  imageRef?: {
    fileId: string;
    storageKey?: string;
    /** Transient, client-side hydrated image payload for PDF rendering. */
    dataUrl?: string;
  } | null;
};

export type TemplateChip = {
  label: string;
  text: string;
};

export type OptionGroup = {
  id: string;
  title: string;
  lineIds: string[];
};

export type CalcSyncConflictReason = "calc_updated" | "missing_baseline" | "missing_calc_line";

export type CalcSyncConflict = {
  calcLineId: string;
  lineNo: number;
  reason: CalcSyncConflictReason;
};

export const DEFAULT_TEMPLATE_CHIPS: TemplateChip[] = [
  {
    label: "Paint Exclusion",
    text: "THIS QUOTE DOES NOT INCLUDE PAINT",
  },
  {
    label: "Material Grade",
    text: "Materials: A36",
  },
  {
    label: "Drawing Reference",
    text: "Drawing #Cxxxx Rev X",
  },
  {
    label: "Payment Terms",
    text: "NET 30",
  },
];

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
  /** Workspace metadata pane-only title override (editor UX only). */
  workspaceDocumentTitle?: string;
  /** Workspace metadata pane-only customer override (editor UX only). */
  workspaceCustomerName?: string;
  /** Workspace metadata pane-only project override (editor UX only). */
  workspaceProjectName?: string;
  optionGroups?: OptionGroup[];
  /** Quote mode: render options as alternatives without one grand total. */
  quotePresentAsMultipleOptions?: boolean;
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
  /** Quote PDF: headline description (defaults to uppercase project name in compose). */
  quoteDescription?: string;
  /** Quote PDF: shipping method row (falls back to freightTerms if empty). */
  shippingMethod?: string;
  /** Quote PDF: payment terms (e.g. NET 30); CRM default when unset. */
  paymentTerms?: string;
  /** Quote PDF: lead time text. */
  leadTime?: string;
  /** Quote PDF: overrides auto-built customer contact line from CRM. */
  customerContactDisplay?: string;
  /** Quote PDF: account manager line (name / phone); company env default when unset. */
  accountManagerDisplay?: string;
  /** Quote PDF totals block: optional rows after line-item subtotal. */
  quotePdfTaxRatePct?: number | null;
  quotePdfTaxAmount?: number | null;
  quotePdfLogisticsAmount?: number | null;
  quotePdfOtherAmount?: number | null;
};
