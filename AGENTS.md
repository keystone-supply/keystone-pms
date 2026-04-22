# Agent Operating Rules (Keystone-PMS)

## Supabase Schema Change Rules

1. **Use file-first migrations only**
   - Create exactly one migration file per schema intent under `supabase/migrations/`.
   - Edit SQL in that file before applying.
2. **Apply via Supabase CLI**
   - Required flow:
     1. `npm run supabase:migration:new -- <name>`
     2. edit file
     3. `npm run db:push`
     4. `npm run supabase:migration:list:linked`
   - For non-interactive agent/shell sessions, do **not** call raw `supabase migration new`
     directly. Use the wrapper script above so stdin closes deterministically.
3. **Do not use MCP `apply_migration` for routine schema changes**
   - MCP tools are for inspection, diagnostics, and read-only verification by default.
   - Emergency drift repair is allowed only with documented follow-up and canonical migration history.
4. **No dashboard-only schema changes**
   - If a dashboard/manual SQL change is unavoidable, capture it immediately as a canonical migration and repair history to match.
5. **Required verification before completion claims**
   - `npm run security:db-schema-guard`
   - `npm run test:rbac-api-guards`
   - `npm run test:rbac-sql` (must load `.env.local`; use npm script, not raw node/tsx)
   - `npm run build`
   - `npm run supabase:migration:list:linked`
   - Ensure trigger functions set an explicit `search_path` (for example: `set search_path = public, pg_temp`)

## Drift Repair Rules

When local and remote history diverge:

1. Map remote-only versions to canonical local files.
2. Mark superseded remote-only versions as reverted:
   - `supabase migration repair --linked --status reverted <versions...> --yes`
3. Mark canonical replacements as applied when schema already matches:
   - `supabase migration repair --linked --status applied <versions...> --yes`
4. Re-run:
   - `npm run db:push`
   - `npm run supabase:migration:list:linked`

## Git Branching Rules

When performing git operations:

1. Do not create a new local or remote branch unless the user explicitly asks.
2. If the user says "commit and push", push only to the current tracked branch.
3. If the current branch has no upstream, stop and ask which existing branch to push to.
4. Do not use `git push -u` to create tracking for a new branch unless explicitly requested.
