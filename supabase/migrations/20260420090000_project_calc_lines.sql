-- Phase 3: project-scoped persisted calculator tapes + line snapshots.

create table if not exists public.project_calc_tapes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  source text not null default 'weight_calc' check (
    source in ('weight_calc', 'pipad', 'manual')
  ),
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_calc_tapes_project_id
  on public.project_calc_tapes(project_id);

create table if not exists public.project_calc_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  tape_id uuid not null references public.project_calc_tapes(id) on delete cascade,
  position integer not null check (position >= 0),
  kind text not null check (kind in ('material', 'math', 'note')),
  description text not null default '',
  qty numeric not null default 1,
  uom text not null default 'EA',
  notes text not null default '',
  material_key text null,
  material_name text null,
  shape text null,
  length_in numeric null,
  dim1 numeric null,
  dim2 numeric null,
  density numeric null,
  cost_per_lb numeric null,
  sell_per_lb numeric null,
  unit_weight_lb numeric null,
  unit_cost numeric null,
  total_weight_lb numeric null,
  total_cost numeric null,
  total_sell numeric null,
  expr text null,
  expr_display text null,
  expr_error text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_calc_lines_tape_position
  on public.project_calc_lines(tape_id, position);

create index if not exists idx_project_calc_lines_project_kind
  on public.project_calc_lines(project_id, kind);

create unique index if not exists idx_project_calc_lines_tape_position_unique
  on public.project_calc_lines(tape_id, position);

alter table public.project_calc_tapes enable row level security;
alter table public.project_calc_lines enable row level security;

revoke all on public.project_calc_tapes from public;
revoke all on public.project_calc_tapes from anon;
revoke all on public.project_calc_lines from public;
revoke all on public.project_calc_lines from anon;

grant select, insert, update, delete on public.project_calc_tapes to authenticated;
grant select, insert, update, delete on public.project_calc_lines to authenticated;
grant all on public.project_calc_tapes to service_role;
grant all on public.project_calc_lines to service_role;

drop policy if exists "project_calc_tapes_role_select_authenticated" on public.project_calc_tapes;
drop policy if exists "project_calc_tapes_role_insert_authenticated" on public.project_calc_tapes;
drop policy if exists "project_calc_tapes_role_update_authenticated" on public.project_calc_tapes;
drop policy if exists "project_calc_tapes_role_delete_authenticated" on public.project_calc_tapes;

create policy "project_calc_tapes_role_select_authenticated"
on public.project_calc_tapes
for select
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_calc_tapes.project_id
      and (
        public.current_app_role() in ('admin', 'manager', 'sales')
        or exists (
          select 1
          from public.app_user_project_access a
          where a.project_id = p.id
            and a.user_id = public.current_app_user_id()
            and a.can_read = true
        )
      )
  )
);

create policy "project_calc_tapes_role_insert_authenticated"
on public.project_calc_tapes
for insert
to authenticated
with check (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and (
        public.current_app_role() in ('admin', 'manager', 'sales')
        or exists (
          select 1
          from public.app_user_project_access a
          where a.project_id = p.id
            and a.user_id = public.current_app_user_id()
            and a.can_write = true
        )
      )
  )
);

create policy "project_calc_tapes_role_update_authenticated"
on public.project_calc_tapes
for update
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_calc_tapes.project_id
      and (
        public.current_app_role() in ('admin', 'manager', 'sales')
        or exists (
          select 1
          from public.app_user_project_access a
          where a.project_id = p.id
            and a.user_id = public.current_app_user_id()
            and a.can_write = true
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and (
        public.current_app_role() in ('admin', 'manager', 'sales')
        or exists (
          select 1
          from public.app_user_project_access a
          where a.project_id = p.id
            and a.user_id = public.current_app_user_id()
            and a.can_write = true
        )
      )
  )
);

create policy "project_calc_tapes_role_delete_authenticated"
on public.project_calc_tapes
for delete
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_calc_tapes.project_id
      and public.current_app_role() in ('admin', 'manager', 'sales')
  )
);

drop policy if exists "project_calc_lines_role_select_authenticated" on public.project_calc_lines;
drop policy if exists "project_calc_lines_role_insert_authenticated" on public.project_calc_lines;
drop policy if exists "project_calc_lines_role_update_authenticated" on public.project_calc_lines;
drop policy if exists "project_calc_lines_role_delete_authenticated" on public.project_calc_lines;

create policy "project_calc_lines_role_select_authenticated"
on public.project_calc_lines
for select
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_calc_lines.project_id
      and (
        public.current_app_role() in ('admin', 'manager', 'sales')
        or exists (
          select 1
          from public.app_user_project_access a
          where a.project_id = p.id
            and a.user_id = public.current_app_user_id()
            and a.can_read = true
        )
      )
  )
);

create policy "project_calc_lines_role_insert_authenticated"
on public.project_calc_lines
for insert
to authenticated
with check (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and (
        public.current_app_role() in ('admin', 'manager', 'sales')
        or exists (
          select 1
          from public.app_user_project_access a
          where a.project_id = p.id
            and a.user_id = public.current_app_user_id()
            and a.can_write = true
        )
      )
  )
  and exists (
    select 1
    from public.project_calc_tapes t
    where t.id = tape_id
      and t.project_id = project_id
  )
);

create policy "project_calc_lines_role_update_authenticated"
on public.project_calc_lines
for update
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_calc_lines.project_id
      and (
        public.current_app_role() in ('admin', 'manager', 'sales')
        or exists (
          select 1
          from public.app_user_project_access a
          where a.project_id = p.id
            and a.user_id = public.current_app_user_id()
            and a.can_write = true
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
      and (
        public.current_app_role() in ('admin', 'manager', 'sales')
        or exists (
          select 1
          from public.app_user_project_access a
          where a.project_id = p.id
            and a.user_id = public.current_app_user_id()
            and a.can_write = true
        )
      )
  )
  and exists (
    select 1
    from public.project_calc_tapes t
    where t.id = tape_id
      and t.project_id = project_id
  )
);

create policy "project_calc_lines_role_delete_authenticated"
on public.project_calc_lines
for delete
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_calc_lines.project_id
      and public.current_app_role() in ('admin', 'manager', 'sales')
  )
);
