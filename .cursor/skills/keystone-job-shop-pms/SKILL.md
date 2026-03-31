---
name: keystone-job-shop-pms
description: Provides Keystone-style job-shop PMS domain context and implementation guidance across sales, quality, planning, engineering, fabrication, AP/AR, metal distribution, and processing workflows. Use by default in Keystone-PMS repo requests and when the user mentions PMS, ERP, job shops, fabrication, machining, welding, metal sales, or shop operations.
---

# Keystone Job Shop PMS

_Last updated: 2026-03-31_ · Index: [skills README](../README.md)

## Core Directive

Model Keystone as a mixed business:
- Service shop (welding, machining, mechanical work)
- Fabrication shop (custom parts and assemblies)
- Metal distributor/processor (stock sales and customer processing)

Treat all solutions as cross-functional PMS workflows, not isolated point features.

## Current Scope vs Target Vision (updated per repo reality)

**Current v1 scope (implemented in codebase):**
- Project-centric PMS with sales command board, milestones, and embedded quoting (documents for RFQ/PO/invoice).
- Financial snapshots, P&L tracking, margin rollups (`lib/projectFinancials.ts`, `quoteFinancialsSnapshot.ts`).
- Shop calculators, weight/tape export, NestNow nesting integration, OneDrive project folder automation.
- Customers/vendors, sales pipeline stages, document/PDF generation.

**Target ERP roadmap (not yet in repo):**
- Full inventory, work orders/routings, BOM, QC/NCR/inspections, complete AP/AR subledgers, GL posting.

Apply this skill for **most requests**. When work touches unimplemented areas, default to project-level patterns and note roadmap gaps.

## When To Apply

Apply this skill for most requests in this repository, especially when work involves:
- Project/job lifecycle behavior
- Department handoffs and accountability
- Estimating, quoting, planning, scheduling, quality, or fulfillment
- Material processing, sales, calculators, and NestNow/OneDrive flows
- Operational-financial traceability at project level

## Operating Model

Use this default department map:
- Sales: intake, scoping, quote coordination, customer communication
- Engineering: technical review, drawings/BOM/routings, manufacturability
- Planning: capacity/load checks, sequencing, due-date risk management
- Shop Fabrication: cut/form/weld/machine/assemble and progress reporting
- Quality Control: inspections, NCRs, dispositions, and release gates
- Accounts Payable/Receiving: vendor invoices, PO matching, receiving control
- Accounts Receivable: invoicing, terms, collections, and cash tracking

## Required Workflow Lens

When implementing or reviewing features, always map:
1. Trigger: what starts the workflow
2. Owner: who is responsible at each stage
3. Inputs/outputs: data created, transformed, or consumed
4. Gates: approvals, QC checks, or financial controls
5. Exception handling: rejects, rework, shortages, delays, or scope changes
6. Auditability: timestamps, user attribution, and status history

## Canonical End-To-End Flow

Use this baseline sequence unless the user requests a variant:
1. Lead or customer request enters Sales.
2. Quote and technical scope are developed with Engineering input.
3. Job/project is created, planned, and scheduled by Planning.
4. Material is sourced, received, and/or allocated from stock.
5. Fabrication/machining/welding/assembly executes in shop operations.
6. Quality performs in-process and final checks.
7. Shipment/pickup is released with completion status.
8. AR invoices customer; AP reconciles vendor-side costs.
9. Margin/P&L rollups reflect labor, material, outside processing, and overhead.

## Data Modeling Expectations

**For v1 (current codebase):** Prefer schemas that preserve project-level traceability:
- Customer -> project (with embedded quote/docs/milestones) -> financial snapshots
- Material/calculators -> NestNow payload -> OneDrive tape/docs
- Cost events -> quote assumptions -> realized margin (via `projectFinancials.ts`)

**For roadmap items:** Use the full chains listed in `reference.md` (inventory, WO, NCR, AP/AR lineage).

Use explicit status enums and transition rules over free-text state. Preserve revision history for quotes/docs.

## UX and Output Requirements

For user-facing responses, default to:
- Clear ownership by department for each action
- Current state + next action + blocker (if any)
- Date commitment and risk flags
- Assumptions called out explicitly

Always include one of the following output templates.

When the task touches quoting or NestNow, also include a **Shop Floor Ready** section with Fabrication Impact details.

## Output Template A (Concise Checklist)

```markdown
# [Workflow or Feature]

## Scope
- Business area:
- Departments touched:
- In-scope / out-of-scope:

## Execution Checklist
- [ ] Intake and ownership defined
- [ ] Required data fields validated
- [ ] State transitions and gates defined
- [ ] Exception paths handled
- [ ] Audit trail events captured
- [ ] Reporting/financial linkage confirmed

## Risks
- Risk:
- Mitigation:
```

## Output Template B (Structured Spec)

```markdown
# [Workflow Spec]

## Objective
[Business goal and measurable result]

## Actors and Ownership
- Sales:
- Engineering:
- Planning:
- Shop:
- Quality:
- AP/AR:

## Entities
- [Entity]: [purpose]

## State Model
- State:
  - Entry criteria:
  - Exit criteria:
  - Allowed transitions:

## Process Steps
1. Step:
   - Owner:
   - Inputs:
   - Outputs:
   - Validation/gate:

## Exceptions
- Scenario:
  - Detection:
  - Disposition:
  - Notification:

## Metrics
- On-time delivery:
- First-pass quality:
- Quote-to-cash cycle time:
- Realized vs quoted margin:
```

## Shop Floor Ready (for quoting/NestNow tasks)

```markdown
## Shop Floor Ready

### Fabrication Impact
- Sheet utilization: XX% (incl. kerf/remnants)
- Estimated cut time: X hrs (NestNow output)
- Handling notes: [nesting complexity, part orientation, material constraints]
- Shop recommendations: [remnant strategy, sequencing, QC checkpoints]
```

## Guardrails

- Do not collapse department responsibilities into a single generic "admin" role.
- Do not skip quality gates for speed unless explicitly requested and approved.
- For v1: preserve project-level financial and document traceability; full PO/receipt/invoice lineage is roadmap.
- Do not assume pure make-to-stock; support make-to-order and mixed-mode operations.
- When suggesting new modules (inventory, QC, full AP/AR), flag as roadmap and align with existing project-centric patterns.

## Additional Resources

- Extended terminology and implementation notes: [reference.md](reference.md)
