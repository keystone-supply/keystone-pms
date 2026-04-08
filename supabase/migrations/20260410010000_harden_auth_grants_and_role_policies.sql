-- Harden auth grants and role-aware authenticated policies.

-- Credentials verifier must only be callable by server-side service role.
REVOKE ALL ON FUNCTION public.authenticate_app_user(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authenticate_app_user(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.authenticate_app_user(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.authenticate_app_user(text, text) TO service_role;

-- Keep authenticated reads available to engineering/fabrication users.
DROP POLICY IF EXISTS "projects_role_select_authenticated" ON public.projects;
CREATE POLICY "projects_role_select_authenticated"
ON public.projects
FOR SELECT
TO authenticated
USING (
  public.current_app_role() IN ('admin', 'manager', 'sales', 'engineering', 'fabrication')
  OR EXISTS (
    SELECT 1
    FROM public.app_user_project_access a
    WHERE a.project_id = projects.id
      AND a.user_id = public.current_app_user_id()
      AND a.can_read = true
  )
);

DROP POLICY IF EXISTS "project_documents_role_select_authenticated" ON public.project_documents;
CREATE POLICY "project_documents_role_select_authenticated"
ON public.project_documents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_documents.project_id
      AND (
        public.current_app_role() IN ('admin', 'manager', 'sales', 'engineering', 'fabrication')
        OR EXISTS (
          SELECT 1
          FROM public.app_user_project_access a
          WHERE a.project_id = p.id
            AND a.user_id = public.current_app_user_id()
            AND a.can_read = true
        )
      )
  )
);
