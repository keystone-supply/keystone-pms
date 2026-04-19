create table if not exists public.sheet_preview_repairs (
  id bigint generated always as identity primary key,
  sheet_stock_id uuid not null references public.sheet_stock(id) on delete cascade,
  reason text not null default 'img_url_null',
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed', 'dead_letter')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sheet_preview_repairs_sheet_stock_id_key unique (sheet_stock_id)
);

comment on table public.sheet_preview_repairs is
  'Queue for repairing missing sheet_stock.img_url previews.';

comment on column public.sheet_preview_repairs.status is
  'pending|processing|succeeded|failed|dead_letter';

create index if not exists sheet_preview_repairs_status_available_idx
  on public.sheet_preview_repairs (status, available_at);

create index if not exists sheet_preview_repairs_dead_letter_idx
  on public.sheet_preview_repairs (status, attempts)
  where status = 'dead_letter';

create or replace function public.sheet_preview_repairs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sheet_preview_repairs_set_updated_at on public.sheet_preview_repairs;
create trigger sheet_preview_repairs_set_updated_at
before update on public.sheet_preview_repairs
for each row
execute function public.sheet_preview_repairs_set_updated_at();

create or replace function public.enqueue_sheet_preview_repair(
  p_sheet_stock_id uuid,
  p_reason text default 'img_url_null'
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_img_url text;
begin
  if p_sheet_stock_id is null then
    return;
  end if;

  select img_url
  into v_img_url
  from public.sheet_stock
  where id = p_sheet_stock_id;

  if not found then
    return;
  end if;

  if coalesce(btrim(v_img_url), '') <> '' then
    delete from public.sheet_preview_repairs where sheet_stock_id = p_sheet_stock_id;
    return;
  end if;

  insert into public.sheet_preview_repairs (
    sheet_stock_id,
    reason,
    status,
    attempts,
    last_error,
    available_at,
    locked_at,
    locked_by
  )
  values (
    p_sheet_stock_id,
    coalesce(nullif(btrim(p_reason), ''), 'img_url_null'),
    'pending',
    0,
    null,
    now(),
    null,
    null
  )
  on conflict (sheet_stock_id)
  do update set
    reason = excluded.reason,
    status = 'pending',
    available_at = now(),
    locked_at = null,
    locked_by = null,
    last_error = null;
end;
$$;

create or replace function public.sync_sheet_preview_repair_queue()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if coalesce(btrim(new.img_url), '') = '' then
    perform public.enqueue_sheet_preview_repair(new.id, 'img_url_null');
  else
    delete from public.sheet_preview_repairs where sheet_stock_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists sheet_stock_sync_preview_repair_queue on public.sheet_stock;
create trigger sheet_stock_sync_preview_repair_queue
after insert or update of img_url, svg_path, length_in, width_in on public.sheet_stock
for each row
execute function public.sync_sheet_preview_repair_queue();

create or replace function public.claim_sheet_preview_repair_jobs(
  p_limit integer default 25,
  p_worker text default 'sheet-preview-worker'
)
returns table (
  job_id bigint,
  sheet_stock_id uuid,
  svg_path text,
  length_in double precision,
  width_in double precision,
  dims text,
  attempts integer
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  return query
  with picked as (
    select q.id
    from public.sheet_preview_repairs q
    join public.sheet_stock s on s.id = q.sheet_stock_id
    where q.status in ('pending', 'failed')
      and q.available_at <= now()
      and coalesce(btrim(s.img_url), '') = ''
    order by q.available_at asc, q.id asc
    limit greatest(1, least(coalesce(p_limit, 25), 200))
    for update of q skip locked
  ),
  updated as (
    update public.sheet_preview_repairs q
    set
      status = 'processing',
      attempts = q.attempts + 1,
      locked_at = now(),
      locked_by = coalesce(nullif(p_worker, ''), 'sheet-preview-worker'),
      last_error = null
    where q.id in (select id from picked)
    returning q.id, q.sheet_stock_id, q.attempts
  )
  select
    u.id as job_id,
    u.sheet_stock_id,
    s.svg_path,
    s.length_in,
    s.width_in,
    s.dims,
    u.attempts
  from updated u
  join public.sheet_stock s on s.id = u.sheet_stock_id;
end;
$$;

create or replace function public.finish_sheet_preview_repair_job(
  p_job_id bigint,
  p_success boolean,
  p_error text default null,
  p_retry_seconds integer default 300
)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_attempts integer;
  v_retry_seconds integer := greatest(10, coalesce(p_retry_seconds, 300));
  v_status text;
begin
  if p_job_id is null then
    return;
  end if;

  select attempts
  into v_attempts
  from public.sheet_preview_repairs
  where id = p_job_id
  for update;

  if not found then
    return;
  end if;

  if p_success then
    update public.sheet_preview_repairs
    set
      status = 'succeeded',
      last_error = null,
      available_at = now(),
      locked_at = null,
      locked_by = null
    where id = p_job_id;
    return;
  end if;

  v_status := case when v_attempts >= 5 then 'dead_letter' else 'failed' end;

  update public.sheet_preview_repairs
  set
    status = v_status,
    last_error = coalesce(nullif(btrim(p_error), ''), 'unknown_error'),
    available_at = case
      when v_status = 'dead_letter' then now()
      else now() + make_interval(secs => v_retry_seconds)
    end,
    locked_at = null,
    locked_by = null
  where id = p_job_id;
end;
$$;

create or replace function public.enqueue_missing_sheet_preview_repairs(
  p_limit integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_row record;
  v_limit integer := greatest(1, least(coalesce(p_limit, 5000), 50000));
  v_count integer := 0;
begin
  for v_row in
    select id
    from public.sheet_stock
    where coalesce(btrim(img_url), '') = ''
    order by created_at desc
    limit v_limit
  loop
    perform public.enqueue_sheet_preview_repair(v_row.id, 'backfill_missing_img_url');
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

alter table public.sheet_preview_repairs enable row level security;

revoke all on public.sheet_preview_repairs from public;
revoke all on public.sheet_preview_repairs from anon;
grant select, insert, update, delete on public.sheet_preview_repairs to service_role;

drop policy if exists "sheet_preview_repairs_service_role_all" on public.sheet_preview_repairs;
create policy "sheet_preview_repairs_service_role_all"
on public.sheet_preview_repairs
for all
to service_role
using (true)
with check (true);

revoke all on function public.enqueue_sheet_preview_repair(uuid, text) from public;
revoke all on function public.sync_sheet_preview_repair_queue() from public;
revoke all on function public.claim_sheet_preview_repair_jobs(integer, text) from public;
revoke all on function public.finish_sheet_preview_repair_job(bigint, boolean, text, integer) from public;
revoke all on function public.enqueue_missing_sheet_preview_repairs(integer) from public;

grant execute on function public.enqueue_sheet_preview_repair(uuid, text) to authenticated, service_role;
grant execute on function public.claim_sheet_preview_repair_jobs(integer, text) to service_role;
grant execute on function public.finish_sheet_preview_repair_job(bigint, boolean, text, integer) to service_role;
grant execute on function public.enqueue_missing_sheet_preview_repairs(integer) to service_role;
