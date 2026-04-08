-- Final core cutover: remove transitional anon compatibility policies.
-- Requires authenticated browser Supabase session bridge to be live first.

-- Drop transitional anon policies introduced for migration safety.
DROP POLICY IF EXISTS "projects_anon_transition_all" ON public.projects;
DROP POLICY IF EXISTS "project_documents_anon_transition_all" ON public.project_documents;
DROP POLICY IF EXISTS "customers_anon_transition_all" ON public.customers;
DROP POLICY IF EXISTS "customer_shipping_anon_transition_all" ON public.customer_shipping_addresses;
DROP POLICY IF EXISTS "vendors_anon_transition_all" ON public.vendors;

-- Also drop legacy broad anon policies where they may still exist.
DROP POLICY IF EXISTS "project_documents_all_anon" ON public.project_documents;
DROP POLICY IF EXISTS "customers_all_anon" ON public.customers;
DROP POLICY IF EXISTS "customer_shipping_all_anon" ON public.customer_shipping_addresses;
DROP POLICY IF EXISTS "vendors_all_anon" ON public.vendors;

-- Prevent anon role access to core operational tables.
REVOKE ALL ON TABLE public.projects FROM anon;
REVOKE ALL ON TABLE public.project_documents FROM anon;
REVOKE ALL ON TABLE public.customers FROM anon;
REVOKE ALL ON TABLE public.customer_shipping_addresses FROM anon;
REVOKE ALL ON TABLE public.vendors FROM anon;

-- Remove anon read access from role-filtered project view.
REVOKE ALL ON TABLE public.projects_role_filtered FROM anon;
GRANT SELECT ON public.projects_role_filtered TO authenticated, service_role;
