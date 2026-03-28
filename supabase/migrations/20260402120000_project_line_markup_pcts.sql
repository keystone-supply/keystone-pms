-- Per-line quote markup % for engineering, equipment, logistics (materials uses material_markup_pct).
alter table public.projects
  add column if not exists engineering_markup_pct numeric,
  add column if not exists equipment_markup_pct numeric,
  add column if not exists logistics_markup_pct numeric;

comment on column public.projects.engineering_markup_pct is
  'Internal markup on engineering customer line (percent); UI default 30 when null.';
comment on column public.projects.equipment_markup_pct is
  'Internal markup on equipment customer line (percent); UI default 30 when null.';
comment on column public.projects.logistics_markup_pct is
  'Internal markup on logistics customer line (percent); UI default 30 when null.';

-- Preserve prior behavior where one material_markup_pct applied to all non-labor markable lines.
update public.projects
set
  engineering_markup_pct = material_markup_pct,
  equipment_markup_pct = material_markup_pct,
  logistics_markup_pct = material_markup_pct
where material_markup_pct is not null
  and (
    engineering_markup_pct is null
    or equipment_markup_pct is null
    or logistics_markup_pct is null
  );
