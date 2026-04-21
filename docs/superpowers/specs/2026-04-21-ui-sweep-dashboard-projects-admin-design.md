# UI Sweep: Dashboard, Projects, and Admin Users Design

**Date:** 2026-04-21  
**Status:** Approved for implementation  
**Scope:** `Dashboard`, `All projects`, project detail sub-windows, and `Admin users` pages

## Goal

Apply a focused UI polish sweep across the selected pages so they feel like one cohesive product system, using `Dashboard` as the visual baseline, while preserving existing behavior and role gating.

## In Scope

- `Dashboard` page: small style consistency touch-ups only
- `All projects` page windows/cards
- `Project detail` windows/cards/sub-windows (`overview`, `financials`, `documents`, `files`)
- `Admin users` shell and pages (`list`, `new`, `detail`)
- Helper guidance: moderate contextual notes; remove redundant `?` controls

## Out of Scope

- `Nest & remnants` pages
- `Shop calc` pages
- Functional or schema/API behavior changes not required by UI polish

## Design Baseline

Use `Dashboard` page styling language as source-of-truth:

- Shared shell rhythm (`max width`, horizontal padding, vertical cadence)
- Dark surface hierarchy (page background, card background, border contrast)
- Uniform card/window anatomy:
  - Header row with icon + title + concise subtitle
  - Optional right-side action controls
  - Body content with consistent density and spacing
- Consistent control styling (buttons, inputs, selects, badges, alerts)
- Consistent empty/loading/error/read-only states

## Approach Options Reviewed

1. Minimal touch-up
2. Dashboard-led harmonization (**selected**)
3. Structural re-layout

Selected approach balances polish and safety: high visual consistency with low behavioral risk.

## Approved Behavioral Constraints

- Keep current `Project detail` section expand/collapse defaults.
- Do not alter role/capability behavior.
- Keep helper copy moderate and contextual; remove duplicate/no-value helper buttons.

## Component and Page Plan

### 1) Dashboard small pass

- Keep layout and behavior unchanged.
- Adjust any small style outliers so the page remains the strongest template.

### 2) All projects page

- Normalize card/window headers to match dashboard anatomy.
- Align table/filter/control surface styling to dashboard density and border language.
- Replace redundant helper button patterns with concise visible helper copy where useful.

### 3) Project detail page and sub-windows

- Harmonize panel wrappers for financials/documents/files so they read as sibling windows.
- Align top action row and feedback banners to dashboard polish standards.
- Preserve current expand/collapse defaults and workflow behavior.

### 4) Admin users full shell adoption

- Move admin pages onto dashboard shell standards (`DashboardHeader` + quick links style rhythm).
- Restyle list/form/section/table surfaces to match dashboard language.
- Add clear contextual helper notes where permission and access behavior may confuse users.

## Data Flow and Architecture Impact

- No data model changes.
- No endpoint contract changes.
- No auth or RBAC logic changes.
- UI-only composition and styling updates at route and component layers.

## Error Handling and State Presentation

- Keep existing load/error handling logic.
- Improve consistency in presentation of:
  - Read-only role messages
  - Success/error banners
  - Empty table/list states

## Verification Plan

### Implementation Order

1. Dashboard baseline touch-up
2. All projects windows/cards polish
3. Project detail windows polish
4. Admin users shell + page polish

### Validation

- Lint check on changed files
- Type/build check for app integrity
- Manual route spot-checks:
  - `/`
  - `/projects`
  - `/projects/[id]`
  - `/admin/users`
  - `/admin/users/new`
  - `/admin/users/[id]`
- Confirm no visual/behavior changes in excluded pages (`Nest & remnants`, `Shop calc`)

## Acceptance Criteria

- Visual style is consistent across all in-scope pages.
- Helper affordances are informative, concise, and non-redundant.
- Existing workflows and defaults remain intact.
- No RBAC regressions in nav visibility or admin capabilities.
