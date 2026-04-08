-- Align RBAC policy/grant posture with docs/rbac-role-matrix.md (v1).
-- Focus:
-- 1) Ensure RLS is enabled on high-risk operational tables.
-- 2) Keep anon/public out of operational data.
-- 3) Tighten finance policies from broad authenticated-all to role-based CRUD.
-- 4) Add role policies for sheet_stock when that table exists.

-- Ensure core projects table has RLS enforced.
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Keep operational tables inaccessible to anon/public.
REVOKE ALL ON public.projects FROM PUBLIC;
REVOKE ALL ON public.projects FROM anon;
REVOKE ALL ON public.project_documents FROM PUBLIC;
REVOKE ALL ON public.project_documents FROM anon;
REVOKE ALL ON public.customers FROM PUBLIC;
REVOKE ALL ON public.customers FROM anon;
REVOKE ALL ON public.customer_shipping_addresses FROM PUBLIC;
REVOKE ALL ON public.customer_shipping_addresses FROM anon;
REVOKE ALL ON public.vendors FROM PUBLIC;
REVOKE ALL ON public.vendors FROM anon;

-- Authenticated app role remains the app-facing DB role.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_shipping_addresses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.projects TO service_role;
GRANT ALL ON public.project_documents TO service_role;
GRANT ALL ON public.customers TO service_role;
GRANT ALL ON public.customer_shipping_addresses TO service_role;
GRANT ALL ON public.vendors TO service_role;

-- Harden finance ledger tables from authenticated-all to role-scoped policies.
REVOKE ALL ON public.finance_journal_entries FROM PUBLIC;
REVOKE ALL ON public.finance_journal_lines FROM PUBLIC;
REVOKE ALL ON public.finance_journal_entries FROM anon;
REVOKE ALL ON public.finance_journal_lines FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_journal_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_journal_lines TO authenticated;
GRANT ALL ON public.finance_journal_entries TO service_role;
GRANT ALL ON public.finance_journal_lines TO service_role;

DROP POLICY IF EXISTS "finance_journal_entries_authenticated_all"
ON public.finance_journal_entries;
DROP POLICY IF EXISTS "finance_journal_lines_authenticated_all"
ON public.finance_journal_lines;
DROP POLICY IF EXISTS "finance_journal_entries_role_select_authenticated"
ON public.finance_journal_entries;
DROP POLICY IF EXISTS "finance_journal_entries_role_insert_authenticated"
ON public.finance_journal_entries;
DROP POLICY IF EXISTS "finance_journal_entries_role_update_authenticated"
ON public.finance_journal_entries;
DROP POLICY IF EXISTS "finance_journal_entries_role_delete_authenticated"
ON public.finance_journal_entries;
DROP POLICY IF EXISTS "finance_journal_lines_role_select_authenticated"
ON public.finance_journal_lines;
DROP POLICY IF EXISTS "finance_journal_lines_role_insert_authenticated"
ON public.finance_journal_lines;
DROP POLICY IF EXISTS "finance_journal_lines_role_update_authenticated"
ON public.finance_journal_lines;
DROP POLICY IF EXISTS "finance_journal_lines_role_delete_authenticated"
ON public.finance_journal_lines;

CREATE POLICY "finance_journal_entries_role_select_authenticated"
ON public.finance_journal_entries
FOR SELECT
TO authenticated
USING (public.current_app_role() IN ('admin', 'manager', 'sales'));

CREATE POLICY "finance_journal_entries_role_insert_authenticated"
ON public.finance_journal_entries
FOR INSERT
TO authenticated
WITH CHECK (public.current_app_role() IN ('admin', 'manager'));

CREATE POLICY "finance_journal_entries_role_update_authenticated"
ON public.finance_journal_entries
FOR UPDATE
TO authenticated
USING (public.current_app_role() IN ('admin', 'manager'))
WITH CHECK (public.current_app_role() IN ('admin', 'manager'));

CREATE POLICY "finance_journal_entries_role_delete_authenticated"
ON public.finance_journal_entries
FOR DELETE
TO authenticated
USING (public.current_app_role() IN ('admin', 'manager'));

CREATE POLICY "finance_journal_lines_role_select_authenticated"
ON public.finance_journal_lines
FOR SELECT
TO authenticated
USING (public.current_app_role() IN ('admin', 'manager', 'sales'));

CREATE POLICY "finance_journal_lines_role_insert_authenticated"
ON public.finance_journal_lines
FOR INSERT
TO authenticated
WITH CHECK (public.current_app_role() IN ('admin', 'manager'));

CREATE POLICY "finance_journal_lines_role_update_authenticated"
ON public.finance_journal_lines
FOR UPDATE
TO authenticated
USING (public.current_app_role() IN ('admin', 'manager'))
WITH CHECK (public.current_app_role() IN ('admin', 'manager'));

CREATE POLICY "finance_journal_lines_role_delete_authenticated"
ON public.finance_journal_lines
FOR DELETE
TO authenticated
USING (public.current_app_role() IN ('admin', 'manager'));

