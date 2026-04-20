# Keystone PMS Capability Matrix (v2)

Authorization is now **capability-based** (`app_user_capabilities`) instead of role-based.

## Canonical Capabilities

- `read_projects`
- `create_projects`
- `edit_projects`
- `delete_projects`
- `manage_documents`
- `view_financials`
- `access_sales`
- `manage_crm`
- `run_nesting`
- `manage_sheet_stock`
- `view_shop_tv`
- `manage_users`
- `manage_user_access`

## Surface Mapping

| Surface | Required capability |
|---|---|
| Dashboard (`/`) | `read_projects` |
| Projects list/detail | `read_projects` (+ per-project overrides in `app_user_project_access`) |
| New project (`/new-project`) | `create_projects` |
| Project edit actions | `edit_projects` |
| Project documents | `manage_documents` (or per-project write grants) |
| Sales hub (`/sales`) | `access_sales` |
| Customer/vendor CRUD | `manage_crm` |
| Financial KPIs + columns | `view_financials` |
| Nesting APIs/UI | `run_nesting` |
| Sheet stock / preview repair | `manage_sheet_stock` |
| Shop TV (`/shop-tv`, `/tv-static`) | `view_shop_tv` |
| Admin user management (`/admin/users`) | `manage_users` |
| Per-user project grants editor | `manage_user_access` |

## Database Policy Intent

| Table / View | Policy intent |
|---|---|
| `app_users` | Self-read + `manage_users` for CRUD |
| `app_user_capabilities` | Self-read + `manage_users` mutate |
| `app_user_project_access` | Self-read + `manage_users`/`manage_user_access` mutate |
| `projects` | `read_projects` for read, `create_projects`/`edit_projects`/`delete_projects` for write paths, plus per-project grants |
| `project_documents`, `project_files`, `project_folder_sync` | `read_projects` read, `manage_documents` mutate, plus per-project grants |
| `customers`, `customer_shipping_addresses`, `vendors` | `access_sales` read + `manage_crm` mutate |
| `finance_journal_entries`, `finance_journal_lines` | `view_financials` read, privileged mutation capability checks |
| `sheet_stock` | `manage_sheet_stock` |
| `projects_role_filtered` | masks financial columns unless `view_financials` |

## Enforcement Principles

1. Supabase RLS remains the final authorization layer.
2. App/UI checks mirror DB capabilities to prevent mismatch.
3. `manage_users` must always remain assigned to at least one active user.
4. Per-project grants (`app_user_project_access`) are additive for read/write access.
