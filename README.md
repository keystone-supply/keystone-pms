# Keystone PMS

Project management system for a fabrication/CNC shop: projects, quotes, P&L tracking, material weight calculator, and OneDrive project folder integration.

## Tech stack

- **Next.js 16** (App Router), **React 19**, **TypeScript**
- **Tailwind CSS 4**, **shadcn/ui** (Radix), **Lucide** icons
- **Supabase** – Postgres database and realtime subscriptions for projects
- **NextAuth** – Azure AD (Microsoft work/school) sign-in; JWT stores Microsoft Graph access token with refresh
- **Microsoft Graph** – OneDrive: create project folder structures and upload files (e.g. weight-calc exports)

## Getting started

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and fill in the values (see [Environment variables](#environment-variables)).
3. Run the dev server: `npm run dev`
4. Open [http://localhost:3000](http://localhost:3000). Sign in with Azure AD; ensure Supabase is configured so projects load.

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

Azure AD app must request scope `Files.ReadWrite.All` for OneDrive folder creation and file uploads.

## Project structure

- `app/` – Routes: dashboard (`page.tsx`), projects list/detail, new project, weight calculator, nest remnants; auth API route under `api/auth/[...nextauth]`.
- `lib/` – `supabaseClient.ts` (Supabase client), `onedrive.ts` (Microsoft Graph: project folders + tape upload), `utils.ts` (shared helpers).
- `components/ui/` – shadcn UI components (button, table, badge, etc.).

## Deploy

Build: `npm run build`. Start: `npm start`. For production, set `NEXTAUTH_URL` to your deployed URL. See [Next.js deployment docs](https://nextjs.org/docs/app/building-your-application/deploying) for platforms like Vercel.
