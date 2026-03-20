-- CANCELLED vs REJECTED: allow both on customer_approval; add project_status for lifecycle (sheet "PROJECT COMPLETE").
-- project_number as text so duplicates can become e.g. 101592-2 (unique).

ALTER TABLE public.projects
  ALTER COLUMN project_number TYPE text USING (project_number::text);

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_status text;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_project_status_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_project_status_check CHECK (
    project_status IS NULL
    OR project_status IN ('in_process', 'done', 'cancelled')
  );

-- Allow CANCELLED alongside PENDING / ACCEPTED / REJECTED (drop legacy check if present).
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_customer_approval_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_customer_approval_check CHECK (
    customer_approval IS NULL
    OR TRIM(customer_approval) = ''
    OR customer_approval IN (
      'PENDING',
      'ACCEPTED',
      'REJECTED',
      'CANCELLED'
    )
  );

DROP INDEX IF EXISTS projects_project_number_unique;

CREATE UNIQUE INDEX projects_project_number_unique ON public.projects (project_number);

COMMENT ON COLUMN public.projects.project_status IS 'Lifecycle from ops sheet: in_process, done, cancelled';

COMMENT ON COLUMN public.projects.customer_approval IS 'Quote outcome: PENDING, ACCEPTED, REJECTED, or CANCELLED (job cancelled — distinct from customer reject)';
