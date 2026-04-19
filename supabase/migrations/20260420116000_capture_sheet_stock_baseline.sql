-- Baseline capture for legacy public.sheet_stock table that was created outside migrations.

create table if not exists public.sheet_stock (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  length_in numeric not null,
  width_in numeric not null,
  thickness_in numeric not null,
  material text not null,
  kind text not null default 'sheet' check (kind in ('sheet', 'remnant')),
  status text not null default 'available' check (status in ('available', 'allocated', 'consumed', 'scrap')),
  label text,
  notes text,
  est_weight_lbs numeric,
  source text,
  is_archived boolean default false,
  svg_path text,
  img_url text
);

create index if not exists sheet_stock_kind_idx
  on public.sheet_stock(kind);

create index if not exists sheet_stock_material_thickness_idx
  on public.sheet_stock(material, thickness_in);

create index if not exists sheet_stock_status_idx
  on public.sheet_stock(status);

create or replace function public.sheet_stock_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sheet_stock_set_updated_at on public.sheet_stock;
create trigger sheet_stock_set_updated_at
before update on public.sheet_stock
for each row
execute function public.sheet_stock_set_updated_at();
