-- Baseline capture for legacy public.projects table that predates migration history.
-- Keep legacy columns in place to mirror live shape for greenfield rebuilds.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  project_number text not null,
  customer text not null,
  project_name text not null,
  customer_po text,
  customer_approval text check (
    customer_approval is null
    or trim(customer_approval) = ''
    or customer_approval in ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED')
  ),
  supply_industrial text,
  project_complete boolean default false,
  payment_received boolean default false,
  material_cost numeric default 0,
  labor_cost numeric default 0,
  engineering_cost numeric default 0,
  equipment_cost numeric default 0,
  logistics_cost numeric default 0,
  additional_costs numeric default 0,
  invoiced_amount numeric default 0,
  -- Legacy columns retained for compatibility/data preservation.
  pl_margin numeric,
  hours_quoted numeric,
  actual_hours numeric,
  hours_difference numeric,
  materials_quoted numeric,
  labor_quoted numeric,
  engineering_quoted numeric,
  equipment_quoted numeric,
  logistics_quoted numeric,
  taxes_quoted numeric,
  total_quoted numeric,
  estimated_margin numeric,
  estimated_pl numeric,
  notes text,
  status text default 'ACTIVE',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  project_status text check (project_status in ('in_process', 'done', 'cancelled')),
  customer_id uuid references public.customers(id),
  sales_command_stage text default 'rfq_customer' check (
    sales_command_stage in (
      'rfq_customer',
      'rfq_vendors',
      'quote_sent',
      'po_issued',
      'in_process',
      'complete',
      'delivered',
      'invoiced',
      'lost'
    )
  ),
  rfq_vendors_sent_at timestamptz,
  quote_sent_at timestamptz,
  po_issued_at timestamptz,
  in_process_at timestamptz,
  completed_at timestamptz,
  delivered_at timestamptz,
  invoiced_at timestamptz,
  materials_ordered_at timestamptz,
  material_received_at timestamptz,
  labor_completed_at timestamptz,
  materials_vendor_cost numeric,
  material_markup_pct numeric,
  labor_hours_quoted numeric,
  labor_cost_per_hr numeric,
  labor_sell_per_hr numeric,
  labor_hours_actual numeric,
  labor_cost_per_hr_actual numeric,
  engineering_markup_pct numeric,
  equipment_markup_pct numeric,
  logistics_markup_pct numeric,
  files_phase1_enabled boolean not null default true,
  rfq_received_at timestamptz,
  ready_to_ship_at timestamptz
);

create unique index if not exists projects_project_number_key
  on public.projects(project_number);

create unique index if not exists projects_project_number_unique
  on public.projects(project_number);

create index if not exists idx_projects_customer_id
  on public.projects(customer_id)
  where customer_id is not null;

create index if not exists idx_projects_sales_command_stage
  on public.projects(sales_command_stage);
