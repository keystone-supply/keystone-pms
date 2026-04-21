begin;

alter table public.project_documents
  add column if not exists current_revision_index integer not null default 0;

create table if not exists public.project_document_revisions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.project_documents(id) on delete cascade,
  revision_index integer not null check (revision_index >= 0),
  state text not null check (state in ('draft', 'exported')),
  number_snapshot text,
  metadata_snapshot jsonb not null default '{}'::jsonb,
  vendor_id_snapshot uuid references public.vendors(id) on delete set null,
  issued_date_snapshot date,
  export_channel text check (export_channel in ('download', 'onedrive')),
  exported_at timestamptz,
  pdf_path text,
  filename text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(document_id, revision_index)
);

create index if not exists idx_project_document_revisions_document_id
  on public.project_document_revisions(document_id);

create index if not exists idx_project_document_revisions_document_revision
  on public.project_document_revisions(document_id, revision_index desc);

create index if not exists idx_project_document_revisions_document_state
  on public.project_document_revisions(document_id, state);

insert into public.project_document_revisions (
  document_id,
  revision_index,
  state,
  number_snapshot,
  metadata_snapshot,
  vendor_id_snapshot,
  created_at
)
select
  d.id,
  0,
  coalesce(nullif(d.status, ''), 'draft'),
  d.number,
  coalesce(d.metadata, '{}'::jsonb),
  d.vendor_id,
  coalesce(d.created_at, now())
from public.project_documents d
left join public.project_document_revisions r
  on r.document_id = d.id
 and r.revision_index = 0
where r.id is null;

update public.project_documents
set current_revision_index = 0
where current_revision_index is distinct from 0;

alter table public.project_document_revisions enable row level security;

revoke all on table public.project_document_revisions from public;
revoke all on table public.project_document_revisions from anon;
grant select, insert, update, delete on public.project_document_revisions to authenticated;
grant all on public.project_document_revisions to service_role;

drop policy if exists "project_document_revisions_role_select_authenticated" on public.project_document_revisions;
drop policy if exists "project_document_revisions_role_insert_authenticated" on public.project_document_revisions;
drop policy if exists "project_document_revisions_role_update_authenticated" on public.project_document_revisions;
drop policy if exists "project_document_revisions_role_delete_authenticated" on public.project_document_revisions;

create policy "project_document_revisions_role_select_authenticated"
on public.project_document_revisions
for select
to authenticated
using (
  exists (
    select 1
    from public.project_documents d
    join public.projects p on p.id = d.project_id
    where d.id = project_document_revisions.document_id
      and (
        (select public.current_app_user_has('read_projects'::public.app_capability))
        or exists (
          select 1
          from public.app_user_project_access a
          where a.project_id = p.id
            and a.user_id = (select public.current_app_user_id())
            and a.can_read = true
        )
      )
  )
);

create policy "project_document_revisions_role_insert_authenticated"
on public.project_document_revisions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.project_documents d
    join public.projects p on p.id = d.project_id
    where d.id = document_id
      and (
        (select public.current_app_user_has('manage_documents'::public.app_capability))
        or exists (
          select 1
          from public.app_user_project_access a
          where a.project_id = p.id
            and a.user_id = (select public.current_app_user_id())
            and a.can_write = true
        )
      )
  )
);

