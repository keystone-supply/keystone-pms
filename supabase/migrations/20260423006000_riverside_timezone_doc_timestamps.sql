begin;

alter table public.project_documents
  add column if not exists created_at_riverside timestamp generated always as (
    created_at at time zone 'America/Denver'
  ) stored,
  add column if not exists updated_at_riverside timestamp generated always as (
    updated_at at time zone 'America/Denver'
  ) stored;

alter table public.project_document_revisions
  add column if not exists created_at_riverside timestamp generated always as (
    created_at at time zone 'America/Denver'
  ) stored,
  add column if not exists exported_at_riverside timestamp generated always as (
    case
      when exported_at is null then null
      else exported_at at time zone 'America/Denver'
    end
  ) stored;

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
    issued_date_snapshot = (p_issued_at at time zone 'America/Denver')::date,
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

commit;
