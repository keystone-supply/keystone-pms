# Supabase migrations

## Apply to your hosted project

### Option A — CLI (recommended)

1. Install / use CLI: `npx supabase login` (opens browser or use `SUPABASE_ACCESS_TOKEN`).
2. Link this repo once:  
   `npx supabase link --project-ref <your-project-ref>`  
   (ref is the subdomain of `https://<ref>.supabase.co`.)
3. Push pending migrations:  
   `npx supabase db push`

### Option B — SQL Editor

In the Supabase dashboard: **SQL** → New query → paste the contents of `migrations/20260319120000_project_documents.sql` → Run.

Use this if the CLI is not linked or you need to run a hotfix on production.

## RLS on `project_documents`

Policies require that a matching row exists in `public.projects` **and** that the current user passes `projects` RLS when evaluating the `EXISTS` subquery. There are **no** policies for the `anon` role; the app should use a logged-in Supabase session (`authenticated`) or `service_role` for server-side jobs.

## Customers & sales (`20260323120000_customers.sql`)

Migration adds:

- `public.customers` — legal name, primary contact, billing address, AP contact, payment terms, status, notes, follow-up timestamp.
- `public.customer_shipping_addresses` — multiple ship-tos per customer; partial unique index enforces at most one `is_default` per customer.
- Optional `public.projects.customer_id` (nullable FK) for linking jobs to accounts; the existing `customer` text column remains.

RLS: permissive policies for **`anon` and `authenticated`** (full CRUD) so the Next.js client using the anon key (`lib/supabaseClient.ts`) matches typical internal access to `projects`. Tighten in Supabase if you expose the anon key beyond trusted users.

Apply with `npm run db:push` or paste the migration file into the SQL editor.

## `projects` lifecycle + `Book1.csv` import

1. Push migrations (`npm run db:push`). If `projects_project_number_unique` fails because of duplicate test rows, run `TRUNCATE public.projects CASCADE;` in the SQL editor, then push again.
2. Put `Book1.csv` at the repo root (or set `BOOK1_CSV`).
3. Ensure `.env.local` has `SUPABASE_SERVICE_ROLE` and `NEXT_PUBLIC_SUPABASE_URL`.
4. Run `npm run import:book1` — this **deletes all projects** and inserts from the CSV (duplicate job numbers become `101592-2`, etc.).
