/**
 * Job numbers may be plain digits (101362) or suffixed for CSV duplicates (101592-2).
 * Next series number = max leading numeric segment + 1.
 */
export function maxNumericJobPrefix(projectNumbers: Array<string | number | null | undefined>): number {
  let max = 0;
  for (const raw of projectNumbers) {
    const s = String(raw ?? "").trim();
    const m = /^(\d+)/.exec(s);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

export function nextSequentialJobNumber(projectNumbers: Array<string | number | null | undefined>): string {
  const m = maxNumericJobPrefix(projectNumbers);
  /** When the table is empty, start the series after this legacy floor. */
  const base = m > 0 ? m : 101350;
  return String(base + 1);
}
