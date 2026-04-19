# Agent Operating Rules (Keystone-PMS)

## Supabase Schema Change Rules

1. **Use file-first migrations only**
   - Create exactly one migration file per schema intent under `supabase/migrations/`.
   - Edit SQL in that file before applying.
2. **Apply via Supabase CLI**
   - Required flow:
     1. `supabase migration new <name>`
     2. edit file
     3. `supabase db push --linked --include-all --yes`
     4. `supabase migration list --linked`
3. **Do not use MCP `apply_migration` for routine schema changes**
   - MCP tools are for inspection, diagnostics, and read-only verification by default.
   - Emergency drift repair is allowed only with documented follow-up and canonical migration history.
4. **No dashboard-only schema changes**
   - If a dashboard/manual SQL change is unavoidable, capture it immediately as a canonical migration and repair history to match.
5. **Required verification before completion claims**
   - `npm run security:db-schema-guard`
   - `npm run test:rbac-api-guards`
   - `npm run test:rbac-sql`
   - `npm run build`
   - `npx supabase migration list --linked`

## Drift Repair Rules

When local and remote history diverge:

1. Map remote-only versions to canonical local files.
2. Mark superseded remote-only versions as reverted:
   - `supabase migration repair --linked --status reverted <versions...> --yes`
3. Mark canonical replacements as applied when schema already matches:
   - `supabase migration repair --linked --status applied <versions...> --yes`
4. Re-run:
   - `supabase db push --linked --include-all --yes`
   - `supabase migration list --linked`
