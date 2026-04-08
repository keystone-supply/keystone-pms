-- Bridge token fallback: sign Supabase JWTs inside Postgres using project JWT secret.
-- This allows NextAuth -> Supabase bridge operation even when app runtime lacks
-- SUPABASE_JWT_SECRET, as long as server-side service_role is available.

CREATE EXTENSION IF NOT EXISTS pgjwt WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.issue_supabase_bridge_token(
  p_email text,
  p_user_id uuid,
  p_app_role public.app_role,
  p_ttl_seconds integer DEFAULT 600
)
RETURNS TABLE (
  access_token text,
  expires_at bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, extensions
AS $$
DECLARE
  v_now bigint := floor(extract(epoch from now()));
  v_ttl integer := greatest(coalesce(p_ttl_seconds, 600), 60);
  v_claims json;
  v_secret text;
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'email is required for bridge token';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required for bridge token';
  END IF;

  v_secret := current_setting('app.settings.jwt_secret', true);
  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE EXCEPTION 'database jwt secret is not available';
  END IF;

  v_claims := json_build_object(
    'aud', 'authenticated',
    'role', 'authenticated',
    'sub', p_user_id::text,
    'email', lower(p_email),
    'app_role', p_app_role::text,
    'app_user_id', p_user_id::text,
    'iat', v_now,
    'exp', v_now + v_ttl,
    'iss', 'keystone-pms-nextauth-bridge'
  );

  access_token := extensions.sign(v_claims, v_secret);
  expires_at := v_now + v_ttl;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_supabase_bridge_token(text, uuid, public.app_role, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_supabase_bridge_token(text, uuid, public.app_role, integer) FROM anon;
REVOKE ALL ON FUNCTION public.issue_supabase_bridge_token(text, uuid, public.app_role, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.issue_supabase_bridge_token(text, uuid, public.app_role, integer) TO service_role;

COMMENT ON FUNCTION public.issue_supabase_bridge_token(text, uuid, public.app_role, integer) IS
'Issues short-lived Supabase bridge JWTs signed in-database using app.settings.jwt_secret. Server-side service_role only.';
