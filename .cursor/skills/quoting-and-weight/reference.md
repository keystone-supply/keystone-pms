# Quoting and Weight Reference

## Default Formula Patterns

Use these as defaults unless the user/project specifies alternatives.

### Plate or Sheet Weight

- Volume = `length * width * thickness`
- Weight = `volume * density`
- Example imperial conversion:
  - If dimensions are inches and density is lb/in^3, weight is lb.

### Tube or Pipe (Approximate)

- Cross-sectional area = `outer_area - inner_area`
- Volume = `cross_sectional_area * length`
- Weight = `volume * density`

### Structural Shape (Preferred)

- Use published weight-per-length tables when available.
- Weight = `weight_per_length * cut_length * quantity`

## Quoting Components

At minimum, separate the quote into:

1. Material
2. Processing (cutting, handling, setup)
3. Consumables/overhead (if included by policy)
4. Margin target and resulting price

If P&L context is requested, include:
- Estimated gross profit
- Gross margin percentage
- Noted assumptions that materially change profitability

## Fabrication Reality Checks

Always validate these constraints before finalizing results:

- **Sheet sizes**: Confirm purchasable stock dimensions
- **Kerf**: Include realistic kerf loss in yield assumptions
- **Remnants**: Apply business rules for remnant reuse/value
- **Minimum practical cut size**: Avoid impossible small parts
- **Quantity effects**: Distinguish prototype vs production assumptions

## Tape Export Handling (OneDrive)

When tape exports are involved, verify:

1. Correct project/job folder destination in OneDrive
2. Stable file naming convention (job, part, revision where applicable)
3. Export completeness (no missing parts/files)
4. Traceability metadata needed by shop floor or nesting process

## Error Handling Guidance

- If a required input is missing, stop and request it.
- If units are ambiguous, request clarification before calculating.
- If density source is uncertain, call out the assumption explicitly.
- If constraints conflict, present alternatives rather than forcing one.
