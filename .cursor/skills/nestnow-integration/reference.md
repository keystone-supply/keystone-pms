# NestNow Integration Reference

_Last updated: 2026-03-31_

## Endpoint contract (see NestNow SERVER.md)

- **Source of truth:** [`SERVER.md`](../NestNow/SERVER.md) (NestNow in sibling folder at `../NestNow`).
- **Default submit:** proxy via `app/api/nest/route.ts` or direct `POST http://127.0.0.1:3001/nest` (use `NESTNOW_URL`).
- **Also documented in SERVER.md:** `GET /progress`, `POST /stop`, error shapes (`400`/`404`/`500`), optional `candidates` and `chromosome` refine. Note extended fields like `failureKind`, `lastEvalError` in real responses.
- Treat raw responses as engine output; map into **your** app model (TypeScript types today; Zod optional).

## Request Construction

Before submission:

1. Validate required identifiers (tenant/project/job as applicable)
2. Validate material and sheet constraints
3. Validate kerf and remnant handling assumptions
4. Normalize units and precision

Recommended request behavior:

- Use deterministic ordering for parts to improve reproducibility
- Reject payloads with ambiguous units
- Include only fields required by the engine contract

## Response parsing

Map **`SERVER.md` success fields** (`fitness`, `area`, `totalarea`, `mergedLength`, `utilisation`, `placements`, optional `candidates`, `chromosome`) into stable app-level fields, for example:

- Internal `status` / lifecycle for UI
- Sheet / part counts derived from `placements` and `sheetplacements`
- Yield / utilization aligned with `utilisation` and your definitions (do not rename server fields before parsing)
- Placement artifacts for previews or CAM handoff
- `warnings` / `errors` collections for partial or failed runs

If the engine returns partial success:
- Preserve successful artifacts
- Promote issues into warning/error collections
- Mark result as partial to prevent silent data loss

## Failure Handling

Classify errors into:

- **Validation errors**: user input/schema/unit problems
- **Engine errors**: nesting failure or unsupported geometry
- **Transport errors**: timeout/connection/refused response
- **Unexpected errors**: unclassified response shape

Retry guidance:

- Retry transient transport failures with backoff
- Do not auto-retry validation errors
- For engine errors, require user input changes when appropriate

## UI Feedback Pattern

At minimum, support:

1. **Loading**: "Submitting job to NestNow..."
2. **Success**: key metrics and next action
3. **Warning**: completed with caveats (show top warnings)
4. **Error**: concise reason + retry/change guidance

Prefer user-facing language that explains:
- What happened
- What can be done next
- Whether retry is likely to work

## Logging Guidance

- Log correlation IDs, status, duration, and high-level outcome.
- Do not log sensitive data or large raw geometry blobs unless explicitly needed for debugging.
- Keep logs structured for troubleshooting and support.
