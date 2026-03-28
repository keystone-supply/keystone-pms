-- Labor estimate and actuals breakdown (hours × rates) for project financials UI.
alter table public.projects
  add column if not exists labor_hours_quoted numeric,
  add column if not exists labor_cost_per_hr numeric,
  add column if not exists labor_sell_per_hr numeric,
  add column if not exists labor_hours_actual numeric,
  add column if not exists labor_cost_per_hr_actual numeric;

comment on column public.projects.labor_hours_quoted is
  'Estimated labor hours (quote).';
comment on column public.projects.labor_cost_per_hr is
  'Internal cost $/hr for quoted labor.';
comment on column public.projects.labor_sell_per_hr is
  'Billable $/hr for quoted labor (customer line).';
comment on column public.projects.labor_hours_actual is
  'Actual labor hours (actuals).';
comment on column public.projects.labor_cost_per_hr_actual is
  'Internal cost $/hr for actual labor (with labor_hours_actual drives labor_cost).';
