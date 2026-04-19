drop function if exists public.claim_sheet_preview_repair_jobs(integer, text);

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
    u.attempts
  from updated u
  join public.sheet_stock s on s.id = u.sheet_stock_id;
end;
$$;

grant execute on function public.claim_sheet_preview_repair_jobs(integer, text) to service_role;
