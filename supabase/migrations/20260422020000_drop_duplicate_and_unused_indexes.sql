-- Drop duplicate and advisor-flagged unused indexes.

begin;

drop index if exists public.projects_project_number_unique;

drop index if exists public.idx_vendors_status;
drop index if exists public.idx_project_documents_vendor_id;
drop index if exists public.sheet_stock_status_idx;
drop index if exists public.sheet_stock_kind_idx;
drop index if exists public.sheet_stock_material_thickness_idx;
drop index if exists public.idx_finance_journal_entries_entry_date;
drop index if exists public.idx_project_calc_lines_tape_position;
drop index if exists public.idx_finance_journal_lines_journal_entry_id;
drop index if exists public.idx_project_calc_lines_project_kind;
drop index if exists public.idx_customers_status;
drop index if exists public.idx_customers_follow_up_at;
drop index if exists public.sheet_preview_repairs_dead_letter_idx;
drop index if exists public.idx_app_users_role;
drop index if exists public.idx_app_users_active;
drop index if exists public.idx_app_user_project_access_project;
drop index if exists public.idx_project_files_project_id;
drop index if exists public.idx_project_files_project_slot;

commit;
