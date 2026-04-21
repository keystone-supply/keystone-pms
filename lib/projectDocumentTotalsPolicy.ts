/**
 * Authoritative totals for finance rollups (dashboard, pipeline, exports).
 *
 * Rule:
 * - `projects.total_quoted` and `projects.invoiced_amount` are the **reporting source of truth**
 *   (see `lib/dashboardMetrics.ts`).
 * - **Quote and invoice document drafts** carry line items in `metadata.lines`. When such a draft
 *   is saved, we **push** the rounded customer total onto the matching project column:
 *   - quotes use line subtotal + optional quote footer adjustments (tax/logistics/other)
 *   - invoices use line subtotal
 *   This keeps project totals aligned with customer-facing document totals.
 * - Detailed cost breakdown (markups, vendor cost, actuals) still lives on `projects` and in
 *   `metadata.quoteFinancialsSnapshot` as point-in-time audit — only the customer-facing total
 *   fields listed below are overwritten from document lines on save.
 */

import type {
  DocumentLineItem,
  ProjectDocumentDraftMeta,
  ProjectDocumentKind,
} from "@/lib/documentTypes";
import type { ProjectRow } from "@/lib/projectTypes";

/** Rounded currency sum of line extended amounts (customer subtotal on the PDF). */
export function sumDocumentLineExtendeds(lines: DocumentLineItem[]): number {
  let sum = 0;
  for (const line of lines) {
    const ext = line.extended;
    if (typeof ext === "number" && Number.isFinite(ext)) {
      sum += ext;
    }
  }
  return Math.round(sum * 100) / 100;
}

function finiteOrZero(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function sumQuoteGrandTotal(meta: ProjectDocumentDraftMeta): number {
  const subtotal = sumDocumentLineExtendeds(meta.lines ?? []);
  const total =
    subtotal +
    finiteOrZero(meta.quotePdfTaxAmount) +
    finiteOrZero(meta.quotePdfLogisticsAmount) +
    finiteOrZero(meta.quotePdfOtherAmount);
  return Math.round(total * 100) / 100;
}

/** Kinds whose line totals should sync to `projects` on save. */
export function documentKindSyncsFinancialTotalsToProject(
  kind: ProjectDocumentKind,
): kind is "quote" | "invoice" {
  return kind === "quote" || kind === "invoice";
}

/**
 * Patch to apply on `projects` after persisting a quote or invoice document draft.
 * Returns `null` if nothing to write (no lines / non-finite total).
 */
export function projectPatchFromSavedQuoteOrInvoice(
  kind: ProjectDocumentKind,
  meta: ProjectDocumentDraftMeta,
): Partial<Pick<ProjectRow, "total_quoted" | "invoiced_amount">> | null {
  if (!documentKindSyncsFinancialTotalsToProject(kind)) return null;
  const total = kind === "quote" ? sumQuoteGrandTotal(meta) : sumDocumentLineExtendeds(meta.lines ?? []);
  if (!Number.isFinite(total)) return null;
  if (kind === "quote") return { total_quoted: total };
  return { invoiced_amount: total };
}
