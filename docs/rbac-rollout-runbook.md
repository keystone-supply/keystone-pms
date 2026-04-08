# RBAC Rollout Runbook

This runbook executes the staged rollout for full-app RBAC.

## Phase A: App guard rollout (no strict DB cutover yet)

1. Deploy app code that includes:
   - Central role capabilities in `lib/auth/roles.ts`.
   - UI route/action guards on Sales, Nest, Shop TV, project editing.
   - API role guards on TV and Nest routes.
2. Run:
   - `npm run test:rbac-roles`
   - `npm run test:rbac-api-guards`
3. Validate role behavior using `docs/rbac-staging-checklist.md`.

Gate to continue:
- All role-specific pages/actions behave as expected.
- No unexpected 403/401 reports from authorized users.

## Phase B: Strict DB policy cutover

1. Apply migration:
   - `supabase/migrations/20260410130000_align_full_app_rbac_matrix.sql`
2. Run SQL policy audit:
   - `npm run test:rbac-sql`
3. Re-run full staging checklist.

Gate to continue:
- SQL audit returns all pass.
- Per-role business flows succeed/fail exactly as matrix defines.

## Production promotion

1. Promote same app build that passed staging.
2. Apply same migration sequence in production.
3. Run post-deploy smoke checks for:
   - `admin`, `sales`, `engineering`, `viewer`.
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
