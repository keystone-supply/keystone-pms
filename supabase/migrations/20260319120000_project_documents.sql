-- project_documents: quotes, invoices, bills of lading, packing lists
--
-- RLS: all access goes through public.projects. The EXISTS subquery runs with the
-- current role, so if `projects` has row policies, document visibility matches
-- project visibility. No policies for `anon` — only JWT-authenticated users (role
-- `authenticated`) may access; `service_role` bypasses RLS for backend jobs.
--
-- Apply: `npx supabase db push` (linked project) or paste into the SQL editor.

CREATE TABLE IF NOT EXISTS public.project_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (
    kind IN (
      'quote',
      'invoice',
      'bol',
      'packing_list'
    )
  ),
  status text NOT NULL DEFAULT 'draft',
  number text,
  version integer NOT NULL DEFAULT 1,
  pdf_path text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_documents_project_id ON public.project_documents (project_id);

CREATE INDEX IF NOT EXISTS idx_project_documents_kind ON public.project_documents (kind);

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_documents TO authenticated;

GRANT ALL ON public.project_documents TO service_role;

DROP POLICY IF EXISTS "project_documents_select_authenticated" ON public.project_documents;

DROP POLICY IF EXISTS "project_documents_insert_authenticated" ON public.project_documents;

DROP POLICY IF EXISTS "project_documents_update_authenticated" ON public.project_documents;

DROP POLICY IF EXISTS "project_documents_delete_authenticated" ON public.project_documents;

DROP POLICY IF EXISTS "project_documents_select_for_project_members" ON public.project_documents;

DROP POLICY IF EXISTS "project_documents_insert_for_project_members" ON public.project_documents;

DROP POLICY IF EXISTS "project_documents_update_for_project_members" ON public.project_documents;

DROP POLICY IF EXISTS "project_documents_delete_for_project_members" ON public.project_documents;

CREATE POLICY "project_documents_select_for_project_members" ON public.project_documents FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_documents.project_id
  )
);

CREATE POLICY "project_documents_insert_for_project_members" ON public.project_documents FOR INSERT TO authenticated
WITH
  CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_id
    )
  );

CREATE POLICY "project_documents_update_for_project_members" ON public.project_documents FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_documents.project_id
  )
)
WITH
  CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_id
    )
  );

CREATE POLICY "project_documents_delete_for_project_members" ON public.project_documents FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_documents.project_id
  )
);

COMMENT ON TABLE public.project_documents IS 'Generated artifacts per project: quotes, invoices, BOL, packing lists';
