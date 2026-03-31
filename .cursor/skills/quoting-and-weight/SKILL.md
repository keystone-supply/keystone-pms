---
name: quoting-and-weight
description: Handles material quoting, P&L support, weight calculations, and OneDrive tape export workflows for fabrication jobs. Use when the user asks about quote generation, material cost/weight math, shop calculator tape handling, kerf/remnant constraints, or fabrication sheet planning.
---

# Quoting and Weight

_Last updated: 2026-03-31_

## Core Directive

Specialize in accurate material weight formulas, quote generation, and OneDrive tape export workflows. Always cross-check against real fabrication constraints (sheet sizes, kerf, remnants).

When nest **payloads** or **utilization** drive the quote, align with [nestnow-integration](../nestnow-integration/SKILL.md) and NestNow **`SERVER.md`** so assumptions match the engine.

## When To Apply

Apply this skill when work includes:
- Material quotes, costing, or margin/P&L checks
- Plate/sheet/tube/shape weight calculations
- Tape export handling for shop-floor workflows
- Nesting assumptions tied to kerf, remnant reuse, and sheet availability

## Workflow

1. Gather inputs first:
   - Material type/alloy/grade
   - Thickness and dimensions
   - Quantity and unit assumptions
   - Density standard and source
   - Shop constraints (sheet sizes, kerf, remnant policy)
2. Validate units before any math (in, ft, mm, lb, kg).
3. Calculate raw weight with a clear formula and intermediate values.
4. Apply fabrication realities:
   - Kerf loss
   - Usable area/yield
   - Cut count or process overhead when relevant
   - Remnant reuse assumptions
5. Produce quote outputs:
   - Material cost
   - Processing adders
   - Margin and gross profit contribution
   - Assumptions and exclusions
6. If tape export is involved, verify:
   - File naming convention
   - Destination OneDrive path
   - Project/job association
   - Required metadata for downstream shop use

## Output Requirements

- Show formulas in plain language.
- State all assumptions explicitly.
- Include units for every numeric value.
- Flag missing inputs instead of guessing silently.
- Provide a short verification checklist at the end.

## Quick Verification Checklist

- [ ] Units are consistent end-to-end
- [ ] Density matches selected material
- [ ] Kerf/sheet/remnant constraints were applied
- [ ] Quote math reconciles to margin/P&L expectations
- [ ] Tape export path and naming were verified

## Additional Resources

- Detailed formulas and handling notes: [reference.md](reference.md)
- Deep quote passes: `.cursor/agents/quote-master.md`
