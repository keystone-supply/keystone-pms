# RBAC Staging Checklist

Use this checklist before promoting RBAC changes to production.

## Preconditions

- Migrations applied through `20260410130000_align_full_app_rbac_matrix.sql`.
- At least one active test user exists for each role:
  - `admin`, `manager`, `sales`, `engineering`, `fabrication`, `viewer`.
- App is running with NextAuth + Supabase bridge enabled.

## Automated checks

Run from repo root:

- `npm run test:rbac-roles`
- `npm run test:rbac-sql`
- `npm run test:rbac-api-guards` (requires app server up; defaults to `http://127.0.0.1:3000`)

Expected:
- All commands exit `0`.
- `test:rbac-sql` prints all `PASS`.
- `test:rbac-api-guards` returns unauthorized statuses for unauthenticated calls.

## Per-role manual smoke checks

### Admin
- Can open all pages.
- Can create/edit projects, documents, customers, vendors.
- Can run/stop nest and manage sheet stock.
- Can read/write finance journal entries/lines.
- Can open Shop TV.

### Manager
- Same as admin except user-management workflows as defined by policy.
- Confirm project delete and finance write operations succeed.

### Sales
- Can open Sales hub and CRM pages.
- Can create/edit projects and documents.
- Can view financial panels and KPI cards.
- Cannot run nesting APIs/pages.
- Finance journal read works; write attempts fail with permission error.

### Engineering
- Cannot open Sales hub pages.
- Can open Projects list/detail in read-only mode.
- Financial panels are hidden on project detail and dashboard.
- Can use Nest/remnants and associated APIs.

### Fabrication
- Same expectations as engineering.
- Can view/use sheet stock interactions in Nest/remnants.

### Viewer
- Can open dashboard and projects (read-only where data is available).
- Cannot open Sales hub or Nest/remnants.
- Cannot open Shop TV.
- Financial panels/cards are hidden.

## Security checks

- Unauthenticated calls return 401 for:
  - `GET /api/auth/supabase-token`
  - `GET /api/tv/summary`
  - `POST /api/nest`
  - `GET /api/nest/progress`
  - `POST /api/nest/stop`
- No anon grants on:
  - `projects`
  - `project_documents`
  - `customers`
  - `customer_shipping_addresses`
  - `vendors`
  - `projects_role_filtered`

## Sign-off

- [ ] Engineering sign-off (technical)
- [ ] Ops/shop sign-off (workflow)
- [ ] Sales sign-off (CRM + quoting)
- [ ] Finance sign-off (journal access behavior)
