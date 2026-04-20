# Supabase Schema and Access Control (Keystone-PMS)

This folder contains database migrations and policy notes for Keystone-PMS.

## Authentication Model (Hybrid)

The app now supports two login paths:

- **Azure AD** via NextAuth `azure-ad` provider.
- **Non-Microsoft users** via NextAuth `credentials` provider (email/password).

Role data is stored in Supabase (`public.app_users`) and copied into NextAuth
session/JWT at login.

Browser database access now uses a short-lived JWT bridge:

- NextAuth session remains the source of truth.
- `/api/auth/supabase-token` issues short-lived Supabase-compatible JWTs.
- `components/providers/supabase-bridge-provider.tsx` refreshes bridge tokens and
  feeds them into `lib/supabaseClient.ts`.
- Bridge token signing supports two paths:
  - App runtime signing via `SUPABASE_JWT_SECRET`, or
  - DB-signed fallback via `public.issue_supabase_bridge_token(...)` using
    service role + DB `app.settings.jwt_secret`.

## Role Matrix

Roles are defined in app code (`lib/auth/roles.ts`) and DB
(`public.app_role` enum):

- `admin`: full access
- `manager`: broad operational access
- `sales`: commercial + financial visibility
- `engineering`: project-limited access
- `fabrication`: shop-focused access
- `viewer`: read-only subset in app

App-level restrictions are enforced in UI:

- Dashboard role zones use role-aware rendering
  (`components/dashboard/role-zones.tsx`).
- Project document create/edit/export actions are blocked for `viewer`.

## New Migration

Migration: `20260410000000_add_user_roles_and_rls.sql`

Adds:

- `public.app_users`
- `public.app_user_project_access`
- `public.authenticate_app_user(p_email, p_password)` for credentials auth
- `public.upsert_credentials_app_user(...)` admin helper for user bootstrap
- `public.current_app_role()` and `public.current_app_user_id()` helpers
- Role-aware policies for authenticated Supabase JWT access
- Transitional anon compatibility policies so existing browser anon-key flows
  keep working while migration to authenticated Supabase sessions is completed
- `public.projects_role_filtered` view for role-based column masking

Migration: `20260410020000_remove_transitional_anon_core_policies.sql`

- Removes transitional anon policies from:
  - `projects`
  - `project_documents`
  - `customers`
  - `customer_shipping_addresses`
  - `vendors`
- Revokes anon grants on those core operational tables
- Removes anon access from `projects_role_filtered`

Migration: `20260410021000_revoke_anon_view_privileges.sql`

- Follow-up hardening to ensure anon has no residual privileges on
  `projects_role_filtered`

Migration: `20260410022000_add_db_signed_bridge_token_function.sql`

- Adds `public.issue_supabase_bridge_token(...)` (service_role only)
- Enables DB-signed bridge token fallback for environments without
  `SUPABASE_JWT_SECRET` in app runtime env

Migration: `20260421000000_single_source_lifecycle.sql`

- Makes `projects.sales_command_stage` the single lifecycle source of truth.
- Adds terminal-stage timestamps: `lost_at` and `cancelled_at`.
- Rebuilds `public.projects_role_filtered` to align with lifecycle field removal.
- Drops legacy lifecycle columns now superseded by `sales_command_stage`:
  - `status`
  - `project_status`
  - `project_complete`
  - `customer_approval`

## Strict Production Target

Final target is now the default deployment path:

1. Browser data access uses authenticated Supabase bridge sessions.
2. Transitional anon policies are removed for core operational tables.
3. Only role-aware authenticated policies gate core table access.

## Bootstrap a Credentials User

Use SQL editor (service role context):

```sql
select public.upsert_credentials_app_user(
  'shop.user@example.com',
  'ChangeMeNow!',
  'Shop User',
  'fabrication'
);
```

Then sign in from app with email/password (NextAuth credentials provider).

## Verification Checklist

1. **Auth**
   - Azure login still works.
   - Credentials login works for seeded credentials user.
   - Session includes role and provider.
   - `/api/auth/supabase-token` returns `401` when not logged in.
   - `/api/auth/supabase-token` returns `200` with `accessToken` + `expiresAt` when logged in.
   - `accessToken` includes `email` claim used by `current_app_role()` / `current_app_user_id()`.
2. **Project documents usability**
   - View existing docs.
   - Create draft.
   - Edit and export.
3. **Role restrictions**
   - `viewer` cannot create/edit/export docs.
   - Finance sections hidden for non-finance roles.
4. **Core app flows**
   - Dashboard/projects load.
   - Nest remnants still works.
   - Sales/customer/vendor pages still load.
5. **Security checks**
   - No sensitive token logging in auth route.
   - No sensitive token logging in bridge route.
   - Trigger functions use fixed `search_path` where required.
