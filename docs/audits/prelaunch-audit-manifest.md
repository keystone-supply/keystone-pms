# Keystone PMS Pre-Launch Audit Manifest

Last updated: 2026-04-20
Repo: `/Users/tysonrudd/keystone-pms`

## Audit Objective
Identify and resolve stale code, redundant logic/data, path/import issues, documentation drift, and avoidable bloat before go-live.

## Severity Rubric
- `critical`: Security/data integrity/release-blocking runtime failures; must fix before release.
- `high`: Significant correctness, maintainability, or operational risk likely to cause near-term incidents; fix before release unless explicitly waived.
- `medium`: Quality or maintainability gaps that are non-blocking but should be fixed if time allows.
- `low`: Cleanup opportunities and minor polish with limited release risk.

## Command Baseline
Source references:
- `package.json`
- `AGENTS.md`
- `.github/workflows/db-schema-guard.yml`
- `.github/workflows/dependency-guard.yml`
- `.github/workflows/live-db-extension-guard.yml`

Primary quality and release commands:
- `npm run lint`
- `npm run build`
- `npm run security:blocked-deps`
- `npm run security:db-schema-guard`
- `npm run test:rbac-api-guards`
- `npm run test:rbac-sql`
- `npx supabase migration list --linked`

Targeted domain test commands:
- `npm run test:project-financials`
- `npm run test:quote-financials-snapshot`
- `npm run test:project-document-totals`
- `npm run test:document-pdf`
- `npm run test:nest-dual-lane`
- `npm run test:nest-dxf-export`

## CI Coverage Snapshot
- Present: dependency guard (`security:blocked-deps`), db schema guard (`security:db-schema-guard`), live DB extension guard.
- Gap to monitor during audit: no broad PR workflow found for `lint`, `build`, or consolidated tests.

