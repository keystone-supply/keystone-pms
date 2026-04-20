begin;

drop view if exists public.projects_role_filtered;

create view public.projects_role_filtered
with (security_invoker = true) as
select
  p.id,
  p.project_number,
  p.project_name,
  p.customer,
  p.customer_id,
  p.sales_command_stage,
  p.created_at,
  p.updated_at,
  case
    when public.current_app_user_has('view_financials'::public.app_capability) then p.total_quoted
    else null
  end as total_quoted,
  case
    when public.current_app_user_has('view_financials'::public.app_capability) then p.invoiced_amount
    else null
  end as invoiced_amount,
  case
    when public.current_app_user_has('view_financials'::public.app_capability) then p.material_cost
    else null
  end as material_cost,
  case
    when public.current_app_user_has('view_financials'::public.app_capability) then p.labor_cost
    else null
  end as labor_cost
from public.projects p;

revoke all on public.projects_role_filtered from public;
revoke all on public.projects_role_filtered from anon;
grant select on public.projects_role_filtered to authenticated, service_role;

commit;
