# Migration State Inventory (Pre-Wipe Hardening)

Captured: 2026-04-19
Project: `swncjyakfnlifdwsvhfo` (`keystone-pms`)

## Drift Mapping (Remote -> Canonical Local)

- `20260419165711_close_security_drift_hotfix` -> `20260420113000_close_security_drift.sql`
- `20260419165958_create_rbac_policy_audit` -> `20260420114000_create_rbac_policy_audit.sql`
- `20260419170033_move_extensions_out_of_public` -> `20260420117000_move_extensions_out_of_public.sql`

## Placeholder Policy

The following migrations are intentionally retained as historical no-ops and remain in
history to avoid branch/environment divergence:

- `20260419023224_project_files_default_enabled.sql`
- `20260419023351_project_files_default_enabled.sql`
- `20260419023902_project_files_default_enabled.sql`
- `20260419024129_project_files_default_enabled.sql`

Each file now contains explicit no-op comments.

## Reconciliation Actions Applied

1. Reverted old remote-only drift versions with CLI repair:
   - `20260419165711`
   - `20260419165958`
   - `20260419170033`
2. Marked canonical replacements as applied:
   - `20260420113000`
   - `20260420114000`
   - `20260420117000`
3. Applied canonical baseline migrations still pending remotely:
   - `20260420115000_capture_projects_baseline.sql`
   - `20260420116000_capture_sheet_stock_baseline.sql`

## Current Verification Snapshot

- `npx supabase migration list --linked`: local and remote are fully aligned.
- New hardening migration applied: `20260420118000_project_files_enable_existing_rows.sql`.
- Security advisors: no findings.
- Performance advisors: warnings present (existing), including duplicate index on `projects`.
- `public.projects.files_phase1_enabled` default before hardening migration: `false`.
- Existing disabled rows before backfill: `735`.
- `public.projects.files_phase1_enabled` default after hardening migration: `true`.
- Existing disabled rows after backfill: `0`.
- `project-files` bucket present and private.
- Role-scoped `project-files` storage policies present for `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
