-- Reconcile live security drift with RBAC matrix.
-- Forward-only hotfix: remove permissive/manual dashboard policies and
-- restore role-scoped policies for projects, sheet_stock, and finance tables.

begin;

-- projects: remove broad public read policy.
drop policy if exists "Enable public read for Keystone team" on public.projects;

-- sheet_stock: remove dashboard template policies and enforce role-scoped access.
drop policy if exists "Enable read access for all users" on public.sheet_stock;
drop policy if exists "Enable insert for authenticated users only" on public.sheet_stock;
drop policy if exists "sheet_stock_update_authenticated" on public.sheet_stock;
drop policy if exists "sheet_stock_authenticated_all" on public.sheet_stock;
drop policy if exists "sheet_stock_anon_transition_all" on public.sheet_stock;
drop policy if exists "sheet_stock_all_anon" on public.sheet_stock;
drop policy if exists "sheet_stock_role_select_authenticated" on public.sheet_stock;
drop policy if exists "sheet_stock_role_insert_authenticated" on public.sheet_stock;
drop policy if exists "sheet_stock_role_update_authenticated" on public.sheet_stock;
drop policy if exists "sheet_stock_role_delete_authenticated" on public.sheet_stock;

create policy "sheet_stock_role_select_authenticated"
on public.sheet_stock
for select
to authenticated
using ((select public.current_app_role()) in ('admin', 'manager', 'engineering', 'fabrication'));

create policy "sheet_stock_role_insert_authenticated"
on public.sheet_stock
for insert
to authenticated
with check ((select public.current_app_role()) in ('admin', 'manager', 'engineering', 'fabrication'));

create policy "sheet_stock_role_update_authenticated"
on public.sheet_stock
for update
to authenticated
using ((select public.current_app_role()) in ('admin', 'manager', 'engineering', 'fabrication'))
with check ((select public.current_app_role()) in ('admin', 'manager', 'engineering', 'fabrication'));

create policy "sheet_stock_role_delete_authenticated"
on public.sheet_stock
for delete
to authenticated
using ((select public.current_app_role()) in ('admin', 'manager', 'engineering', 'fabrication'));

-- Finance tables: replace permissive authenticated-all policies with role-filtered policies.
drop policy if exists "finance_journal_entries_authenticated" on public.finance_journal_entries;
drop policy if exists "finance_journal_lines_authenticated" on public.finance_journal_lines;
drop policy if exists "finance_journal_entries_authenticated_all" on public.finance_journal_entries;
drop policy if exists "finance_journal_lines_authenticated_all" on public.finance_journal_lines;
drop policy if exists "finance_journal_entries_role_select_authenticated" on public.finance_journal_entries;
drop policy if exists "finance_journal_entries_role_insert_authenticated" on public.finance_journal_entries;
drop policy if exists "finance_journal_entries_role_update_authenticated" on public.finance_journal_entries;
drop policy if exists "finance_journal_entries_role_delete_authenticated" on public.finance_journal_entries;
drop policy if exists "finance_journal_lines_role_select_authenticated" on public.finance_journal_lines;
drop policy if exists "finance_journal_lines_role_insert_authenticated" on public.finance_journal_lines;
drop policy if exists "finance_journal_lines_role_update_authenticated" on public.finance_journal_lines;
drop policy if exists "finance_journal_lines_role_delete_authenticated" on public.finance_journal_lines;

create policy "finance_journal_entries_role_select_authenticated"
on public.finance_journal_entries
for select
to authenticated
using ((select public.current_app_role()) in ('admin', 'manager', 'sales'));

create policy "finance_journal_entries_role_insert_authenticated"
on public.finance_journal_entries
for insert
to authenticated
with check ((select public.current_app_role()) in ('admin', 'manager'));

create policy "finance_journal_entries_role_update_authenticated"
on public.finance_journal_entries
for update
to authenticated
using ((select public.current_app_role()) in ('admin', 'manager'))
with check ((select public.current_app_role()) in ('admin', 'manager'));

create policy "finance_journal_entries_role_delete_authenticated"
on public.finance_journal_entries
for delete
to authenticated
using ((select public.current_app_role()) in ('admin', 'manager'));

create policy "finance_journal_lines_role_select_authenticated"
on public.finance_journal_lines
for select
to authenticated
using ((select public.current_app_role()) in ('admin', 'manager', 'sales'));

create policy "finance_journal_lines_role_insert_authenticated"
on public.finance_journal_lines
for insert
to authenticated
with check ((select public.current_app_role()) in ('admin', 'manager'));

create policy "finance_journal_lines_role_update_authenticated"
on public.finance_journal_lines
for update
to authenticated
using ((select public.current_app_role()) in ('admin', 'manager'))
with check ((select public.current_app_role()) in ('admin', 'manager'));

create policy "finance_journal_lines_role_delete_authenticated"
on public.finance_journal_lines
for delete
to authenticated
using ((select public.current_app_role()) in ('admin', 'manager'));

-- View should not run as security definer in Supabase exposed schema.
create or replace view public.projects_role_filtered
with (security_invoker = true) as
select
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
  case
    when public.current_app_role() in ('admin', 'manager', 'sales')
      then p.total_quoted
    else null
  end as total_quoted,
  case
    when public.current_app_role() in ('admin', 'manager', 'sales')
      then p.invoiced_amount
    else null
  end as invoiced_amount,
  case
    when public.current_app_role() in ('admin', 'manager', 'sales')
      then p.material_cost
    else null
  end as material_cost,
  case
    when public.current_app_role() in ('admin', 'manager', 'sales')
      then p.labor_cost
    else null
  end as labor_cost
from public.projects p;

revoke all on public.projects_role_filtered from public;
revoke all on public.projects_role_filtered from anon;
grant select on public.projects_role_filtered to authenticated, service_role;

-- Public buckets do not require broad SELECT policy on storage.objects for object URL access.
drop policy if exists "sheet_previews_public_read" on storage.objects;

commit;
