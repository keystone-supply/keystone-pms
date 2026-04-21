# Keystone PMS

Project management system for a fabrication/CNC shop: projects, quotes, P&L tracking, material weight calculator, and OneDrive project folder integration.

## Tech stack

- **Next.js 16** (App Router), **React 19**, **TypeScript**
- **Tailwind CSS 4**, **shadcn/ui** (Radix), **Lucide** icons
- **Supabase** – Postgres database and realtime subscriptions for projects
- **NextAuth** – Azure AD and credentials sign-in; JWT/session include app capability grants
- **Microsoft Graph** – OneDrive: create project folder structures and upload files (e.g. shop calculator tape exports from `/weight-calc`)

## Getting started

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and fill in the values (see [Environment variables](#environment-variables)).
3. Run the dev server: `npm run dev`
4. Open [http://localhost:3000](http://localhost:3000). Sign in with Azure AD or credentials (if seeded); ensure Supabase is configured so projects load.

## Environment variables

Copy `.env.example` to `.env.local` and set:

| Variable | Purpose |
|----------|---------|
| `NEXTAUTH_SECRET` | NextAuth session encryption (e.g. `openssl rand -base64 32`) |
| `NEXTAUTH_URL` | App URL (e.g. `http://localhost:3000` for dev) |
| `AZURE_AD_CLIENT_ID` | Azure AD app (client) ID |
| `AZURE_AD_CLIENT_SECRET` | Azure AD app secret |
| `AZURE_AD_TENANT_ID` | Azure AD tenant ID (or `common` for multi-tenant) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service role key (NextAuth user sync, admin tasks) |
| `SUPABASE_JWT_SECRET` | Supabase JWT signing secret used by `/api/auth/supabase-token` |
| `SUPABASE_BRIDGE_TOKEN_TTL_SECONDS` | Optional short-lived bridge token TTL in seconds (default: `600`) |

Azure AD app must request scope `Files.ReadWrite.All` for OneDrive folder creation and file uploads.

## Authorization model

- App authorization is capability-based (`app_user_capabilities`) with optional per-project overrides (`app_user_project_access`).
- Use `docs/rbac-role-matrix.md` as the canonical capability matrix for UI/API and DB policy expectations.
- Before merging access-policy changes, run:
  - `npm run test:rbac-roles`
  - `npm run test:rbac-api-guards`
  - `npm run test:rbac-sql`
  - `npm run security:db-schema-guard`

## Project structure

- `app/` – Routes: dashboard (`page.tsx`), projects list/detail, new project, weight calculator, nest remnants; auth API route under `api/auth/[...nextauth]`.
- `lib/` – `supabaseClient.ts` (Supabase client + authenticated bridge token wiring), `onedrive.ts` (Microsoft Graph: project folders + tape upload), `utils.ts` (shared helpers).
- `components/ui/` – shadcn UI components (button, table, badge, etc.).

## NestNow integration

Nesting logic comes from [keystone-supply/NestNow](https://github.com/keystone-supply/NestNow) (a fork of deepnest-next). NestNow is developed in a **separate repo** under the Keystone Supply org. For local integration work:

1. Clone NestNow as a **sibling folder** to this repo (e.g. `../NestNow`).
2. Build and run it per NestNow’s [BUILD.md](https://github.com/keystone-supply/NestNow/blob/main/BUILD.md) (`npm install`, `npm run build`, `npm run start`).
3. The **nesting UI** will live in Keystone PMS (in this repo); NestNow is the engine, to be called via CLI, local server, or npm package as integration progresses.
4. With the NestNow **server** running (`npm run start:server` in NestNow), use the **Nest Tool** tab on the nest-remnants page to run a nest and view the result. Optional: set `NESTNOW_URL` in `.env.local` (default `http://127.0.0.1:3001`).

Long runs, proxy timeouts, and very large part counts are covered in [docs/nesting-scale-and-timeouts.md](docs/nesting-scale-and-timeouts.md). To estimate JSON payload size: `npm run nest:estimate-payload`.

## Deploy

Build: `npm run build`. Start: `npm start`. For production, set `NEXTAUTH_URL` to your deployed URL. See [Next.js deployment docs](https://nextjs.org/docs/app/building-your-application/deploying) for platforms like Vercel.

## Dedicated Host Deployment (Planning)

On a dedicated machine on the business local network:

1. Clone both repositories as sibling folders (`keystone-pms/` and `NestNow/`).
2. Use `keystone-pms.code-workspace` or open the `keystone-pms` folder in Cursor/VS Code.
3. Build and run `keystone-pms` (Next.js production build).
4. Run NestNow in server mode independently (`cd ../NestNow && npm run start:server`).
5. Configure `NESTNOW_URL=http://127.0.0.1:3001` (or appropriate internal address).
6. Ensure firewall allows traffic to the PMS web port and NestNow server port (3001).

Both services run independently. The PMS app communicates with NestNow via the configured URL or direct browser connections for long-running nests. See [docs/nesting-scale-and-timeouts.md](docs/nesting-scale-and-timeouts.md) for timeout and proxy guidance.

## Cursor AI Configuration (for team members)

This repository includes a `.cursor/` directory with rules, skills, and agents that provide consistent AI assistance across the team.

- Open the `keystone-pms` folder (or the `keystone-pms.code-workspace` multi-root workspace file) in Cursor.
- Cursor will automatically load:
  - [`.cursor/rules/Keystone-PMS-Core-Standards.mdc`](.cursor/rules/Keystone-PMS-Core-Standards.mdc) (always applied)
  - Domain skills in [`.cursor/skills/`](.cursor/skills/)
  - Specialized agents in [`.cursor/agents/`](.cursor/agents/)

Clone both this repo and the sibling `NestNow` repo for full functionality (referenced by skills). See `.cursor/skills/README.md` for details.

**Workspace file**: A `keystone-pms.code-workspace` file is now included in the repo root for convenient multi-root opening (keystone-pms + NestNow). Teammates can double-click it in Cursor or open the folder directly.
