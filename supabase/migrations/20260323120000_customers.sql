-- Customer accounts + shipping addresses; optional link from projects.
--
-- Access: Browser uses Supabase anon key (see lib/supabaseClient.ts). Policies allow
-- anon + authenticated full CRUD so behavior matches typical internal `projects` access.
-- Tighten later with Supabase Auth JWT or role-based policies if needed.
--
-- Apply: npx supabase db push

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  legal_name text NOT NULL,
  account_code text UNIQUE,
  contact_name text,
  contact_email text,
  contact_phone text,
  billing_line1 text,
  billing_line2 text,
  billing_city text,
  billing_state text,
  billing_postal_code text,
  billing_country text,
  ap_contact_name text,
  ap_contact_phone text,
  ap_contact_email text,
  payment_terms text,
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'inactive', 'prospect')
  ),
  notes text,
  follow_up_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_legal_name ON public.customers (legal_name);

CREATE INDEX IF NOT EXISTS idx_customers_status ON public.customers (status);

CREATE INDEX IF NOT EXISTS idx_customers_follow_up_at ON public.customers (follow_up_at)
WHERE
  follow_up_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.customer_shipping_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  label text,
  line1 text,
  line2 text,
  city text,
  state text,
  postal_code text,
  country text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_shipping_customer_id ON public.customer_shipping_addresses (customer_id);

CREATE UNIQUE INDEX IF NOT EXISTS customer_shipping_one_default_per_customer ON public.customer_shipping_addresses (customer_id)
WHERE
  is_default = true;

CREATE OR REPLACE FUNCTION public.set_customers_updated_at ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_updated_at ON public.customers;

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_customers_updated_at ();

DROP TRIGGER IF EXISTS trg_customer_shipping_updated_at ON public.customer_shipping_addresses;

CREATE TRIGGER trg_customer_shipping_updated_at
  BEFORE UPDATE ON public.customer_shipping_addresses
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_customers_updated_at ();

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_customer_id ON public.projects (customer_id)
WHERE
  customer_id IS NOT NULL;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customer_shipping_addresses ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_shipping_addresses TO anon, authenticated;

GRANT ALL ON public.customers TO service_role;

GRANT ALL ON public.customer_shipping_addresses TO service_role;

DROP POLICY IF EXISTS "customers_all_anon" ON public.customers;

DROP POLICY IF EXISTS "customers_all_authenticated" ON public.customers;

CREATE POLICY "customers_all_anon" ON public.customers FOR ALL TO anon USING (true)
WITH
  CHECK (true);

CREATE POLICY "customers_all_authenticated" ON public.customers FOR ALL TO authenticated USING (true)
WITH
  CHECK (true);

DROP POLICY IF EXISTS "customer_shipping_all_anon" ON public.customer_shipping_addresses;

DROP POLICY IF EXISTS "customer_shipping_all_authenticated" ON public.customer_shipping_addresses;

CREATE POLICY "customer_shipping_all_anon" ON public.customer_shipping_addresses FOR ALL TO anon USING (true)
WITH
  CHECK (true);

CREATE POLICY "customer_shipping_all_authenticated" ON public.customer_shipping_addresses FOR ALL TO authenticated USING (true)
WITH
  CHECK (true);

COMMENT ON TABLE public.customers IS 'Sales / AR master: legal entity, contacts, billing, AP, payment terms';

COMMENT ON TABLE public.customer_shipping_addresses IS 'Ship-to locations per customer; at most one is_default per customer';

COMMENT ON COLUMN public.projects.customer_id IS 'Optional FK to customers; free-text customer remains for legacy rows';
