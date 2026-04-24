# Document Type Porting Checklist

Use this checklist when bringing a non-quote document type online (RFQ, PO, Invoice, Packing List, BOL) so behavior matches the current Quote workspace/pipeline with minimal rework.

## 1) Scope + Feature Flags

- [ ] Confirm target doc type and intended rollout order.
- [ ] Keep Quote behavior as source of truth; do not regress quote-only paths.
- [ ] Gate unfinished UI/PDF behaviors behind doc-kind checks until validated.

## 2) Workspace Editor (UI)

- [ ] Verify section model:
  - [ ] Base Scope semantics defined
  - [ ] Option sections enabled/disabled intentionally for this doc type
- [ ] Verify line-card controls:
  - [ ] Drag handle only starts drag
  - [ ] Up/down arrows follow same ordering/renumber rules as drag
  - [ ] Add sub-item / nested hierarchy behavior is correct
- [ ] Verify numbering display:
  - [ ] Auto-generated Item # only (no manual override)
  - [ ] Hierarchical numbering (`1`, `1.1`, `1.1.1`) if hierarchy is supported
  - [ ] Per-section numbering reset if options are supported
- [ ] Verify editable fields:
  - [ ] `PART #` input present where required
  - [ ] Field labels/placeholders match document terminology

## 3) Data/Hook Logic

- [ ] Reorder/move/delete all preserve consistent numbering state.
- [ ] Cross-section move behavior (if enabled) updates section + order together.
- [ ] Option-group boundary rules are enforced for arrow moves.
- [ ] New/changed fields (like `partRef`) are persisted and loaded correctly.

## 4) PDF Rendering

- [ ] Table columns match workspace intent:
  - [ ] `ITEM #` column uses generated numbering only
  - [ ] `PART #` column present and sized correctly (where applicable)
  - [ ] Description width remains stable across sections/options
- [ ] Hierarchy representation:
  - [ ] Nested item numbers render correctly (`1.1`, `1.1.1`)
  - [ ] Nested rows are visually indented as expected
- [ ] Totals + notes spacing:
  - [ ] Required blank-line spacing above subtotals/totals
  - [ ] Required blank-line spacing above note blocks
- [ ] Section-specific totals/wording are correct for doc type.

## 5) Tests (Minimum Gate)

- [ ] Add/update unit tests for:
  - [ ] numbering generation
  - [ ] reorder/move/delete logic
  - [ ] PDF section/item number rendering
  - [ ] required column headers (`ITEM #`, `PART #`, etc.)
- [ ] Run and pass targeted tests for touched areas.
- [ ] Run and pass lint on touched files.

## 6) Visual QA (Manual)

- [ ] In-editor QA:
  - [ ] create, drag, arrow-move, resection, delete, and sub-item actions
  - [ ] verify numbering continuity after each action
- [ ] PDF QA:
  - [ ] verify one real-world sample with multiple sections/options
  - [ ] verify one sample with nested sub-items
  - [ ] verify spacing/column alignment on rendered output

## 7) Sign-Off

- [ ] Quote behavior unchanged.
- [ ] Target doc type matches checklist requirements.
- [ ] Known gaps recorded before enabling next doc type.

