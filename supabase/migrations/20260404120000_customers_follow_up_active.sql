-- Sales hygiene: allow pausing follow-up reminders without clearing follow_up_at.
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS follow_up_active boolean NOT NULL DEFAULT false;

UPDATE public.customers
SET
  follow_up_active = true
WHERE
  follow_up_at IS NOT NULL;
