---
name: nestnow-integration
description: Submits nesting jobs to the NestNow engine, parses nesting responses, and drives clear UI feedback states. Use when the user asks about NestNow payloads, local nest endpoint integration, result normalization, nesting failures, or shop-facing status updates.
---

# NestNow Integration

_Last updated: 2026-03-31_

## Core Focus

Handle nesting job submission, result parsing, and UI feedback for the NestNow engine with predictable request/response behavior.

## Schema authority (read first)

- **Authoritative contract:** NestNow [`SERVER.md`](../../../NestNow/SERVER.md) in the sibling **NestNow** repo (`../SERVER.md` from the Keystone-PMS repo root when both repos share a parent folder).
- Do **not** invent JSON fields. Current implementation uses TypeScript types (`lib/nestPayload.ts`, `NestApiResponse`); Zod schemas are optional for new internal validation.
- Use `NESTNOW_URL` (defaults to `http://127.0.0.1:3001/nest` via proxy in `app/api/nest/route.ts`); server binds **localhost only**; lifecycle includes `GET /progress` and `POST /stop`.
- **Related:** fabrication assumptions (kerf, remnants, stock sizes) often belong to [quoting-and-weight](../quoting-and-weight/SKILL.md); keep nest payloads and quote assumptions consistent.

## When To Apply

Apply this skill when work includes:
- Building or validating NestNow submission payloads
- Calling the local NestNow endpoint (`http://127.0.0.1:3001/nest`)
- Parsing nest outputs into app-safe result models
- Presenting progress, success, warning, and failure states in UI

## Workflow

1. Validate request inputs:
   - Project/job identifiers
   - Material and sheet constraints
   - Part geometry/count/rotation rules
   - Kerf and remnant assumptions
2. Build a stable payload:
   - Normalize units and numeric precision
   - Include required fields only
   - Preserve deterministic part ordering where possible
3. Submit job to NestNow:
   - Call `POST /nest` (default base `http://127.0.0.1:3001`)
   - Apply timeout and retry policy for transient failures only (not for 400 validation)
   - Capture request correlation context (non-sensitive)
4. Parse and normalize result:
   - Extract key metrics (yield, scrap/remnant, sheet usage)
   - Normalize nested layout artifacts for downstream UI
   - Convert engine-specific errors into domain-friendly messages
5. Drive UI feedback:
   - Pending/running state with clear progress text
   - Success state with top metrics and actionable next steps
   - Warning state for degraded assumptions or partial issues
   - Error state with concise reason and retry guidance
6. Return audit-friendly output:
   - Inputs used
   - Assumptions applied
   - Result summary and unresolved risks

## Output Requirements

- Show the payload intent and assumptions in plain language.
- Include units for all dimensional values.
- Keep engine internals abstracted behind app-level messages.
- Surface retryability (retry now vs requires input change).
- End with a short verification checklist.

## Quick Verification Checklist

- [ ] Payload schema and units are valid
- [ ] Endpoint call behavior handles timeout/retry paths
- [ ] Result parser maps outputs to stable app fields
- [ ] UI states cover loading/success/warning/error
- [ ] Messages are actionable for shop users

## Additional Resources

- Payload, parsing, and UI mapping details: [reference.md](reference.md)
- Project agent (deep dives): `.cursor/agents/nestnow-specialist.md`
