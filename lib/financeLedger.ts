/**
 * Types for future company-wide / QuickBooks-class reporting (general journal).
 *
 * Schema: `public.finance_journal_entries` and `public.finance_journal_lines` — see migration
 * `supabase/migrations/20260403120000_finance_general_ledger_outline.sql`.
 *
 * Intended use:
 * - Double-entry lines optionally tied to `projects.id` for job costing.
 * - `external_ref` for QuickBooks/Xero sync or import batch ids.
 */

/** Header row: one balanced journal entry (multiple lines). */
export type FinanceJournalEntryRow = {
  id: string;
  entry_date: string;
  memo: string | null;
  source: string | null;
  external_ref: string | null;
  created_at: string;
};

/** Line row: debit/credit to an account, optional project link. */
export type FinanceJournalLineRow = {
  id: string;
  journal_entry_id: string;
  account_code: string;
  line_memo: string | null;
  debit: string | number;
  credit: string | number;
  project_id: string | null;
};

export const FINANCE_JOURNAL_LINE_SELECT =
  "id, journal_entry_id, account_code, line_memo, debit, credit, project_id" as const;

export const FINANCE_JOURNAL_ENTRY_SELECT =
  "id, entry_date, memo, source, external_ref, created_at" as const;
