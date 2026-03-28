-- Customer RFQ receipt date is tracked by created_at on projects.
-- Drop legacy duplicate columns if present (historic typo and/or canonical name).

ALTER TABLE public.projects DROP COLUMN IF EXISTS cusotmer_rfq;
ALTER TABLE public.projects DROP COLUMN IF EXISTS customer_rfq;
