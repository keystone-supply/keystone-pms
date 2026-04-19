-- Ensure CI RBAC audit RPC exists and reflects current policy posture.

create or replace function public.rbac_policy_audit()
returns table (
  check_name text,
  ok boolean,
  detail text
)
language plpgsql
security definer
set search_path = public, pg_catalog, information_schema
as $$
declare
  v_sheet_stock_exists boolean;
begin
  return query
  select
    'projects_rls_enabled'::text,
    c.relrowsecurity,
    format('projects.relrowsecurity=%s', c.relrowsecurity)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'projects';

  return query
  select
    'projects_no_public_true_policy'::text,
    count(*) = 0,
    format('public-true projects policy count=%s', count(*))
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'projects'
    and p.cmd = 'SELECT'
    and p.qual = 'true'
    and 'public' = any (p.roles);

  return query
  select
    'projects_role_filtered_not_security_definer'::text,
    coalesce(not c.reloptions::text[] @> array['security_invoker=false'], true),
    coalesce(format('reloptions=%s', array_to_string(c.reloptions, ',')), 'reloptions=<null>')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'projects_role_filtered'
    and c.relkind = 'v';

  return query
  select
    'finance_no_permissive_authenticated_all'::text,
    count(*) = 0,
    format('finance permissive policy count=%s', count(*))
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('finance_journal_entries', 'finance_journal_lines')
    and p.policyname in (
      'finance_journal_entries_authenticated',
      'finance_journal_lines_authenticated',
      'finance_journal_entries_authenticated_all',
      'finance_journal_lines_authenticated_all'
    );

  return query
  select
    'finance_role_policies_present'::text,
    count(*) = 8,
    format('finance role policy count=%s', count(*))
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('finance_journal_entries', 'finance_journal_lines')
    and p.policyname in (
      'finance_journal_entries_role_select_authenticated',
      'finance_journal_entries_role_insert_authenticated',
      'finance_journal_entries_role_update_authenticated',
      'finance_journal_entries_role_delete_authenticated',
      'finance_journal_lines_role_select_authenticated',
      'finance_journal_lines_role_insert_authenticated',
      'finance_journal_lines_role_update_authenticated',
      'finance_journal_lines_role_delete_authenticated'
    );

  select to_regclass('public.sheet_stock') is not null into v_sheet_stock_exists;
  if v_sheet_stock_exists then
    return query
    select
      'sheet_stock_role_policies_present'::text,
      count(*) = 4,
      format('sheet_stock role policy count=%s', count(*))
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'sheet_stock'
      and p.policyname in (
        'sheet_stock_role_select_authenticated',
        'sheet_stock_role_insert_authenticated',
        'sheet_stock_role_update_authenticated',
        'sheet_stock_role_delete_authenticated'
      );

    return query
    select
      'sheet_stock_no_public_read_policy'::text,
      count(*) = 0,
      format('sheet_stock public-read policy count=%s', count(*))
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'sheet_stock'
      and p.cmd = 'SELECT'
      and p.qual = 'true'
      and 'public' = any (p.roles);
  else
    return query
    select
      'sheet_stock_role_policies_present'::text,
      true,
      'sheet_stock table not present in this environment';
  end if;
end;
$$;

revoke all on function public.rbac_policy_audit() from public;
revoke all on function public.rbac_policy_audit() from anon;
revoke all on function public.rbac_policy_audit() from authenticated;
grant execute on function public.rbac_policy_audit() to service_role;
