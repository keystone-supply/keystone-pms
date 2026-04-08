-- Follow-up hardening for environments where transition-removal migration already ran.
-- Ensure anon has no residual privileges on the role-filtered project view.

REVOKE ALL ON TABLE public.projects_role_filtered FROM anon;
GRANT SELECT ON public.projects_role_filtered TO authenticated, service_role;
