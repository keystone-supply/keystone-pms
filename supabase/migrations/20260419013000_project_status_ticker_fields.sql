-- Phase 2: add project status ticker milestone fields.

alter table public.projects
  add column if not exists rfq_received_at timestamptz,
  add column if not exists ready_to_ship_at timestamptz;

update public.projects
set rfq_received_at = created_at
where rfq_received_at is null
  and created_at is not null;