-- Apply sheet stock policies only if the table exists in this environment.
DO $$
BEGIN
  IF to_regclass('public.sheet_stock') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.sheet_stock ENABLE ROW LEVEL SECURITY';
  EXECUTE 'REVOKE ALL ON public.sheet_stock FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON public.sheet_stock FROM anon';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.sheet_stock TO authenticated';
  EXECUTE 'GRANT ALL ON public.sheet_stock TO service_role';

  EXECUTE 'DROP POLICY IF EXISTS "sheet_stock_role_select_authenticated" ON public.sheet_stock';
  EXECUTE 'DROP POLICY IF EXISTS "sheet_stock_role_insert_authenticated" ON public.sheet_stock';
  EXECUTE 'DROP POLICY IF EXISTS "sheet_stock_role_update_authenticated" ON public.sheet_stock';
  EXECUTE 'DROP POLICY IF EXISTS "sheet_stock_role_delete_authenticated" ON public.sheet_stock';
  EXECUTE 'DROP POLICY IF EXISTS "sheet_stock_authenticated_all" ON public.sheet_stock';
  EXECUTE 'DROP POLICY IF EXISTS "sheet_stock_anon_transition_all" ON public.sheet_stock';
  EXECUTE 'DROP POLICY IF EXISTS "sheet_stock_all_anon" ON public.sheet_stock';

  EXECUTE '
    CREATE POLICY "sheet_stock_role_select_authenticated"
    ON public.sheet_stock
    FOR SELECT
    TO authenticated
    USING (public.current_app_role() IN (''admin'', ''manager'', ''engineering'', ''fabrication''))
  ';

  EXECUTE '
    CREATE POLICY "sheet_stock_role_insert_authenticated"
    ON public.sheet_stock
    FOR INSERT
    TO authenticated
    WITH CHECK (public.current_app_role() IN (''admin'', ''manager'', ''engineering'', ''fabrication''))
  ';

  EXECUTE '
    CREATE POLICY "sheet_stock_role_update_authenticated"
    ON public.sheet_stock
    FOR UPDATE
    TO authenticated
    USING (public.current_app_role() IN (''admin'', ''manager'', ''engineering'', ''fabrication''))
    WITH CHECK (public.current_app_role() IN (''admin'', ''manager'', ''engineering'', ''fabrication''))
  ';

  EXECUTE '
    CREATE POLICY "sheet_stock_role_delete_authenticated"
    ON public.sheet_stock
    FOR DELETE
    TO authenticated
    USING (public.current_app_role() IN (''admin'', ''manager'', ''engineering'', ''fabrication''))
  ';
END
$$;

-- Keep role-filtered view private to authenticated/service role.
REVOKE ALL ON public.projects_role_filtered FROM PUBLIC;
REVOKE ALL ON public.projects_role_filtered FROM anon;
GRANT SELECT ON public.projects_role_filtered TO authenticated, service_role;

-- Helper verification function for CI/manual checks.
CREATE OR REPLACE FUNCTION public.rbac_policy_audit()
RETURNS TABLE (
  check_name text,
  ok boolean,
  detail text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, information_schema
AS $$
DECLARE
  v_sheet_stock_exists boolean;
BEGIN
  RETURN QUERY
  SELECT
    'projects_rls_enabled'::text,
    c.relrowsecurity,
    format('projects.relrowsecurity=%s', c.relrowsecurity)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'projects';

  RETURN QUERY
  SELECT
    'core_tables_no_anon_grants'::text,
    count(*) = 0,
    format('anon grant count=%s', count(*))
  FROM information_schema.role_table_grants g
  WHERE g.grantee = 'anon'
    AND g.table_schema = 'public'
    AND g.table_name IN (
      'projects',
      'project_documents',
      'customers',
      'customer_shipping_addresses',
      'vendors',
      'projects_role_filtered'
    );

  RETURN QUERY
  SELECT
    'finance_role_policies_present'::text,
    count(*) = 8,
    format('finance role policy count=%s', count(*))
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename IN ('finance_journal_entries', 'finance_journal_lines')
    AND p.policyname IN (
      'finance_journal_entries_role_select_authenticated',
      'finance_journal_entries_role_insert_authenticated',
      'finance_journal_entries_role_update_authenticated',
      'finance_journal_entries_role_delete_authenticated',
      'finance_journal_lines_role_select_authenticated',
      'finance_journal_lines_role_insert_authenticated',
      'finance_journal_lines_role_update_authenticated',
      'finance_journal_lines_role_delete_authenticated'
    );

  SELECT to_regclass('public.sheet_stock') IS NOT NULL INTO v_sheet_stock_exists;
  IF v_sheet_stock_exists THEN
    RETURN QUERY
    SELECT
      'sheet_stock_role_policies_present'::text,
      count(*) = 4,
      format('sheet_stock role policy count=%s', count(*))
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'sheet_stock'
      AND p.policyname IN (
        'sheet_stock_role_select_authenticated',
        'sheet_stock_role_insert_authenticated',
        'sheet_stock_role_update_authenticated',
        'sheet_stock_role_delete_authenticated'
      );
  ELSE
    RETURN QUERY
    SELECT
      'sheet_stock_role_policies_present'::text,
      true,
      'sheet_stock table not present in this environment';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rbac_policy_audit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rbac_policy_audit() FROM anon;
REVOKE ALL ON FUNCTION public.rbac_policy_audit() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rbac_policy_audit() TO service_role;
