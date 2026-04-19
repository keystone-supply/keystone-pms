-- Ensure project files phase 1 is enabled by default in test environments.
-- Backfill existing rows so behavior matches fresh inserts.

alter table public.projects
  alter column files_phase1_enabled set default true;

update public.projects
set files_phase1_enabled = true
where coalesce(files_phase1_enabled, false) = false;