create policy "project_document_revisions_role_update_authenticated"
on public.project_document_revisions
for update
to authenticated
using (
  exists (
    select 1
    from public.project_documents d
    join public.projects p on p.id = d.project_id
    where d.id = project_document_revisions.document_id
      and (
        (select public.current_app_user_has('manage_documents'::public.app_capability))
        or exists (
          select 1
          from public.app_user_project_access a
          where a.project_id = p.id
            and a.user_id = (select public.current_app_user_id())
            and a.can_write = true
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.project_documents d
    join public.projects p on p.id = d.project_id
    where d.id = document_id
      and (
        (select public.current_app_user_has('manage_documents'::public.app_capability))
        or exists (
          select 1
          from public.app_user_project_access a
          where a.project_id = p.id
            and a.user_id = (select public.current_app_user_id())
            and a.can_write = true
        )
      )
  )
);

create policy "project_document_revisions_role_delete_authenticated"
on public.project_document_revisions
for delete
to authenticated
using ((select public.current_app_user_has('manage_documents'::public.app_capability)));

create or replace function public.create_project_document_with_initial_revision(
  p_project_id uuid,
  p_kind text,
  p_number text,
  p_metadata jsonb,
  p_vendor_id uuid default null
)
returns table(document_id uuid, revision_id uuid, revision_index integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document_id uuid;
  v_revision_id uuid;
  v_is_vendor_kind boolean;
  v_can_manage boolean;
begin
  v_can_manage :=
    (select public.current_app_user_has('manage_documents'::public.app_capability))
    or exists (
      select 1
      from public.app_user_project_access a
      where a.project_id = p_project_id
        and a.user_id = (select public.current_app_user_id())
        and a.can_write = true
    );

  if not v_can_manage then
    raise exception 'insufficient privileges to create document revision';
  end if;

  v_is_vendor_kind := p_kind in ('rfq', 'purchase_order');

  insert into public.project_documents (
    project_id,
    kind,
    status,
    number,
    metadata,
    vendor_id,
    pdf_path,
    current_revision_index,
    updated_at
  )
  values (
    p_project_id,
    p_kind,
    'draft',
    nullif(trim(coalesce(p_number, '')), ''),
    coalesce(p_metadata, '{}'::jsonb),
    case
      when v_is_vendor_kind then p_vendor_id
      else null
    end,
    null,
    0,
    now()
  )
  returning id into v_document_id;

  insert into public.project_document_revisions (
    document_id,
    revision_index,
    state,
    number_snapshot,
    metadata_snapshot,
    vendor_id_snapshot,
    created_by
  )
  values (
    v_document_id,
    0,
    'draft',
    nullif(trim(coalesce(p_number, '')), ''),
    coalesce(p_metadata, '{}'::jsonb),
    case
      when v_is_vendor_kind then p_vendor_id
      else null
    end,
    (select public.current_app_user_id())
  )
  returning id into v_revision_id;

  return query select v_document_id, v_revision_id, 0;
end;
$$;

create or replace function public.append_project_document_revision(
  p_document_id uuid,
  p_number text,
  p_metadata jsonb,
  p_vendor_id uuid default null
)
returns table(document_id uuid, revision_id uuid, revision_index integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid;
  v_kind text;
  v_next_revision integer;
  v_revision_id uuid;
  v_can_manage boolean;
begin
  select d.project_id, d.kind, d.current_revision_index
  into v_project_id, v_kind, v_next_revision
  from public.project_documents d
  where d.id = p_document_id
  for update;

  if not found then
    raise exception 'project document not found';
  end if;

  v_can_manage :=
    (select public.current_app_user_has('manage_documents'::public.app_capability))
    or exists (
      select 1
      from public.app_user_project_access a
      where a.project_id = v_project_id
        and a.user_id = (select public.current_app_user_id())
        and a.can_write = true
    );

  if not v_can_manage then
    raise exception 'insufficient privileges to append document revision';
  end if;

  v_next_revision := coalesce(v_next_revision, 0) + 1;

  insert into public.project_document_revisions (
    document_id,
    revision_index,
    state,
    number_snapshot,
    metadata_snapshot,
    vendor_id_snapshot,
    created_by
  )
  values (
    p_document_id,
    v_next_revision,
    'draft',
    nullif(trim(coalesce(p_number, '')), ''),
    coalesce(p_metadata, '{}'::jsonb),
    case
      when v_kind in ('rfq', 'purchase_order') then p_vendor_id
      else null
    end,
    (select public.current_app_user_id())
  )
  returning id into v_revision_id;

  update public.project_documents
  set
    status = 'draft',
    number = nullif(trim(coalesce(p_number, '')), ''),
    metadata = coalesce(p_metadata, '{}'::jsonb),
    vendor_id = case
      when v_kind in ('rfq', 'purchase_order') then p_vendor_id
      else null
    end,
    current_revision_index = v_next_revision,
    updated_at = now()
  where id = p_document_id;

  return query select p_document_id, v_revision_id, v_next_revision;
end;
$$;

create or replace function public.mark_project_document_revision_exported(
  p_document_id uuid,
  p_revision_index integer,
  p_export_channel text,
  p_pdf_path text,
  p_filename text,
  p_issued_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid;
  v_can_manage boolean;
begin
  select d.project_id
  into v_project_id
  from public.project_documents d
  where d.id = p_document_id;

  if not found then
    raise exception 'project document not found';
  end if;

  v_can_manage :=
    (select public.current_app_user_has('manage_documents'::public.app_capability))
    or exists (
      select 1
      from public.app_user_project_access a
      where a.project_id = v_project_id
        and a.user_id = (select public.current_app_user_id())
        and a.can_write = true
    );

  if not v_can_manage then
    raise exception 'insufficient privileges to mark export';
  end if;

  update public.project_document_revisions r
  set
    state = 'exported',
    export_channel = p_export_channel,
    exported_at = p_issued_at,
    issued_date_snapshot = p_issued_at::date,
    pdf_path = case
      when p_export_channel = 'onedrive' then p_pdf_path
      else r.pdf_path
    end,
    filename = p_filename
  where r.document_id = p_document_id
    and r.revision_index = p_revision_index;

  if not found then
    raise exception 'document revision not found';
  end if;

  update public.project_documents
  set
    pdf_path = case
      when p_export_channel = 'onedrive' then p_pdf_path
      else pdf_path
    end,
    updated_at = now()
  where id = p_document_id;
end;
$$;

revoke all on function public.create_project_document_with_initial_revision(uuid, text, text, jsonb, uuid) from public;
revoke all on function public.append_project_document_revision(uuid, text, jsonb, uuid) from public;
revoke all on function public.mark_project_document_revision_exported(uuid, integer, text, text, text, timestamptz) from public;

grant execute on function public.create_project_document_with_initial_revision(uuid, text, text, jsonb, uuid) to authenticated, service_role;
grant execute on function public.append_project_document_revision(uuid, text, jsonb, uuid) to authenticated, service_role;
grant execute on function public.mark_project_document_revision_exported(uuid, integer, text, text, text, timestamptz) to authenticated, service_role;

comment on table public.project_document_revisions is 'Immutable revision history for project_documents, including draft and export lifecycle events.';
comment on column public.project_documents.current_revision_index is 'Current immutable revision index for this logical document series.';

commit;
