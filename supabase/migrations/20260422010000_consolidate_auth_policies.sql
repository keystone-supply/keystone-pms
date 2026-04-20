-- Consolidate overlapping authenticated policies and avoid per-row JWT evaluation.

begin;

drop policy if exists "app_users_self_select" on public.app_users;
drop policy if exists "app_users_admin_manage" on public.app_users;

create policy "app_users_admin_all"
on public.app_users
for all
to authenticated
using ((select public.current_app_role()) = 'admin')
with check ((select public.current_app_role()) = 'admin');

create policy "app_users_self_or_admin_select"
on public.app_users
for select
to authenticated
using (
  (select public.current_app_role()) = 'admin'
  or lower(email::text) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
);

drop policy if exists "app_user_project_access_self_select" on public.app_user_project_access;
drop policy if exists "app_user_project_access_admin_manage" on public.app_user_project_access;

create policy "app_user_project_access_admin_all"
on public.app_user_project_access
for all
to authenticated
using ((select public.current_app_role()) in ('admin', 'manager'))
with check ((select public.current_app_role()) in ('admin', 'manager'));

create policy "app_user_project_access_self_or_admin_select"
on public.app_user_project_access
for select
to authenticated
using (
  (select public.current_app_role()) in ('admin', 'manager')
  or user_id = (select public.current_app_user_id())
);

commit;
