-- Optional vendor materials basis and markup % for quote material cost helper UI.
alter table public.projects
  add column if not exists materials_vendor_cost numeric,
  add column if not exists material_markup_pct numeric;

comment on column public.projects.materials_vendor_cost is
  'Raw vendor / materials spend estimate (before internal markup).';
comment on column public.projects.material_markup_pct is
  'Internal markup on materials (percent); UI default 30 when null.';
