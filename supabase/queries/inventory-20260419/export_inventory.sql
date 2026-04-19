-- Supabase inventory export queries (captured 2026-04-19).
-- Run these against the target project before and after remediation migrations.

-- 1) Core policy inventory (projects, sheet_stock, finance)
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('projects', 'sheet_stock', 'finance_journal_entries', 'finance_journal_lines')
order by tablename, policyname;

-- 2) View definition + reloptions for projects_role_filtered
select
  c.relname as view_name,
  c.reloptions,
  pg_get_viewdef(c.oid, true) as view_sql
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v'
  and c.relname = 'projects_role_filtered';

-- 3) Relevant public functions for drift checks
select
  p.proname,
  pg_get_functiondef(p.oid) as function_sql
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('rls_auto_enable', 'rbac_policy_audit', 'sheet_stock_set_updated_at')
order by p.proname;

-- 4) Storage bucket definitions
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  created_at,
  updated_at
from storage.buckets
where id in ('sheet-previews', 'project-files')
order by id;

-- 5) Storage object policies tied to these buckets
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (
    coalesce(qual, '') like '%sheet-previews%'
    or coalesce(with_check, '') like '%sheet-previews%'
    or coalesce(qual, '') like '%project-files%'
    or coalesce(with_check, '') like '%project-files%'
  )
order by policyname;

-- 6) Schema baseline metadata for projects + sheet_stock
select
  table_schema,
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('projects', 'sheet_stock')
order by table_name, ordinal_position;

select
  t.table_name,
  i.indexname,
  i.indexdef
from pg_indexes i
join information_schema.tables t
  on t.table_schema = i.schemaname
 and t.table_name = i.tablename
where i.schemaname = 'public'
  and i.tablename in ('projects', 'sheet_stock')
order by i.tablename, i.indexname;