## Findings Log
| ID | Severity | Area | File/Scope | Finding | Recommended Action | Status |
| --- | --- | --- | --- | --- | --- | --- |
| RUNTIME-001 | medium | Runtime logging hygiene | `lib/onedrive.ts` | Verbose success/debug logging in upload and folder operations could leak noisy operational details in production logs. | Gate verbose logs behind explicit debug flag and avoid full response body logging. | fixed |
| RUNTIME-002 | low | Runtime logging hygiene | `app/api/nest/route.ts` | Success-path proxy log generated high-volume noise without actionable value. | Remove success-path log; keep warning/failure logs with timing context. | fixed |
| RUNTIME-003 | medium | Runtime maintainability hotspot | `app/nest-remnants/page.tsx` | Route module is very large and carries high regression risk for future changes. | Decompose by concern (data loading, orchestration, and UI sections) into smaller modules post-launch. | accepted-risk |
| RUNTIME-004 | low | Legacy compatibility path | `app/pipad-calc/page.tsx`, `components/dashboard/quick-links-bar.tsx`, `lib/pipadTapeStorage.ts` | Legacy calculator route and storage key are still referenced for backward compatibility. | Keep for now; document as compatibility alias and remove once migration window closes. | accepted-risk |
| DATA-001 | low | Migration history hygiene | `supabase/migrations/20260419023224_project_files_default_enabled.sql`, `supabase/migrations/20260419023351_project_files_default_enabled.sql`, `supabase/migrations/20260419023902_project_files_default_enabled.sql`, `supabase/migrations/20260419024129_project_files_default_enabled.sql` | Multiple timestamped migration placeholders exist for one intent. | Keep as explicit historical no-ops (already documented) to avoid migration history divergence. | accepted-risk |
| DATA-002 | low | Query snapshot staleness risk | `supabase/queries/inventory-20260419/*` | Inventory snapshot is date-stamped and could be mistaken for current operational truth later. | Keep for audit provenance but clearly label as historical snapshot in docs index. | accepted-risk |
| DATA-003 | medium | Admin RBAC API reliability | `app/api/admin/users/route.ts` | Metadata queries for capability/project counts did not return a 500 on query failure and could silently serve incomplete data. | Add explicit error handling for both metadata query results before returning response. | fixed |
| BIZ-001 | low | Deprecated financial API surface | `lib/projectFinancials.ts` | Deprecated `materialsQuotedFromBasis` export had no call sites and expanded public API surface needlessly. | Remove deprecated export and keep `customerLineFromBasis` as canonical helper. | fixed |
| BIZ-002 | medium | Quote/PDF data coupling | `components/projects/project-documents-section.tsx`, `lib/documents/buildProjectDocumentPdf.ts`, `lib/projectFinancials.ts` | Quote PDF totals mix document meta overrides with computed financial lines, which can drift from dashboard quote totals if metadata is stale. | Add post-launch consistency check comparing quote-line total vs document meta total before export; warn on mismatch. | accepted-risk |
| BIZ-003 | medium | Nesting/export complexity hotspot | `lib/nestDxfExport.ts`, `lib/parseDxf.ts`, `lib/remnantNestGeometry.ts` | Nesting and DXF export logic spans multiple dense modules with high change risk and limited targeted assertions documented in-code. | Preserve current behavior for launch; schedule focused modularization and additional edge-case fixtures post-launch. | accepted-risk |
| BLOAT-001 | low | Duplicate client fetch logic | `app/shop-tv/page.tsx`, `app/tv-static/page.tsx` | TV summary fetch/parsing logic was duplicated across both pages, increasing drift risk for error handling changes. | Consolidate into shared helper `lib/tv/fetchTvSummary.ts` and reuse in both pages. | fixed |
| BLOAT-002 | low | Root one-off artifacts | `Book1.csv`, `Nest-Sheet1-20260401-3.txt`, `fusion-export-test.txt` | Large one-off data/export files exist in repo root but are currently excluded from tracking by ignore rules. | Keep ignored and out of commits; move long-lived fixture data into a dedicated `fixtures/` path if these become test dependencies. | accepted-risk |
| BLOAT-003 | medium | Single-file concentration risk | `app/nest-remnants/page.tsx` | Very large page module concentrates multiple concerns and increases bundle/review complexity. | Track planned decomposition in post-launch tech-debt queue with milestone owner. | accepted-risk |
| DOCS-001 | medium | Auth model doc drift | `README.md` | Top-level auth description implied Azure-only flow while codebase supports Azure + credentials provider. | Update auth and onboarding text to reflect both sign-in paths and capability-based auth checks. | fixed |
| DOCS-002 | medium | RBAC runbook drift | `docs/rbac-rollout-runbook.md`, `docs/rbac-staging-checklist.md` | Runbook/checklist were still centered on role-era migration checkpoints and language. | Update to capability-era migrations and map manual checks back to canonical capability matrix. | fixed |

## Section Status
- [x] Phase 0: Baseline inventory and rubric
- [x] Phase 1A: Runtime-critical app/API audit
- [x] Phase 1B: Data/schema/RBAC audit
- [x] Phase 1C: Business logic audit (financials/docs/nesting)
- [x] Phase 2: Redundancy/bloat/path health
- [x] Phase 3: Docs and runbook alignment
- [x] Phase 4: Cohesion gate and release recommendation

## Cohesion Gate Evidence
- Passed: `npm run lint`
- Passed: `npm run security:blocked-deps`
- Passed: `npm run security:db-schema-guard`
- Passed: `npm run test:project-financials`
- Passed: `npm run test:document-pdf`
- Passed: `npm run test:rbac-roles`
- Passed: `npm run test:rbac-sql`
- Passed: `npm run test:rbac-api-guards`
- Passed: `npm run build`

## Release Recommendation
Ready to ship with managed non-blocking waivers. No open `critical` or `high` findings remain in this audit.

## Waivers
| Finding ID | Reason | Owner | Target Date |
| --- | --- | --- | --- |
| RUNTIME-003 | Large `nest-remnants` page decomposition is substantial and non-blocking for this release. | Platform Engineering | 2026-05-15 |
| BIZ-002 | Quote/PDF mismatch pre-export warning is quality hardening, not a release blocker. | Product Engineering | 2026-05-15 |
| BIZ-003 | Nesting/export modularization and fixture expansion are post-launch hardening tasks. | Nesting Workstream | 2026-05-22 |
| BLOAT-003 | Single-file concentration reduction is planned technical debt, not immediate runtime breakage. | Frontend Engineering | 2026-05-22 |
