begin;

-- app_users
drop policy if exists "app_users_self_select" on public.app_users;
drop policy if exists "app_users_admin_manage" on public.app_users;
drop policy if exists "app_users_admin_all" on public.app_users;
drop policy if exists "app_users_self_or_admin_select" on public.app_users;
drop policy if exists "app_users_select_self_or_admin" on public.app_users;
drop policy if exists "app_users_admin_insert" on public.app_users;
drop policy if exists "app_users_admin_update" on public.app_users;
drop policy if exists "app_users_admin_delete" on public.app_users;

create policy "app_users_select_self_or_admin"
on public.app_users
for select
to authenticated
using (
  (select public.current_app_user_has('manage_users'::public.app_capability))
  or lower(email::text) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
);

create policy "app_users_admin_insert"
on public.app_users
for insert
to authenticated
with check ((select public.current_app_user_has('manage_users'::public.app_capability)));

create policy "app_users_admin_update"
on public.app_users
for update
to authenticated
using ((select public.current_app_user_has('manage_users'::public.app_capability)))
with check ((select public.current_app_user_has('manage_users'::public.app_capability)));

create policy "app_users_admin_delete"
on public.app_users
for delete
to authenticated
using ((select public.current_app_user_has('manage_users'::public.app_capability)));

-- app_user_project_access
drop policy if exists "app_user_project_access_self_select" on public.app_user_project_access;
drop policy if exists "app_user_project_access_admin_manage" on public.app_user_project_access;
drop policy if exists "app_user_project_access_admin_all" on public.app_user_project_access;
drop policy if exists "app_user_project_access_self_or_admin_select" on public.app_user_project_access;
drop policy if exists "app_user_project_access_select_self_or_admin" on public.app_user_project_access;
drop policy if exists "app_user_project_access_admin_insert" on public.app_user_project_access;
drop policy if exists "app_user_project_access_admin_update" on public.app_user_project_access;
drop policy if exists "app_user_project_access_admin_delete" on public.app_user_project_access;

create policy "app_user_project_access_select_self_or_admin"
on public.app_user_project_access
for select
to authenticated
using (
  user_id = (select public.current_app_user_id())
  or (select public.current_app_user_has('manage_users'::public.app_capability))
  or (select public.current_app_user_has('manage_user_access'::public.app_capability))
);

create policy "app_user_project_access_admin_insert"
on public.app_user_project_access
for insert
to authenticated
with check (
  (select public.current_app_user_has('manage_users'::public.app_capability))
  or (select public.current_app_user_has('manage_user_access'::public.app_capability))
);

create policy "app_user_project_access_admin_update"
on public.app_user_project_access
for update
to authenticated
using (
  (select public.current_app_user_has('manage_users'::public.app_capability))
  or (select public.current_app_user_has('manage_user_access'::public.app_capability))
)
with check (
  (select public.current_app_user_has('manage_users'::public.app_capability))
  or (select public.current_app_user_has('manage_user_access'::public.app_capability))
);

create policy "app_user_project_access_admin_delete"
on public.app_user_project_access
for delete
to authenticated
using (
  (select public.current_app_user_has('manage_users'::public.app_capability))
  or (select public.current_app_user_has('manage_user_access'::public.app_capability))
);

-- projects
drop policy if exists "projects_role_select_authenticated" on public.projects;
drop policy if exists "projects_role_insert_authenticated" on public.projects;
drop policy if exists "projects_role_update_authenticated" on public.projects;
drop policy if exists "projects_role_delete_authenticated" on public.projects;

create policy "projects_role_select_authenticated"
on public.projects
for select
to authenticated
using (
  (select public.current_app_user_has('read_projects'::public.app_capability))
  or exists (
    select 1
    from public.app_user_project_access a
    where a.project_id = projects.id
      and a.user_id = (select public.current_app_user_id())
      and a.can_read = true
  )
);

create policy "projects_role_insert_authenticated"
on public.projects
for insert
to authenticated
with check ((select public.current_app_user_has('create_projects'::public.app_capability)));

create policy "projects_role_update_authenticated"
on public.projects
for update
to authenticated
using (
  (select public.current_app_user_has('edit_projects'::public.app_capability))
  or exists (
    select 1
    from public.app_user_project_access a
    where a.project_id = projects.id
      and a.user_id = (select public.current_app_user_id())
      and a.can_write = true
  )
)
with check (
  (select public.current_app_user_has('edit_projects'::public.app_capability))
  or exists (
    select 1
    from public.app_user_project_access a
    where a.project_id = projects.id
      and a.user_id = (select public.current_app_user_id())
      and a.can_write = true
  )
);

create policy "projects_role_delete_authenticated"
on public.projects
for delete
to authenticated
using ((select public.current_app_user_has('delete_projects'::public.app_capability)));

