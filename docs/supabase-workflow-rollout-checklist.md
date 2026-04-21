# Supabase Workflow Rollout Checklist

## Why This Changed

- Prevent recurring migration drift from mixed mutation paths.
- Keep local, CI, and linked remote behavior deterministic.
- Block accidental empty/suspicious migration stubs before merge.

## Team Rules (Effective Immediately)

1. Use file-first Supabase CLI migrations for schema changes.
2. Do not use MCP `apply_migration` as routine workflow.
3. Do not rely on dashboard-only schema changes without immediate canonical migration capture.
4. Require verification commands before closing schema work.

## Required Commands Per Schema Change

1. `npm run supabase:migration:new -- <name>`
2. edit one migration SQL file under `supabase/migrations/`
3. `npm run db:push`
4. `npm run supabase:migration:list:linked`
5. `npm run security:db-schema-guard`
6. `npm run test:rbac-api-guards`
7. `npm run test:rbac-sql`
8. `npm run build`

## Drift Recovery Sequence

1. Map remote-only versions to canonical local migration files.
2. Revert superseded remote-only versions:
   - `./node_modules/.bin/supabase --agent no migration repair --linked --status reverted <versions...> --yes --workdir .`
3. Mark canonical replacements applied when schema already matches:
   - `./node_modules/.bin/supabase --agent no migration repair --linked --status applied <versions...> --yes --workdir .`
4. Re-run:
   - `npm run db:push`
   - `npm run supabase:migration:list:linked`

## Empty-Stub Incident Response

1. Stop before `db push`.
2. Remove unintended local stubs.
3. If pushed already, repair accidental versions to `reverted`.
4. Keep one canonical migration file and re-verify migration alignment.
