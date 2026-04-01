# Keystone-PMS Cursor skills and agents

Last updated: 2026-03-31

This folder holds **Skills** (domain + workflow guidance the model should read when relevant). **Agents** live in [../agents/](../agents/) and map to Task/delegate flows for focused reviews or NestNow/OneDrive/quote work.

## When to read what

| Situation | Start here |
|-----------|------------|
| Default PMS / job-shop / cross-dept workflows | [keystone-job-shop-pms/SKILL.md](./keystone-job-shop-pms/SKILL.md) |
| NestNow HTTP API, payloads, UI nesting status | [nestnow-integration/SKILL.md](./nestnow-integration/SKILL.md) + NestNow **`SERVER.md`** (`../NestNow/SERVER.md` in sibling folder) |
| Microsoft Graph, OneDrive folders, uploads, tokens | [onedrive-integration/SKILL.md](./onedrive-integration/SKILL.md) |
| Quotes, weight math, P&L, tape exports | [quoting-and-weight/SKILL.md](./quoting-and-weight/SKILL.md) |

**Pairing:** Quoting/nesting often overlap (kerf, remnants, sheet stock). Use **quoting-and-weight** with **nestnow-integration** when yield or nest assumptions affect estimates.

## Skills index

1. **keystone-job-shop-pms** — [SKILL.md](./keystone-job-shop-pms/SKILL.md) · [reference.md](./keystone-job-shop-pms/reference.md)  
   Domain model with **v1 scope (project-centric) vs roadmap** distinction.

2. **nestnow-integration** — [SKILL.md](./nestnow-integration/SKILL.md) · [reference.md](./nestnow-integration/reference.md)  
   Local engine integration (TS types today; `NESTNOW_URL` + proxy); schema source of truth is always NestNow `SERVER.md`.

3. **onedrive-integration** — [SKILL.md](./onedrive-integration/SKILL.md) · [reference.md](./onedrive-integration/reference.md)  
   Graph drive operations, token lifecycle, idempotent folder trees.

4. **quoting-and-weight** — [SKILL.md](./quoting-and-weight/SKILL.md) · [reference.md](./quoting-and-weight/reference.md)  
   Material math, margin, fabrication constraints, tape path conventions.

## Quick Audit Command

`/quick-audit` — lightweight command that automatically runs **reliability-guard-pr** (always) + **quote-master** (when quoting/NestNow involved) in parallel via Task subagents. Ideal for end-of-day PR checks or post-change validation.

## Agents (`.cursor/agents/`)

Use these for **delegated** PR gates or deep domain passes (names align with Cursor Task subagent types where configured):

| Agent file | Role |
|------------|------|
| [reliability-guard.md](../agents/reliability-guard.md) | Post-change pass: RLS, auth, realtime, architecture |
| [reliability-guard-pr.md](../agents/reliability-guard-pr.md) | Merge gate: blocking vs non-blocking findings |
| [nestnow-specialist.md](../agents/nestnow-specialist.md) | `/nest`, `/progress`, `/stop`, chromosome refine, Zod + `SERVER.md` |
| [onedrive-wrangler.md](../agents/onedrive-wrangler.md) | Azure AD + Graph uploads and folder provisioning |
| [quote-master.md](../agents/quote-master.md) | Quote math, P&L options, validation checks |

**Note:** The duplicate **nest-handler** agent was removed; use **nestnow-specialist** for all NestNow integration work. See `keystone-job-shop-pms` skill for v1 vs roadmap scope.

## Related repo

- **NestNow** (nesting engine): keep `SERVER.md` open when changing nest client code; run server via `npm run start:server` in the NestNow repo (default bind `127.0.0.1:3001`).
