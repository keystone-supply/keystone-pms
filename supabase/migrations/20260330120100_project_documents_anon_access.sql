-- Match internal app pattern: browser uses anon key (see lib/supabaseClient.ts).

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_documents TO anon;

DROP POLICY IF EXISTS "project_documents_all_anon" ON public.project_documents;

CREATE POLICY "project_documents_all_anon" ON public.project_documents FOR ALL TO anon USING (true)
WITH
  CHECK (true);