6. **Core DB strictness checks**
   - `pg_policies` has no `*_anon_transition_*` policy names for core tables.
   - `information_schema.role_table_grants` shows no anon grants on:
     - `projects`
     - `project_documents`
     - `customers`
     - `customer_shipping_addresses`
     - `vendors`
     - `projects_role_filtered`

## RBAC Verification Scripts

From repo root, run:

- `npm run test:rbac-roles` - validates role capability helpers.
- `npm run test:rbac-sql` - executes `public.rbac_policy_audit()` via service role.
- `npm run test:rbac-api-guards` - asserts unauthenticated API access is denied.

Detailed staging execution checklist:

- `docs/rbac-staging-checklist.md`

Rollout sequence and rollback plan:

- `docs/rbac-rollout-runbook.md`

## Rollout Runbook (Staging -> Production)

1. Deploy app code with bridge session route/provider/client changes.
2. Sign in as each role (`admin`, `manager`, `sales`, `engineering`,
   `fabrication`, `viewer`) and run the verification checklist above.
3. Apply core hardening migrations:
   - `20260410020000_remove_transitional_anon_core_policies.sql`
   - `20260410021000_revoke_anon_view_privileges.sql`
4. Re-run role and flow validation after migration.
5. Promote same build + migration sequence to production during low-risk window.

## Rollback Runbook

If strict cutover causes blocking issues:

1. Roll app back to previous deployment.
2. Recreate transitional anon policies for core tables.
3. Re-grant anon table/view privileges needed for emergency continuity.
4. Re-run smoke checks on projects/documents/sales pages.

## Notes

- If `npm run db:push` reports migration history mismatch, do **not** apply ad hoc
  dashboard SQL and do **not** leave drift unresolved. Use the repair sequence
  below to restore a deterministic tree.
- Keep using `service_role` for backend-only tasks (OneDrive/PDF server flows),
  never in browser.
- `SUPABASE_SERVICE_ROLE_KEY` is the canonical env var name. Legacy
  `SUPABASE_SERVICE_ROLE` is tolerated in some scripts for compatibility.

## Migration Operating Procedure (Required)

**Authority:** `AGENTS.md` and this section are the canonical Supabase workflow policy.

1. **Create migration files in repo first**
   - Add migration SQL under `supabase/migrations`.
   - Never rely on dashboard-only changes without capturing SQL in repo.
   - Create one migration file per schema intent.
2. **Apply and verify**
   - Run `npx supabase db push --linked --include-all --yes`.
   - Run `npx supabase migration list --linked` and confirm local/remote alignment.
3. **MCP boundaries**
   - Use MCP for inspection/diagnostics (list/read/advisors/logs) by default.
   - Do not use MCP `apply_migration` for routine schema mutations.
   - If emergency/manual mutation is unavoidable, immediately capture canonical file(s)
     and run migration repair to restore deterministic history.
4. **If drift exists (MCP/manual apply mismatch)**
   - Map remote-only versions to canonical local migration files.
   - Use `npx supabase migration repair --linked --status reverted <remote_version...> --yes`
     for superseded remote-only versions.
   - Use `npx supabase migration repair --linked --status applied <local_version...> --yes`
     for canonical replacements that already exist in schema.
   - Re-run `npx supabase db push --linked --include-all --yes`.
   - Re-run `npx supabase migration list --linked` until fully deterministic.
5. **Security and guard checks before merge**
   - `npm run test:rbac-api-guards`
   - `npm run test:rbac-sql`
   - `npm run security:db-schema-guard`
   - CI guard workflows must remain enabled:
     - `.github/workflows/db-schema-guard.yml`
     - `.github/workflows/live-db-extension-guard.yml`

## Accidental Empty-Stub Incident Runbook

If `supabase migration new` hangs, is interrupted, or creates duplicate timestamped stubs:

1. **Treat as partial failure immediately**
   - Do not run `db push` yet.
2. **Inspect newly created migration files**
   - Ensure there is exactly one new migration file for the intended change.
   - Remove unintended local stubs before any apply.
3. **If accidental stubs were already pushed**
   - Mark accidental versions reverted:
     - `npx supabase migration repair --linked --status reverted <accidental_versions...> --yes`
   - Re-run:
     - `npx supabase migration list --linked`
4. **Restore canonical state**
   - Keep a single canonical migration file for the intended change.
   - Run `npx supabase db push --linked --include-all --yes`.
   - Re-run `npx supabase migration list --linked` and confirm deterministic alignment.

Safe-creation protocol:
- create one migration file per intent
- verify expected new filename before editing
- never push with empty unintended stub files present

Last updated: 2026-04-20
