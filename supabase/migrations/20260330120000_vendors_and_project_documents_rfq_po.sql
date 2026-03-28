-- Vendors master for RFQ / purchase orders; extend project_documents kinds + optional vendor link.

CREATE TABLE IF NOT EXISTS public.vendors (
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
  payment_terms text,
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'inactive')
  ),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendors_legal_name ON public.vendors (legal_name);

CREATE INDEX IF NOT EXISTS idx_vendors_status ON public.vendors (status);

CREATE OR REPLACE FUNCTION public.set_vendors_updated_at ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendors_updated_at ON public.vendors;

CREATE TRIGGER trg_vendors_updated_at
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_vendors_updated_at ();

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO anon, authenticated;

GRANT ALL ON public.vendors TO service_role;

DROP POLICY IF EXISTS "vendors_all_anon" ON public.vendors;

DROP POLICY IF EXISTS "vendors_all_authenticated" ON public.vendors;

CREATE POLICY "vendors_all_anon" ON public.vendors FOR ALL TO anon USING (true)
WITH
  CHECK (true);

CREATE POLICY "vendors_all_authenticated" ON public.vendors FOR ALL TO authenticated USING (true)
WITH
  CHECK (true);

COMMENT ON TABLE public.vendors IS 'Vendor / AP master for RFQs and purchase orders';

ALTER TABLE public.project_documents
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_documents_vendor_id ON public.project_documents (vendor_id)
WHERE
  vendor_id IS NOT NULL;

ALTER TABLE public.project_documents DROP CONSTRAINT IF EXISTS project_documents_kind_check;

ALTER TABLE public.project_documents ADD CONSTRAINT project_documents_kind_check CHECK (
  kind IN (
    'quote',
    'invoice',
    'bol',
    'packing_list',
    'rfq',
    'purchase_order'
  )
);

COMMENT ON COLUMN public.project_documents.vendor_id IS 'Vendor for RFQ / purchase_order rows';
