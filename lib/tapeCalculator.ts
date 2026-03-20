import { create, all } from "mathjs";

const math = create(all, { number: "number" });

export type TapeLineEval = {
  display: string;
  error?: string;
};

const AT_LINE_REF = /@(\d+)/g;

/**
 * Replace `@N` (1-based tape line #) with that line's last finite numeric result.
 * Only lines strictly above the current row may be referenced.
 */
function expandAtLineRefs(
  expr: string,
  currentLineIndex: number,
  lineNumericResults: (number | undefined)[],
): string {
  return expr.replace(AT_LINE_REF, (_match, digits: string) => {
    const n = Number.parseInt(digits, 10);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error(`Invalid line reference @${digits}`);
    }
    const idx = n - 1;
    if (idx >= currentLineIndex) {
      throw new Error(
        `@${n} can only reference a line above the current line`,
      );
    }
    const v = lineNumericResults[idx];
    if (v === undefined || !Number.isFinite(v)) {
      throw new Error(
        `@${n} needs a finite numeric result on line ${n}`,
      );
    }
    return `(${math.format(v, { precision: 14 })})`;
  });
}

function formatValue(value: unknown): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—";
    return math.format(value, { precision: 14 });
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  try {
    return math.format(value as Parameters<typeof math.format>[0], {
      precision: 12,
    });
  } catch {
    return String(value);
  }
}

/**
 * Evaluate a PiPad-style tape top-to-bottom: assignments and variables persist;
 * `ans` is updated only when the result is a finite real number (PiPad-like).
 * A leading `#` plus an optional one-word label and whitespace is stripped
 * (e.g. `#qty 3*3` evaluates as `3*3`).
 * `@N` inserts line N's finite numeric result (only lines above the current one).
 */
export function evaluateTapeLineExpressions(rawLines: string[]): TapeLineEval[] {
  const scope: Record<string, unknown> = {};
  const results: TapeLineEval[] = [];
  const lineNumericResults: (number | undefined)[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    lineNumericResults[i] = undefined;
    const raw = rawLines[i];
    let expr = raw.trim();
    if (expr.startsWith("#")) {
      expr = expr.replace(/^\s*#\s*\S*\s*/, "").trim();
    }
    if (!expr) {
      results.push({ display: "" });
      continue;
    }

    try {
      expr = expandAtLineRefs(expr, i, lineNumericResults);
      const value = math.evaluate(expr, scope) as unknown;

      if (typeof value === "number" && Number.isFinite(value)) {
        scope.ans = value;
        lineNumericResults[i] = value;
      }

      results.push({ display: formatValue(value) });
    } catch (err) {
      results.push({
        display: "",
        error: err instanceof Error ? err.message : "Could not evaluate",
      });
    }
  }

  return results;
}
