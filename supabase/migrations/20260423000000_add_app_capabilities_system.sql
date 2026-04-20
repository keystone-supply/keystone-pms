begin;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'app_capability'
  ) then
    create type public.app_capability as enum (
      'read_projects',
      'create_projects',
      'edit_projects',
      'delete_projects',
      'manage_documents',
      'view_financials',
      'access_sales',
      'manage_crm',
      'run_nesting',
      'manage_sheet_stock',
      'view_shop_tv',
      'manage_users',
      'manage_user_access'
    );
  end if;
end
$$;

create table if not exists public.app_user_capabilities (
  user_id uuid not null references public.app_users(id) on delete cascade,
  capability public.app_capability not null,
  granted_at timestamptz not null default now(),
  granted_by uuid null references public.app_users(id),
  primary key (user_id, capability)
);

create index if not exists idx_app_user_capabilities_capability
  on public.app_user_capabilities(capability);

alter table public.app_user_capabilities enable row level security;

revoke all on public.app_user_capabilities from public;
revoke all on public.app_user_capabilities from anon;
grant select, insert, update, delete on public.app_user_capabilities to authenticated;
grant all on public.app_user_capabilities to service_role;

create or replace function public.current_app_user_has(cap public.app_capability)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists(
    select 1
    from public.app_user_capabilities c
    join public.app_users u on u.id = c.user_id
    where c.capability = cap
      and u.is_active = true
      and lower(u.email::text) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.current_app_user_has(public.app_capability) from public;
revoke all on function public.current_app_user_has(public.app_capability) from anon;
grant execute on function public.current_app_user_has(public.app_capability) to authenticated, service_role;

drop policy if exists "app_user_capabilities_service_role_all" on public.app_user_capabilities;
drop policy if exists "app_user_capabilities_select_self_or_admin" on public.app_user_capabilities;
drop policy if exists "app_user_capabilities_admin_insert" on public.app_user_capabilities;
drop policy if exists "app_user_capabilities_admin_update" on public.app_user_capabilities;
drop policy if exists "app_user_capabilities_admin_delete" on public.app_user_capabilities;

create policy "app_user_capabilities_service_role_all"
on public.app_user_capabilities
for all
to service_role
using (true)
with check (true);

create policy "app_user_capabilities_select_self_or_admin"
on public.app_user_capabilities
for select
to authenticated
using (
  user_id = (select public.current_app_user_id())
  or (select public.current_app_user_has('manage_users'::public.app_capability))
);

create policy "app_user_capabilities_admin_insert"
on public.app_user_capabilities
for insert
to authenticated
with check ((select public.current_app_user_has('manage_users'::public.app_capability)));

create policy "app_user_capabilities_admin_update"
on public.app_user_capabilities
for update
to authenticated
using ((select public.current_app_user_has('manage_users'::public.app_capability)))
with check ((select public.current_app_user_has('manage_users'::public.app_capability)));

create policy "app_user_capabilities_admin_delete"
on public.app_user_capabilities
for delete
to authenticated
using ((select public.current_app_user_has('manage_users'::public.app_capability)));

do $$
declare
  v_expected_admin_count integer;
begin
  select count(*)
  into v_expected_admin_count
  from public.app_users
  where id in (
    '21566ec2-5cf9-4c8a-b509-075e1bcd520d'::uuid,
    '37dcb978-16f2-4fd6-8684-fe702c0970e9'::uuid
  )
    and is_active = true;

  if v_expected_admin_count <> 2 then
    raise exception 'admin seed: expected 2 active app_users rows for Tyson and Kaleb';
  end if;
end
$$;

-- Role-to-capability backfill preserves current behavior before role column removal.
insert into public.app_user_capabilities (user_id, capability)
select u.id, cap.capability
from public.app_users u
cross join lateral (
  select unnest(
    case u.role
      when 'admin'::public.app_role then array[
        'read_projects',
        'create_projects',
        'edit_projects',
        'delete_projects',
        'manage_documents',
        'view_financials',
        'access_sales',
        'manage_crm',
        'run_nesting',
        'manage_sheet_stock',
        'view_shop_tv',
        'manage_users',
        'manage_user_access'
      ]::public.app_capability[]
      when 'manager'::public.app_role then array[
        'read_projects',
        'create_projects',
        'edit_projects',
        'delete_projects',
        'manage_documents',
        'view_financials',
        'access_sales',
        'manage_crm',
        'run_nesting',
        'manage_sheet_stock',
        'view_shop_tv',
        'manage_user_access'
      ]::public.app_capability[]
      when 'sales'::public.app_role then array[
        'read_projects',
        'create_projects',
        'edit_projects',
        'manage_documents',
        'view_financials',
        'access_sales',
        'manage_crm',
        'view_shop_tv'
      ]::public.app_capability[]
      when 'engineering'::public.app_role then array[
        'read_projects',
        'run_nesting',
        'manage_sheet_stock',
        'view_shop_tv'
      ]::public.app_capability[]
      when 'fabrication'::public.app_role then array[
        'read_projects',
        'run_nesting',
        'manage_sheet_stock',
        'view_shop_tv'
      ]::public.app_capability[]
      else array[
        'read_projects'
      ]::public.app_capability[]
    end
  ) as capability
) cap
where u.is_active = true
on conflict do nothing;

-- Enforce top-level admins by explicit UUID, independent of role/email/name.
insert into public.app_user_capabilities (user_id, capability)
select seed.user_id, cap.capability
from (
  values
    ('21566ec2-5cf9-4c8a-b509-075e1bcd520d'::uuid),
    ('37dcb978-16f2-4fd6-8684-fe702c0970e9'::uuid)
) as seed(user_id)
cross join unnest(enum_range(null::public.app_capability)) as cap(capability)
on conflict do nothing;

commit;
