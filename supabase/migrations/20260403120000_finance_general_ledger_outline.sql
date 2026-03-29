-- Outline schema for future QuickBooks-class / company-wide GL reporting.
-- Not wired into the app yet; safe to apply for forward-compatible journaling.
--
-- Pattern: one journal entry (header) + many lines (debits/credits). Lines may
-- reference public.projects for job costing. Use numeric(14,2) like currency fields elsewhere.

CREATE TABLE IF NOT EXISTS public.finance_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  entry_date date NOT NULL,
  memo text,
  source text,
  external_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_journal_entries_entry_date
  ON public.finance_journal_entries (entry_date DESC);

COMMENT ON TABLE public.finance_journal_entries IS
  'General ledger journal entry header; pair with finance_journal_lines for double-entry rows';

CREATE TABLE IF NOT EXISTS public.finance_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  journal_entry_id uuid NOT NULL REFERENCES public.finance_journal_entries (id) ON DELETE CASCADE,
  account_code text NOT NULL,
  line_memo text,
  debit numeric(14, 2) NOT NULL DEFAULT 0,
  credit numeric(14, 2) NOT NULL DEFAULT 0,
  project_id uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  CONSTRAINT finance_journal_lines_debit_non_negative CHECK (debit >= 0),
  CONSTRAINT finance_journal_lines_credit_non_negative CHECK (credit >= 0)
);

CREATE INDEX IF NOT EXISTS idx_finance_journal_lines_journal_entry_id
  ON public.finance_journal_lines (journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_finance_journal_lines_project_id
  ON public.finance_journal_lines (project_id)
WHERE
  project_id IS NOT NULL;

COMMENT ON TABLE public.finance_journal_lines IS
  'Ledger lines; sum(debit)==sum(credit) per journal_entry_id should be enforced in app or trigger';
COMMENT ON COLUMN public.finance_journal_lines.project_id IS
  'Optional job link for project P&L rollups alongside public.projects totals';

ALTER TABLE public.finance_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_journal_lines ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_journal_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_journal_lines TO authenticated;
GRANT ALL ON public.finance_journal_entries TO service_role;
GRANT ALL ON public.finance_journal_lines TO service_role;

DROP POLICY IF EXISTS "finance_journal_entries_authenticated_all"
ON public.finance_journal_entries;

DROP POLICY IF EXISTS "finance_journal_lines_authenticated_all"
ON public.finance_journal_lines;

CREATE POLICY "finance_journal_entries_authenticated_all" ON public.finance_journal_entries FOR ALL TO authenticated
USING (true)
WITH
  CHECK (true);

CREATE POLICY "finance_journal_lines_authenticated_all" ON public.finance_journal_lines FOR ALL TO authenticated
USING (true)
WITH
  CHECK (true);
