# Keystone PMS RBAC Matrix (v1)

This document is the source-of-truth matrix for application authorization.

Roles:
- `admin`
- `manager`
- `sales`
- `engineering`
- `fabrication`
- `viewer`

Legend:
- `R` = read
- `W` = write/create/update
- `D` = delete
- `-` = no access
- `*` = constrained by per-project grants (`app_user_project_access`) where noted

## Capability Matrix

| Capability | admin | manager | sales | engineering | fabrication | viewer |
|---|---:|---:|---:|---:|---:|---:|
| Dashboard | R | R | R | R | R | R |
| Projects list/detail | R/W/D | R/W/D | R/W | R* | R* | R* |
| Project documents | R/W/D | R/W/D | R/W/D | R* | R* | R* |
| Financial visibility | R | R | R | - | - | - |
| New project creation | W | W | W | - | - | - |
| Sales hub + CRM masters | R/W/D | R/W/D | R/W | - | - | - |
| Nesting (run/stop/progress) | R/W | R/W | - | R/W | R/W | - |
| Sheet stock/remnants | R/W | R/W | - | R/W | R/W | - |
| Shop TV summary | R | R | R | R | R | - |
| Weight/shop calculator | R | R | R | R | R | R |
| Auth/session bridge token | R | R | R | R | R | R |

Notes:
- `engineering`/`fabrication` get project/document access primarily through role + project-level grants.
- `viewer` is intentionally restricted and does not get finance/sales/nesting mutation flows.

## UI Route Matrix

| Route / Surface | admin | manager | sales | engineering | fabrication | viewer |
|---|---:|---:|---:|---:|---:|---:|
| `/` | R | R | R | R | R | R |
| `/projects` | R | R | R | R | R | R |
| `/projects/[id]` | R/W | R/W | R/W | R | R | R |
| `/new-project` | W | W | W | - | - | - |
| `/sales` | R/W | R/W | R/W | - | - | - |
| `/sales/customers/*` | R/W | R/W | R/W | - | - | - |
| `/sales/vendors/*` | R/W | R/W | R/W | - | - | - |
| `/nest-remnants` | R/W | R/W | - | R/W | R/W | - |
| `/shop-tv` | R | R | R | R | R | - |
| `/tv-static` | R | R | R | R | R | - |
| `/weight-calc` | R | R | R | R | R | R |
| `/pipad-calc` | R | R | R | R | R | R |

## API Route Matrix

| API route | admin | manager | sales | engineering | fabrication | viewer |
|---|---:|---:|---:|---:|---:|---:|
| `GET /api/auth/supabase-token` | R | R | R | R | R | R |
| `GET /api/tv/summary` | R | R | R | R | R | - |
| `POST /api/nest` | R/W | R/W | - | R/W | R/W | - |
| `GET /api/nest/progress` | R | R | - | R | R | - |
| `POST /api/nest/stop` | R/W | R/W | - | R/W | R/W | - |

## Database Table/Policy Intent Matrix

| Table / View | admin | manager | sales | engineering | fabrication | viewer |
|---|---:|---:|---:|---:|---:|---:|
| `app_users` | R/W/D | R (self) | R (self) | R (self) | R (self) | R (self) |
| `app_user_project_access` | R/W/D | R/W/D | R (self rows only) | R (self rows only) | R (self rows only) | R (self rows only) |
| `projects` | R/W/D | R/W/D | R/W | R* | R* | R* |
| `project_documents` | R/W/D | R/W/D | R/W/D | R* | R* | R* |
| `customers` | R/W/D | R/W/D | R/W/D | - | - | - |
| `customer_shipping_addresses` | R/W/D | R/W/D | R/W/D | - | - | - |
| `vendors` | R/W/D | R/W/D | R/W/D | - | - | - |
| `finance_journal_entries` | R/W/D | R/W/D | R | - | - | - |
| `finance_journal_lines` | R/W/D | R/W/D | R | - | - | - |
| `sheet_stock` | R/W/D | R/W/D | - | R/W/D | R/W/D | - |
| `projects_role_filtered` (view) | R | R | R | R (masked columns) | R (masked columns) | R (masked columns) |

## Enforcement Principles

1. Supabase RLS is the final authorization layer for data access.
2. App/UI checks must mirror DB intent to avoid confusing "button works but save fails" behavior.
3. API routes enforce role checks before backend actions.
4. Financial data is hidden from non-finance roles in both UI and DB.
5. Any role change must update this matrix first, then code + SQL.
