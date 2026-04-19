# Inventory Export (2026-04-19)

Run `export_inventory.sql` against the Supabase project before and after drift remediation migrations.

This captures:
- RLS policies for `projects`, `sheet_stock`, and finance tables
- `projects_role_filtered` definition/options
- Relevant helper functions (`rbac_policy_audit`, `rls_auto_enable`, `sheet_stock_set_updated_at`)
- Bucket + storage policy posture for `sheet-previews` and `project-files`
- Column/index metadata for legacy baseline tables (`projects`, `sheet_stock`)
