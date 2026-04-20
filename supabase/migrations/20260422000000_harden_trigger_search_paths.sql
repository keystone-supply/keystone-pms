-- Harden trigger functions by pinning search_path.

begin;

alter function public.stamp_project_stage_transition()
  set search_path = public, pg_temp;

alter function public.sheet_preview_repairs_set_updated_at()
  set search_path = public, pg_temp;

commit;
