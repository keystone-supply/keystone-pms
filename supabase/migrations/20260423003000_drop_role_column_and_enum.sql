begin;

drop function if exists public.authenticate_app_user(text, text);

create function public.authenticate_app_user(
  p_email text,
  p_password text
)
returns table (
  id uuid,
  email text,
  display_name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  select
    u.id,
    u.email::text,
    u.display_name
  from public.app_users u
  where lower(u.email::text) = lower(p_email)
    and u.auth_provider = 'credentials'
    and u.is_active = true
    and u.password_hash is not null
    and u.password_hash = crypt(p_password, u.password_hash)
  limit 1;
end;
$$;

revoke all on function public.authenticate_app_user(text, text) from public;
revoke all on function public.authenticate_app_user(text, text) from anon;
revoke all on function public.authenticate_app_user(text, text) from authenticated;
grant execute on function public.authenticate_app_user(text, text) to service_role;

drop function if exists public.upsert_credentials_app_user(text, text, text, public.app_role);

create or replace function public.upsert_credentials_app_user(
  p_email text,
  p_password text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.app_users (email, display_name, auth_provider, password_hash, is_active)
  values (
    p_email::citext,
    p_display_name,
    'credentials',
    crypt(p_password, gen_salt('bf')),
    true
  )
  on conflict (email)
  do update set
    display_name = excluded.display_name,
    auth_provider = 'credentials',
    password_hash = crypt(p_password, gen_salt('bf')),
    is_active = true
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_credentials_app_user(text, text, text) from public;
revoke all on function public.upsert_credentials_app_user(text, text, text) from anon;
revoke all on function public.upsert_credentials_app_user(text, text, text) from authenticated;
grant execute on function public.upsert_credentials_app_user(text, text, text) to service_role;

drop function if exists public.issue_supabase_bridge_token(text, uuid, public.app_role, integer);

create or replace function public.issue_supabase_bridge_token(
  p_email text,
  p_user_id uuid,
  p_app_capabilities jsonb default '[]'::jsonb,
  p_ttl_seconds integer default 600
)
returns table (
  access_token text,
  expires_at bigint
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_now bigint := floor(extract(epoch from now()));
  v_ttl integer := greatest(coalesce(p_ttl_seconds, 600), 60);
  v_claims json;
  v_secret text;
begin
  if p_email is null or btrim(p_email) = '' then
    raise exception 'email is required for bridge token';
  end if;
  if p_user_id is null then
    raise exception 'user_id is required for bridge token';
  end if;

  v_secret := current_setting('app.settings.jwt_secret', true);
  if v_secret is null or v_secret = '' then
    raise exception 'database jwt secret is not available';
  end if;

  v_claims := json_build_object(
    'aud', 'authenticated',
    'role', 'authenticated',
    'sub', p_user_id::text,
    'email', lower(p_email),
    'app_capabilities', coalesce(p_app_capabilities, '[]'::jsonb),
    'app_user_id', p_user_id::text,
    'iat', v_now,
    'exp', v_now + v_ttl,
    'iss', 'keystone-pms-nextauth-bridge'
  );

  access_token := extensions.sign(v_claims, v_secret);
  expires_at := v_now + v_ttl;
  return next;
end;
$$;

revoke all on function public.issue_supabase_bridge_token(text, uuid, jsonb, integer) from public;
revoke all on function public.issue_supabase_bridge_token(text, uuid, jsonb, integer) from anon;
revoke all on function public.issue_supabase_bridge_token(text, uuid, jsonb, integer) from authenticated;
grant execute on function public.issue_supabase_bridge_token(text, uuid, jsonb, integer) to service_role;

drop function if exists public.current_app_role();

alter table public.app_users
  drop column if exists role;

drop index if exists public.idx_app_users_role;

drop type if exists public.app_role;

commit;
