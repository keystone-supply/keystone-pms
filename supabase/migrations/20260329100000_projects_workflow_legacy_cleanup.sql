-- Ops milestones (RFQ→delivery workflow), payment flag, and legacy row normalization.
-- Legacy UPDATE scope: rows with known created_at strictly before 2026 (NULL created_at excluded).

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS payment_received boolean NOT NULL DEFAULT false;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS materials_ordered_at timestamptz,
  ADD COLUMN IF NOT EXISTS material_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS labor_completed_at timestamptz;

COMMENT ON COLUMN public.projects.payment_received IS 'Cash/payment received for job (distinct from invoiced_at / invoiced_amount)';
COMMENT ON COLUMN public.projects.materials_ordered_at IS 'Materials ordered milestone (after in production)';
COMMENT ON COLUMN public.projects.material_received_at IS 'Material received milestone';
COMMENT ON COLUMN public.projects.labor_completed_at IS 'Labor complete milestone; completed_at remains sales-board Complete column';

-- Pre-2026 cleanup: align sheet-style fields from customer quote outcome (see plan).
UPDATE public.projects
SET
  project_complete = true,
  payment_received = true,
  project_status = 'done',
  sales_command_stage = 'complete'
WHERE created_at IS NOT NULL
  AND created_at < timestamptz '2026-01-01'
  AND TRIM(UPPER(COALESCE(customer_approval, ''))) = 'ACCEPTED';

UPDATE public.projects
SET
  project_complete = false,
  payment_received = false,
  project_status = 'cancelled',
  sales_command_stage = 'lost'
WHERE created_at IS NOT NULL
  AND created_at < timestamptz '2026-01-01'
  AND TRIM(UPPER(COALESCE(customer_approval, ''))) = 'REJECTED';
