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
set search_path = public, extensions, pg_temp
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

drop function if exists public.upsert_credentials_app_user(text, text, text);

create or replace function public.upsert_credentials_app_user(
  p_email text,
  p_password text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.app_users (email, display_name, auth_provider, password_hash, is_active)
  values (
    p_email,
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

commit;
