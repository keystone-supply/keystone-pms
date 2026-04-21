# RBAC Rollout Runbook

This runbook executes staged rollout for capability-based authorization across app guards and Supabase RLS.

## Phase A: App guard rollout (no strict DB cutover yet)

1. Deploy app code that includes:
   - Capability definitions and helpers in `lib/auth/roles.ts`.
   - UI route/action guards for Sales, Nest, Shop TV, project editing, and admin access.
   - API capability guards on TV, Nest, and admin routes.
2. Run:
   - `npm run test:rbac-roles`
   - `npm run test:rbac-api-guards`
3. Validate role behavior using `docs/rbac-staging-checklist.md`.

Gate to continue:
- Capability-specific pages/actions behave as expected.
- No unexpected 403/401 reports from users with required capabilities.

## Phase B: Strict DB policy cutover

1. Apply migrations for capability/RLS cutover:
   - `supabase/migrations/20260423000000_add_app_capabilities_system.sql`
   - `supabase/migrations/20260423001000_rewrite_projects_role_filtered_view.sql`
   - `supabase/migrations/20260423002000_rewrite_rls_to_capabilities.sql`
   - `supabase/migrations/20260423003000_drop_role_column_and_enum.sql`
2. Run SQL policy audit:
   - `npm run test:rbac-sql`
3. Re-run full staging checklist.

Gate to continue:
- SQL audit returns all pass.
- Business flows succeed/fail according to the capability matrix in `docs/rbac-role-matrix.md`.

## Production promotion

1. Promote same app build that passed staging.
2. Apply same migration sequence in production.
3. Run post-deploy smoke checks for:
   - representative users covering `manage_users`, `manage_documents`, `access_sales`, `run_nesting`, `view_shop_tv`, and read-only access.
4. Monitor auth/authorization errors for 24h.

## Rollback

If blocking authorization regressions are found:

1. Roll back app deployment to previous stable build.
2. Revert policy migration with targeted SQL:
   - Restore prior finance policies/grants.
   - Restore prior sheet stock policies if needed.
3. Re-run minimal smoke checks:
   - Dashboard, projects, sales, nest.
4. Open incident and capture failing role/path + expected matrix behavior.
