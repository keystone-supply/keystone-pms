alter table public.sheet_stock
  add column if not exists svg_path text;

alter table public.sheet_stock
  add column if not exists img_url text;

comment on column public.sheet_stock.svg_path is
  'SVG path geometry for irregular remnant outlines.';

comment on column public.sheet_stock.img_url is
  'Public URL for rendered remnant preview image.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sheet-previews',
  'sheet-previews',
  true,
  5242880,
  array['image/png', 'image/svg+xml']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'sheet_previews_public_read'
  ) then
    create policy sheet_previews_public_read
      on storage.objects
      for select
      using (bucket_id = 'sheet-previews');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'sheet_previews_auth_insert'
  ) then
    create policy sheet_previews_auth_insert
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'sheet-previews');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'sheet_previews_auth_update'
  ) then
    create policy sheet_previews_auth_update
      on storage.objects
      for update
      to authenticated
      using (bucket_id = 'sheet-previews')
      with check (bucket_id = 'sheet-previews');
  end if;
end $$;
