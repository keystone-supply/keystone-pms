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

- If `npm run db:push` reports migration history mismatch, apply migrations via
  MCP `apply_migration`, then reconcile with CLI (`supabase migration repair`
  + `supabase db pull`) as a follow-up.
- Keep using `service_role` for backend-only tasks (OneDrive/PDF server flows),
  never in browser.
- `SUPABASE_SERVICE_ROLE_KEY` is the canonical env var name. Legacy
  `SUPABASE_SERVICE_ROLE` is tolerated in some scripts for compatibility.

Last updated: 2026-04-08
