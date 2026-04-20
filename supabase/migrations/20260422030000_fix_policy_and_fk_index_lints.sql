-- Eliminate remaining advisor warnings while preserving RBAC behavior.

begin;

drop policy if exists "app_users_admin_all" on public.app_users;
drop policy if exists "app_users_self_or_admin_select" on public.app_users;

create policy "app_users_select_self_or_admin"
on public.app_users
for select
to authenticated
using (
  (select public.current_app_role()) = 'admin'
  or lower(email::text) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
);

create policy "app_users_admin_insert"
on public.app_users
for insert
to authenticated
with check ((select public.current_app_role()) = 'admin');

create policy "app_users_admin_update"
on public.app_users
for update
to authenticated
using ((select public.current_app_role()) = 'admin')
with check ((select public.current_app_role()) = 'admin');

create policy "app_users_admin_delete"
on public.app_users
for delete
to authenticated
using ((select public.current_app_role()) = 'admin');

drop policy if exists "app_user_project_access_admin_all" on public.app_user_project_access;
drop policy if exists "app_user_project_access_self_or_admin_select" on public.app_user_project_access;

create policy "app_user_project_access_select_self_or_admin"
on public.app_user_project_access
for select
to authenticated
using (
  (select public.current_app_role()) in ('admin', 'manager')
  or user_id = (select public.current_app_user_id())
);

create policy "app_user_project_access_admin_insert"
on public.app_user_project_access
for insert
to authenticated
with check ((select public.current_app_role()) in ('admin', 'manager'));

create policy "app_user_project_access_admin_update"
on public.app_user_project_access
for update
to authenticated
using ((select public.current_app_role()) in ('admin', 'manager'))
with check ((select public.current_app_role()) in ('admin', 'manager'));

create policy "app_user_project_access_admin_delete"
on public.app_user_project_access
for delete
to authenticated
using ((select public.current_app_role()) in ('admin', 'manager'));

create index if not exists idx_app_user_project_access_project
  on public.app_user_project_access(project_id);

create index if not exists idx_finance_journal_lines_journal_entry_id
  on public.finance_journal_lines(journal_entry_id);

create index if not exists idx_project_calc_lines_project_id
  on public.project_calc_lines(project_id);

create index if not exists idx_project_documents_vendor_id
  on public.project_documents(vendor_id);

commit;
