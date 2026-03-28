-- Sales command board: explicit pipeline stage + milestone timestamps for /sales board.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS sales_command_stage text;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS rfq_vendors_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS quote_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS po_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS in_process_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoiced_at timestamptz;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_sales_command_stage_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_sales_command_stage_check CHECK (
    sales_command_stage IS NULL
    OR sales_command_stage IN (
      'rfq_customer',
      'rfq_vendors',
      'quote_sent',
      'po_issued',
      'in_process',
      'complete',
      'delivered',
      'invoiced',
      'lost'
    )
  );

ALTER TABLE public.projects
  ALTER COLUMN sales_command_stage SET DEFAULT 'rfq_customer';

COMMENT ON COLUMN public.projects.sales_command_stage IS 'Sales command board column id: rfq_customer … invoiced, or lost';
COMMENT ON COLUMN public.projects.rfq_vendors_sent_at IS 'First time RFQ was sent to vendors (board column)';
COMMENT ON COLUMN public.projects.quote_sent_at IS 'First time quote was sent to customer';
COMMENT ON COLUMN public.projects.po_issued_at IS 'First time customer PO received / PO column';
COMMENT ON COLUMN public.projects.in_process_at IS 'First time moved to shop in-process column';
COMMENT ON COLUMN public.projects.completed_at IS 'First time marked project complete on board';
COMMENT ON COLUMN public.projects.delivered_at IS 'First time marked delivered on board';
COMMENT ON COLUMN public.projects.invoiced_at IS 'First time marked invoiced on board';

CREATE INDEX IF NOT EXISTS idx_projects_sales_command_stage
  ON public.projects (sales_command_stage);

-- Backfill stage from legacy fields (same priority as app inferLegacyBoardColumn).
UPDATE public.projects
SET sales_command_stage = 'lost'
WHERE sales_command_stage IS NULL
  AND (
    project_status = 'cancelled'
    OR TRIM(COALESCE(customer_approval, '')) IN ('REJECTED', 'CANCELLED')
  );

UPDATE public.projects
SET sales_command_stage = 'invoiced'
WHERE sales_command_stage IS NULL
  AND COALESCE(invoiced_amount, 0) > 0
  AND (
    project_complete = true
    OR project_status = 'done'
  );

UPDATE public.projects
SET sales_command_stage = 'complete'
WHERE sales_command_stage IS NULL
  AND (
    project_complete = true
    OR project_status = 'done'
  );

UPDATE public.projects
SET sales_command_stage = 'in_process'
WHERE sales_command_stage IS NULL
  AND TRIM(COALESCE(customer_approval, '')) = 'ACCEPTED';

UPDATE public.projects
SET sales_command_stage = 'quote_sent'
WHERE sales_command_stage IS NULL
  AND COALESCE(total_quoted, 0) > 0
  AND (
    TRIM(COALESCE(customer_approval, '')) = 'PENDING'
    OR customer_approval IS NULL
    OR TRIM(COALESCE(customer_approval, '')) = ''
  );

UPDATE public.projects
SET sales_command_stage = 'rfq_customer'
WHERE sales_command_stage IS NULL;
