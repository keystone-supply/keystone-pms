-- Collapse project lifecycle to a single canonical stage column.
-- Keep ops sub-milestones (materials/labor) while removing redundant lifecycle fields.

begin;

alter table public.projects
  add column if not exists lost_at timestamptz,
  add column if not exists cancelled_at timestamptz;

comment on column public.projects.lost_at is 'First time moved to lost stage (quote rejected before PO)';
comment on column public.projects.cancelled_at is 'First time moved to cancelled stage (job cancelled after acceptance)';

alter table public.projects
  drop constraint if exists projects_sales_command_stage_check;

-- Normalize empty/invalid stage placeholders before backfill.
update public.projects
set sales_command_stage = null
where trim(coalesce(sales_command_stage, '')) = '';

-- Backfill terminal states first so they win over legacy heuristics.
update public.projects
set
  sales_command_stage = 'cancelled',
  cancelled_at = coalesce(cancelled_at, updated_at, now())
where
  trim(upper(coalesce(customer_approval, ''))) = 'CANCELLED'
  or project_status = 'cancelled';

update public.projects
set
  sales_command_stage = 'lost',
  lost_at = coalesce(lost_at, updated_at, now())
where
  sales_command_stage is distinct from 'cancelled'
  and trim(upper(coalesce(customer_approval, ''))) = 'REJECTED';

-- Legacy fallback for rows with no stage populated yet.
update public.projects
set sales_command_stage = 'invoiced'
where sales_command_stage is null
  and coalesce(invoiced_amount, 0) > 0
  and (project_complete = true or project_status = 'done');

update public.projects
set sales_command_stage = 'complete'
where sales_command_stage is null
  and (project_complete = true or project_status = 'done');

update public.projects
set sales_command_stage = 'in_process'
where sales_command_stage is null
  and trim(upper(coalesce(customer_approval, ''))) = 'ACCEPTED';

update public.projects
set sales_command_stage = 'quote_sent'
where sales_command_stage is null
  and coalesce(total_quoted, 0) > 0
  and (
    trim(upper(coalesce(customer_approval, ''))) = 'PENDING'
    or customer_approval is null
    or trim(coalesce(customer_approval, '')) = ''
  );

update public.projects
set sales_command_stage = 'rfq_customer'
where sales_command_stage is null;

-- Stamp terminal timestamps for rows that already sit in a terminal stage.
update public.projects
set lost_at = coalesce(lost_at, updated_at, now())
where sales_command_stage = 'lost';

update public.projects
set cancelled_at = coalesce(cancelled_at, updated_at, now())
where sales_command_stage = 'cancelled';

alter table public.projects
  alter column sales_command_stage set default 'rfq_customer',
  alter column sales_command_stage set not null;

alter table public.projects
  add constraint projects_sales_command_stage_check check (
    sales_command_stage in (
      'rfq_customer',
      'rfq_vendors',
      'quote_sent',
      'po_issued',
      'in_process',
      'complete',
      'delivered',
      'invoiced',
      'lost',
      'cancelled'
    )
  );

comment on column public.projects.sales_command_stage is 'Canonical lifecycle stage: rfq_customer -> invoiced, or lost/cancelled terminal states';

create or replace function public.stamp_project_stage_transition()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') or (new.sales_command_stage is distinct from old.sales_command_stage) then
    case new.sales_command_stage
      when 'rfq_customer' then new.rfq_received_at := coalesce(new.rfq_received_at, new.created_at, now());
      when 'rfq_vendors' then new.rfq_vendors_sent_at := coalesce(new.rfq_vendors_sent_at, now());
      when 'quote_sent' then new.quote_sent_at := coalesce(new.quote_sent_at, now());
      when 'po_issued' then new.po_issued_at := coalesce(new.po_issued_at, now());
      when 'in_process' then new.in_process_at := coalesce(new.in_process_at, now());
      when 'complete' then new.completed_at := coalesce(new.completed_at, now());
      when 'delivered' then new.delivered_at := coalesce(new.delivered_at, now());
      when 'invoiced' then new.invoiced_at := coalesce(new.invoiced_at, now());
      when 'lost' then new.lost_at := coalesce(new.lost_at, now());
      when 'cancelled' then new.cancelled_at := coalesce(new.cancelled_at, now());
      else null;
    end case;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_projects_stamp_stage_transition on public.projects;

create trigger trg_projects_stamp_stage_transition
before insert or update of sales_command_stage on public.projects
for each row
execute function public.stamp_project_stage_transition();

-- Keep role-filtered projection aligned with dropped lifecycle columns.
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
    when public.current_app_role() in ('admin', 'manager', 'sales')
      then p.total_quoted
    else null
  end as total_quoted,
  case
    when public.current_app_role() in ('admin', 'manager', 'sales')
      then p.invoiced_amount
    else null
  end as invoiced_amount,
  case
    when public.current_app_role() in ('admin', 'manager', 'sales')
      then p.material_cost
    else null
  end as material_cost,
  case
    when public.current_app_role() in ('admin', 'manager', 'sales')
      then p.labor_cost
    else null
  end as labor_cost
from public.projects p;

revoke all on public.projects_role_filtered from public;
revoke all on public.projects_role_filtered from anon;
grant select on public.projects_role_filtered to authenticated, service_role;

alter table public.projects
  drop column if exists status,
  drop column if exists project_status,
  drop column if exists project_complete,
  drop column if exists customer_approval;

commit;
