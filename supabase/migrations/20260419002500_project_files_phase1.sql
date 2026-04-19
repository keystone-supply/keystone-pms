-- Phase 1: OneDrive project files metadata, sync cursor, and storage mirror.

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  onedrive_drive_id text not null,
  onedrive_item_id text not null unique,
  onedrive_parent_item_id text null,
  onedrive_path text not null,
  folder_slot text not null default 'other' check (
    folder_slot in ('cad', 'vendors', 'pics', 'docs', 'gcode', 'root', 'other')
  ),
  name text not null,
  mime_type text null,
  size_bytes bigint null,
  is_folder boolean not null default false,
  onedrive_etag text null,
  onedrive_ctag text null,
  web_url text null,
  storage_object_key text null,
  storage_sha256 text null,
  mirrored_at timestamptz null,
  mirror_status text not null default 'not_mirrored' check (
    mirror_status in ('not_mirrored', 'mirroring', 'synced', 'stale', 'error')
  ),
  mirror_error text null,
  content_text text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_files_project_id
  on public.project_files(project_id);

create index if not exists idx_project_files_project_slot
  on public.project_files(project_id, folder_slot);

create index if not exists idx_project_files_project_path
  on public.project_files(project_id, onedrive_path);

create table if not exists public.project_folder_sync (
  project_id uuid primary key references public.projects(id) on delete cascade,
  delta_token text null,
  last_full_index_at timestamptz null,
  last_delta_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.project_files enable row level security;
alter table public.project_folder_sync enable row level security;

revoke all on public.project_files from public;
revoke all on public.project_files from anon;
revoke all on public.project_folder_sync from public;
revoke all on public.project_folder_sync from anon;

grant select, insert, update, delete on public.project_files to authenticated;
grant select, insert, update, delete on public.project_folder_sync to authenticated;
grant all on public.project_files to service_role;
grant all on public.project_folder_sync to service_role;

drop policy if exists "project_files_role_select_authenticated" on public.project_files;
drop policy if exists "project_files_role_insert_authenticated" on public.project_files;
drop policy if exists "project_files_role_update_authenticated" on public.project_files;
drop policy if exists "project_files_role_delete_authenticated" on public.project_files;

create policy "project_files_role_select_authenticated"
on public.project_files
for select
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_files.project_id
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

create policy "project_files_role_insert_authenticated"
on public.project_files
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

create policy "project_files_role_update_authenticated"
on public.project_files
for update
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_files.project_id
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

create policy "project_files_role_delete_authenticated"
on public.project_files
for delete
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_files.project_id
      and public.current_app_role() in ('admin', 'manager', 'sales')
  )
);

drop policy if exists "project_folder_sync_role_select_authenticated" on public.project_folder_sync;
drop policy if exists "project_folder_sync_role_insert_authenticated" on public.project_folder_sync;
drop policy if exists "project_folder_sync_role_update_authenticated" on public.project_folder_sync;
drop policy if exists "project_folder_sync_role_delete_authenticated" on public.project_folder_sync;

create policy "project_folder_sync_role_select_authenticated"
on public.project_folder_sync
for select
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_folder_sync.project_id
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

create policy "project_folder_sync_role_insert_authenticated"
on public.project_folder_sync
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

create policy "project_folder_sync_role_update_authenticated"
on public.project_folder_sync
for update
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_folder_sync.project_id
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

create policy "project_folder_sync_role_delete_authenticated"
on public.project_folder_sync
for delete
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_folder_sync.project_id
      and public.current_app_role() in ('admin', 'manager')
  )
);

alter table public.projects
  add column if not exists files_phase1_enabled boolean not null default false;

insert into storage.buckets (id, name, public, file_size_limit)
values ('project-files', 'project-files', false, 104857600)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_bucket_role_select_authenticated'
  ) then
    create policy project_files_bucket_role_select_authenticated
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'project-files'
        and exists (
          select 1
          from public.projects p
          where p.id::text = split_part(storage.objects.name, '/', 1)
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
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_bucket_role_insert_authenticated'
  ) then
    create policy project_files_bucket_role_insert_authenticated
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'project-files'
        and exists (
          select 1
          from public.projects p
          where p.id::text = split_part(storage.objects.name, '/', 1)
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
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_bucket_role_update_authenticated'
  ) then
    create policy project_files_bucket_role_update_authenticated
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'project-files'
        and exists (
          select 1
          from public.projects p
          where p.id::text = split_part(storage.objects.name, '/', 1)
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
        bucket_id = 'project-files'
        and exists (
          select 1
          from public.projects p
          where p.id::text = split_part(storage.objects.name, '/', 1)
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
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_bucket_role_delete_authenticated'
  ) then
    create policy project_files_bucket_role_delete_authenticated
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'project-files'
        and exists (
          select 1
          from public.projects p
          where p.id::text = split_part(storage.objects.name, '/', 1)
            and public.current_app_role() in ('admin', 'manager')
        )
      );
  end if;
end $$;