-- project_documents
drop policy if exists "project_documents_role_select_authenticated" on public.project_documents;
drop policy if exists "project_documents_role_insert_authenticated" on public.project_documents;
drop policy if exists "project_documents_role_update_authenticated" on public.project_documents;
drop policy if exists "project_documents_role_delete_authenticated" on public.project_documents;

create policy "project_documents_role_select_authenticated"
on public.project_documents
for select
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_documents.project_id
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

create policy "project_documents_role_insert_authenticated"
on public.project_documents
for insert
to authenticated
with check (
  exists (
    select 1
    from public.projects p
    where p.id = project_id
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

create policy "project_documents_role_update_authenticated"
on public.project_documents
for update
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_documents.project_id
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
    from public.projects p
    where p.id = project_id
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

create policy "project_documents_role_delete_authenticated"
on public.project_documents
for delete
to authenticated
using (
  (select public.current_app_user_has('manage_documents'::public.app_capability))
);

-- customers/vendors/addresses
drop policy if exists "customers_role_authenticated" on public.customers;
drop policy if exists "customer_shipping_role_authenticated" on public.customer_shipping_addresses;
drop policy if exists "vendors_role_authenticated" on public.vendors;

create policy "customers_role_authenticated"
on public.customers
for all
to authenticated
using (
  (select public.current_app_user_has('access_sales'::public.app_capability))
)
with check (
  (select public.current_app_user_has('manage_crm'::public.app_capability))
);

create policy "customer_shipping_role_authenticated"
on public.customer_shipping_addresses
for all
to authenticated
using (
  (select public.current_app_user_has('access_sales'::public.app_capability))
)
with check (
  (select public.current_app_user_has('manage_crm'::public.app_capability))
);

create policy "vendors_role_authenticated"
on public.vendors
for all
to authenticated
using (
  (select public.current_app_user_has('access_sales'::public.app_capability))
)
with check (
  (select public.current_app_user_has('manage_crm'::public.app_capability))
);

-- finance
drop policy if exists "finance_journal_entries_role_select_authenticated" on public.finance_journal_entries;
drop policy if exists "finance_journal_entries_role_insert_authenticated" on public.finance_journal_entries;
drop policy if exists "finance_journal_entries_role_update_authenticated" on public.finance_journal_entries;
drop policy if exists "finance_journal_entries_role_delete_authenticated" on public.finance_journal_entries;
drop policy if exists "finance_journal_lines_role_select_authenticated" on public.finance_journal_lines;
drop policy if exists "finance_journal_lines_role_insert_authenticated" on public.finance_journal_lines;
drop policy if exists "finance_journal_lines_role_update_authenticated" on public.finance_journal_lines;
drop policy if exists "finance_journal_lines_role_delete_authenticated" on public.finance_journal_lines;

create policy "finance_journal_entries_role_select_authenticated"
on public.finance_journal_entries
for select
to authenticated
using ((select public.current_app_user_has('view_financials'::public.app_capability)));

create policy "finance_journal_entries_role_insert_authenticated"
on public.finance_journal_entries
for insert
to authenticated
with check ((select public.current_app_user_has('delete_projects'::public.app_capability)));

create policy "finance_journal_entries_role_update_authenticated"
on public.finance_journal_entries
for update
to authenticated
using ((select public.current_app_user_has('delete_projects'::public.app_capability)))
with check ((select public.current_app_user_has('delete_projects'::public.app_capability)));

create policy "finance_journal_entries_role_delete_authenticated"
on public.finance_journal_entries
for delete
to authenticated
using ((select public.current_app_user_has('delete_projects'::public.app_capability)));

create policy "finance_journal_lines_role_select_authenticated"
on public.finance_journal_lines
for select
to authenticated
using ((select public.current_app_user_has('view_financials'::public.app_capability)));

create policy "finance_journal_lines_role_insert_authenticated"
on public.finance_journal_lines
for insert
to authenticated
with check ((select public.current_app_user_has('delete_projects'::public.app_capability)));

create policy "finance_journal_lines_role_update_authenticated"
on public.finance_journal_lines
for update
to authenticated
using ((select public.current_app_user_has('delete_projects'::public.app_capability)))
with check ((select public.current_app_user_has('delete_projects'::public.app_capability)));

create policy "finance_journal_lines_role_delete_authenticated"
on public.finance_journal_lines
for delete
to authenticated
using ((select public.current_app_user_has('delete_projects'::public.app_capability)));

-- sheet_stock
drop policy if exists "sheet_stock_role_select_authenticated" on public.sheet_stock;
drop policy if exists "sheet_stock_role_insert_authenticated" on public.sheet_stock;
drop policy if exists "sheet_stock_role_update_authenticated" on public.sheet_stock;
drop policy if exists "sheet_stock_role_delete_authenticated" on public.sheet_stock;

create policy "sheet_stock_role_select_authenticated"
on public.sheet_stock
for select
to authenticated
using ((select public.current_app_user_has('manage_sheet_stock'::public.app_capability)));

create policy "sheet_stock_role_insert_authenticated"
on public.sheet_stock
for insert
to authenticated
with check ((select public.current_app_user_has('manage_sheet_stock'::public.app_capability)));

create policy "sheet_stock_role_update_authenticated"
on public.sheet_stock
for update
to authenticated
using ((select public.current_app_user_has('manage_sheet_stock'::public.app_capability)))
with check ((select public.current_app_user_has('manage_sheet_stock'::public.app_capability)));

create policy "sheet_stock_role_delete_authenticated"
on public.sheet_stock
for delete
to authenticated
using ((select public.current_app_user_has('manage_sheet_stock'::public.app_capability)));

-- project files + sync
drop policy if exists "project_files_role_select_authenticated" on public.project_files;
drop policy if exists "project_files_role_insert_authenticated" on public.project_files;
drop policy if exists "project_files_role_update_authenticated" on public.project_files;
drop policy if exists "project_files_role_delete_authenticated" on public.project_files;
drop policy if exists "project_folder_sync_role_select_authenticated" on public.project_folder_sync;
drop policy if exists "project_folder_sync_role_insert_authenticated" on public.project_folder_sync;
drop policy if exists "project_folder_sync_role_update_authenticated" on public.project_folder_sync;
drop policy if exists "project_folder_sync_role_delete_authenticated" on public.project_folder_sync;

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
    from public.projects p
    where p.id = project_id
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

create policy "project_files_role_delete_authenticated"
on public.project_files
for delete
to authenticated
using (
  (select public.current_app_user_has('manage_documents'::public.app_capability))
);

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
    from public.projects p
    where p.id = project_id
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

create policy "project_folder_sync_role_delete_authenticated"
on public.project_folder_sync
for delete
to authenticated
using (
  (select public.current_app_user_has('manage_documents'::public.app_capability))
);

-- project calc tables
drop policy if exists "project_calc_tapes_role_select_authenticated" on public.project_calc_tapes;
drop policy if exists "project_calc_tapes_role_insert_authenticated" on public.project_calc_tapes;
drop policy if exists "project_calc_tapes_role_update_authenticated" on public.project_calc_tapes;
drop policy if exists "project_calc_tapes_role_delete_authenticated" on public.project_calc_tapes;
drop policy if exists "project_calc_lines_role_select_authenticated" on public.project_calc_lines;
drop policy if exists "project_calc_lines_role_insert_authenticated" on public.project_calc_lines;
drop policy if exists "project_calc_lines_role_update_authenticated" on public.project_calc_lines;
drop policy if exists "project_calc_lines_role_delete_authenticated" on public.project_calc_lines;

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
        (select public.current_app_user_has('edit_projects'::public.app_capability))
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
        (select public.current_app_user_has('edit_projects'::public.app_capability))
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
    from public.projects p
    where p.id = project_id
      and (
        (select public.current_app_user_has('edit_projects'::public.app_capability))
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

create policy "project_calc_tapes_role_delete_authenticated"
on public.project_calc_tapes
for delete
to authenticated
using (
  (select public.current_app_user_has('delete_projects'::public.app_capability))
);

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
        (select public.current_app_user_has('edit_projects'::public.app_capability))
        or exists (
          select 1
          from public.app_user_project_access a
          where a.project_id = p.id
            and a.user_id = (select public.current_app_user_id())
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
        (select public.current_app_user_has('edit_projects'::public.app_capability))
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
    from public.projects p
    where p.id = project_id
      and (
        (select public.current_app_user_has('edit_projects'::public.app_capability))
        or exists (
          select 1
          from public.app_user_project_access a
          where a.project_id = p.id
            and a.user_id = (select public.current_app_user_id())
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
  (select public.current_app_user_has('delete_projects'::public.app_capability))
);

-- storage objects policies for project-files bucket.
do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_bucket_role_select_authenticated'
  ) then
    drop policy project_files_bucket_role_select_authenticated on storage.objects;
  end if;
  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_bucket_role_insert_authenticated'
  ) then
    drop policy project_files_bucket_role_insert_authenticated on storage.objects;
  end if;
  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_bucket_role_update_authenticated'
  ) then
    drop policy project_files_bucket_role_update_authenticated on storage.objects;
  end if;
  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_bucket_role_delete_authenticated'
  ) then
    drop policy project_files_bucket_role_delete_authenticated on storage.objects;
  end if;

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
      bucket_id = 'project-files'
      and exists (
        select 1
        from public.projects p
        where p.id::text = split_part(storage.objects.name, '/', 1)
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

  create policy project_files_bucket_role_delete_authenticated
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'project-files'
      and (
        (select public.current_app_user_has('manage_documents'::public.app_capability))
        or (select public.current_app_user_has('delete_projects'::public.app_capability))
      )
    );
end
$$;

commit;
