-- Hybrid auth + role scaffolding for Keystone-PMS.
-- Supports:
-- 1) Azure AD users (synced from NextAuth sign-in),
-- 2) Credentials users (email/password),
-- 3) Role-aware policies for authenticated Supabase JWT flows.
--
-- Transitional compatibility:
-- The app currently uses the anon Supabase key from browser-only clients.
-- To avoid breaking existing usability while role migration is in progress,
-- targeted anon policies are preserved for operational tables.
--
-- Long-term target:
-- Move all browser data access to authenticated Supabase sessions and remove
-- transitional anon policies.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM (
      'admin',
      'manager',
      'sales',
      'engineering',
      'fabrication',
      'viewer'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  display_name text,
  role public.app_role NOT NULL DEFAULT 'viewer',
  auth_provider text NOT NULL DEFAULT 'azure_ad' CHECK (auth_provider IN ('azure_ad', 'credentials')),
  azure_oid text UNIQUE,
  password_hash text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_users_role ON public.app_users (role);
CREATE INDEX IF NOT EXISTS idx_app_users_active ON public.app_users (is_active);

CREATE TABLE IF NOT EXISTS public.app_user_project_access (
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  can_read boolean NOT NULL DEFAULT true,
  can_write boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_app_user_project_access_project
ON public.app_user_project_access (project_id);

CREATE OR REPLACE FUNCTION public.set_app_users_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_users_updated_at ON public.app_users;
CREATE TRIGGER trg_app_users_updated_at
BEFORE UPDATE ON public.app_users
FOR EACH ROW
EXECUTE PROCEDURE public.set_app_users_updated_at();

-- Credentials login verifier for NextAuth CredentialsProvider.
CREATE OR REPLACE FUNCTION public.authenticate_app_user(
  p_email text,
  p_password text
)
RETURNS TABLE (
  id uuid,
  email text,
  display_name text,
  role public.app_role
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    u.display_name,
    u.role
  FROM public.app_users u
  WHERE lower(u.email::text) = lower(p_email)
    AND u.auth_provider = 'credentials'
    AND u.is_active = true
    AND u.password_hash IS NOT NULL
    AND u.password_hash = crypt(p_password, u.password_hash)
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.authenticate_app_user(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authenticate_app_user(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.authenticate_app_user(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.authenticate_app_user(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_credentials_app_user(
  p_email text,
  p_password text,
  p_display_name text DEFAULT NULL,
  p_role public.app_role DEFAULT 'viewer'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.app_users (email, display_name, role, auth_provider, password_hash, is_active)
  VALUES (
    p_email::citext,
    p_display_name,
    p_role,
    'credentials',
    crypt(p_password, gen_salt('bf')),
    true
  )
  ON CONFLICT (email)
  DO UPDATE SET
    display_name = excluded.display_name,
    role = excluded.role,
    auth_provider = 'credentials',
    password_hash = crypt(p_password, gen_salt('bf')),
    is_active = true
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_credentials_app_user(text, text, text, public.app_role) TO service_role;

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT u.id
  FROM public.app_users u
  WHERE lower(u.email::text) = lower(coalesce(auth.jwt()->>'email', ''))
    AND u.is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT coalesce((
    SELECT u.role
    FROM public.app_users u
    WHERE lower(u.email::text) = lower(coalesce(auth.jwt()->>'email', ''))
      AND u.is_active = true
    LIMIT 1
  ), 'viewer'::public.app_role);
$$;

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_user_project_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_users_service_role_all" ON public.app_users;
DROP POLICY IF EXISTS "app_users_self_select" ON public.app_users;
DROP POLICY IF EXISTS "app_users_admin_manage" ON public.app_users;

CREATE POLICY "app_users_service_role_all"
ON public.app_users
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "app_users_self_select"
ON public.app_users
FOR SELECT
TO authenticated
USING (lower(email::text) = lower(coalesce(auth.jwt()->>'email', '')));

CREATE POLICY "app_users_admin_manage"
ON public.app_users
FOR ALL
TO authenticated
USING (public.current_app_role() = 'admin')
WITH CHECK (public.current_app_role() = 'admin');

DROP POLICY IF EXISTS "app_user_project_access_service_role_all" ON public.app_user_project_access;
DROP POLICY IF EXISTS "app_user_project_access_self_select" ON public.app_user_project_access;
DROP POLICY IF EXISTS "app_user_project_access_admin_manage" ON public.app_user_project_access;

CREATE POLICY "app_user_project_access_service_role_all"
ON public.app_user_project_access
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "app_user_project_access_self_select"
ON public.app_user_project_access
FOR SELECT
TO authenticated
USING (user_id = public.current_app_user_id());

CREATE POLICY "app_user_project_access_admin_manage"
ON public.app_user_project_access
FOR ALL
TO authenticated
USING (public.current_app_role() IN ('admin', 'manager'))
WITH CHECK (public.current_app_role() IN ('admin', 'manager'));

-- Role-aware projects policies (authenticated path).
DROP POLICY IF EXISTS "projects_authenticated_select" ON public.projects;
DROP POLICY IF EXISTS "projects_authenticated_insert" ON public.projects;
DROP POLICY IF EXISTS "projects_authenticated_update" ON public.projects;
DROP POLICY IF EXISTS "projects_authenticated_delete" ON public.projects;
DROP POLICY IF EXISTS "projects_role_select_authenticated" ON public.projects;
DROP POLICY IF EXISTS "projects_role_insert_authenticated" ON public.projects;
DROP POLICY IF EXISTS "projects_role_update_authenticated" ON public.projects;
DROP POLICY IF EXISTS "projects_role_delete_authenticated" ON public.projects;

CREATE POLICY "projects_role_select_authenticated"
ON public.projects
FOR SELECT
TO authenticated
USING (
  public.current_app_role() IN ('admin', 'manager', 'sales')
  OR EXISTS (
    SELECT 1
    FROM public.app_user_project_access a
    WHERE a.project_id = projects.id
      AND a.user_id = public.current_app_user_id()
      AND a.can_read = true
  )
);

CREATE POLICY "projects_role_insert_authenticated"
ON public.projects
FOR INSERT
TO authenticated
WITH CHECK (public.current_app_role() IN ('admin', 'manager', 'sales'));

CREATE POLICY "projects_role_update_authenticated"
ON public.projects
FOR UPDATE
TO authenticated
USING (
  public.current_app_role() IN ('admin', 'manager', 'sales')
  OR EXISTS (
    SELECT 1
    FROM public.app_user_project_access a
    WHERE a.project_id = projects.id
      AND a.user_id = public.current_app_user_id()
      AND a.can_write = true
  )
)
WITH CHECK (
  public.current_app_role() IN ('admin', 'manager', 'sales')
  OR EXISTS (
    SELECT 1
    FROM public.app_user_project_access a
    WHERE a.project_id = projects.id
      AND a.user_id = public.current_app_user_id()
      AND a.can_write = true
  )
);

CREATE POLICY "projects_role_delete_authenticated"
ON public.projects
FOR DELETE
TO authenticated
USING (public.current_app_role() IN ('admin', 'manager'));

-- Transitional anon compatibility for browser anon-key clients.
DROP POLICY IF EXISTS "projects_anon_transition_all" ON public.projects;
CREATE POLICY "projects_anon_transition_all"
ON public.projects
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- Role-aware project_documents policies (authenticated path).
DROP POLICY IF EXISTS "project_documents_select_for_project_members" ON public.project_documents;
DROP POLICY IF EXISTS "project_documents_insert_for_project_members" ON public.project_documents;
DROP POLICY IF EXISTS "project_documents_update_for_project_members" ON public.project_documents;
DROP POLICY IF EXISTS "project_documents_delete_for_project_members" ON public.project_documents;
DROP POLICY IF EXISTS "project_documents_role_select_authenticated" ON public.project_documents;
DROP POLICY IF EXISTS "project_documents_role_insert_authenticated" ON public.project_documents;
DROP POLICY IF EXISTS "project_documents_role_update_authenticated" ON public.project_documents;
DROP POLICY IF EXISTS "project_documents_role_delete_authenticated" ON public.project_documents;

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
        public.current_app_role() IN ('admin', 'manager', 'sales')
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

CREATE POLICY "project_documents_role_insert_authenticated"
ON public.project_documents
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_id
      AND (
        public.current_app_role() IN ('admin', 'manager', 'sales')
        OR EXISTS (
          SELECT 1
          FROM public.app_user_project_access a
          WHERE a.project_id = p.id
            AND a.user_id = public.current_app_user_id()
            AND a.can_write = true
        )
      )
  )
);

CREATE POLICY "project_documents_role_update_authenticated"
ON public.project_documents
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_documents.project_id
      AND (
        public.current_app_role() IN ('admin', 'manager', 'sales')
        OR EXISTS (
          SELECT 1
          FROM public.app_user_project_access a
          WHERE a.project_id = p.id
            AND a.user_id = public.current_app_user_id()
            AND a.can_write = true
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_id
      AND (
        public.current_app_role() IN ('admin', 'manager', 'sales')
        OR EXISTS (
          SELECT 1
          FROM public.app_user_project_access a
          WHERE a.project_id = p.id
            AND a.user_id = public.current_app_user_id()
            AND a.can_write = true
        )
      )
  )
);

CREATE POLICY "project_documents_role_delete_authenticated"
ON public.project_documents
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_documents.project_id
      AND public.current_app_role() IN ('admin', 'manager', 'sales')
  )
);

-- Transitional anon compatibility for project_documents to restore current app behavior.
DROP POLICY IF EXISTS "project_documents_all_anon" ON public.project_documents;
DROP POLICY IF EXISTS "project_documents_anon_transition_all" ON public.project_documents;
CREATE POLICY "project_documents_anon_transition_all"
ON public.project_documents
FOR ALL
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_documents.project_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_id
  )
);

-- Transitional anon compatibility for customer/vendor masters used in current client flows.
DROP POLICY IF EXISTS "customers_all_anon" ON public.customers;
DROP POLICY IF EXISTS "customer_shipping_all_anon" ON public.customer_shipping_addresses;
DROP POLICY IF EXISTS "vendors_all_anon" ON public.vendors;
DROP POLICY IF EXISTS "customers_anon_transition_all" ON public.customers;
DROP POLICY IF EXISTS "customer_shipping_anon_transition_all" ON public.customer_shipping_addresses;
DROP POLICY IF EXISTS "vendors_anon_transition_all" ON public.vendors;

CREATE POLICY "customers_anon_transition_all"
ON public.customers
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

CREATE POLICY "customer_shipping_anon_transition_all"
ON public.customer_shipping_addresses
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

CREATE POLICY "vendors_anon_transition_all"
ON public.vendors
FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- Authenticated role-based policies for customers/vendors.
DROP POLICY IF EXISTS "customers_authenticated_all" ON public.customers;
DROP POLICY IF EXISTS "customer_shipping_authenticated_all" ON public.customer_shipping_addresses;
DROP POLICY IF EXISTS "vendors_authenticated_all" ON public.vendors;
DROP POLICY IF EXISTS "customers_role_authenticated" ON public.customers;
DROP POLICY IF EXISTS "customer_shipping_role_authenticated" ON public.customer_shipping_addresses;
DROP POLICY IF EXISTS "vendors_role_authenticated" ON public.vendors;

CREATE POLICY "customers_role_authenticated"
ON public.customers
FOR ALL
TO authenticated
USING (public.current_app_role() IN ('admin', 'manager', 'sales'))
WITH CHECK (public.current_app_role() IN ('admin', 'manager', 'sales'));

CREATE POLICY "customer_shipping_role_authenticated"
ON public.customer_shipping_addresses
FOR ALL
TO authenticated
USING (public.current_app_role() IN ('admin', 'manager', 'sales'))
WITH CHECK (public.current_app_role() IN ('admin', 'manager', 'sales'));

CREATE POLICY "vendors_role_authenticated"
ON public.vendors
FOR ALL
TO authenticated
USING (public.current_app_role() IN ('admin', 'manager', 'sales'))
WITH CHECK (public.current_app_role() IN ('admin', 'manager', 'sales'));

-- Role-filtered financial projection view (column-level masking for authenticated role path).
CREATE OR REPLACE VIEW public.projects_role_filtered AS
SELECT
  p.id,
  p.project_number,
  p.project_name,
  p.customer,
  p.customer_id,
  p.customer_approval,
  p.project_complete,
  p.project_status,
  p.sales_command_stage,
  p.created_at,
  p.updated_at,
  CASE
    WHEN public.current_app_role() IN ('admin', 'manager', 'sales')
      THEN p.total_quoted
    ELSE NULL
  END AS total_quoted,
  CASE
    WHEN public.current_app_role() IN ('admin', 'manager', 'sales')
      THEN p.invoiced_amount
    ELSE NULL
  END AS invoiced_amount,
  CASE
    WHEN public.current_app_role() IN ('admin', 'manager', 'sales')
      THEN p.material_cost
    ELSE NULL
  END AS material_cost,
  CASE
    WHEN public.current_app_role() IN ('admin', 'manager', 'sales')
      THEN p.labor_cost
    ELSE NULL
  END AS labor_cost
FROM public.projects p;

GRANT SELECT ON public.projects_role_filtered TO anon, authenticated, service_role;

COMMENT ON TABLE public.app_users IS
'Hybrid auth user registry for Azure AD + credentials users. Role drives UI and RLS behavior.';
COMMENT ON TABLE public.app_user_project_access IS
'Per-project access overrides for non-admin roles.';
COMMENT ON FUNCTION public.authenticate_app_user(text, text) IS
'Credentials auth verifier used by NextAuth CredentialsProvider.';
COMMENT ON FUNCTION public.upsert_credentials_app_user(text, text, text, public.app_role) IS
'Admin helper to create/update credentials users with bcrypt-compatible pgcrypto hashes.';
COMMENT ON VIEW public.projects_role_filtered IS
'Role-filtered project projection. Financial columns are masked for non-finance roles.';
