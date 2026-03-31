# Keystone Job Shop PMS Reference

## Core Business Types

- Service work: welding, machining, and mechanical service jobs
- Fabrication: custom parts/assemblies built to drawing/spec
- Distribution: sale of plate, sheet, bar, tube, pipe, and shapes
- Processing services: cut-to-size, drilling, machining, prep, and kitting

## Suggested Core Entities

**Implemented in v1:**
- Customer, Contact, Project/Job (with milestones, financials, documents)
- Quote (embedded as project fields + document types)
- Shipment, Invoice (partial via documents and project fields)

**Roadmap / schema outline only:**
- Work order, Operation/routing step, BOM/material requirement
- Inventory item, Purchase order, Receipt
- Inspection record, NCR (nonconformance report)
- Payment, Cost event (GL tables exist but not wired)

See migrations and `lib/` for current schema.

## Common Status Families

- Quote: draft, internal-review, sent, revised, won, lost
- Job: new, engineering, planned, in-process, qc-hold, ready-to-ship, closed
- Work order: released, in-progress, paused, complete
- Material: requested, allocated, ordered, received, consumed
- Quality: pending, pass, fail, rework, approved-release
- Financial: unbilled, billed, partially-paid, paid, disputed

## High-Value Integrations

- OneDrive/Graph: project folder lifecycle and controlled document placement (`lib/onedrive.ts`)
- Nesting/CAM systems: cut plan outputs and material utilization linkage (NestNow proxy)
- Accounting handoff: invoice, payment, and vendor-cost reconciliation (partial via documents; full GL is roadmap)

## KPI Set

- Quote hit rate
- Quote-to-order conversion time
- On-time delivery
- Schedule adherence
- First-pass yield
- Rework rate
- Inventory turns
- DSO (days sales outstanding)
- Realized gross margin vs quoted margin

## Design Notes

- Preserve revision history for quotes, drawings, and routing assumptions.
- Separate estimated values from actuals for margin diagnostics.
- Capture who/when for each state transition to support root-cause analysis.
- Model exceptions as first-class events (shortage, scrap, rework, vendor delay).
