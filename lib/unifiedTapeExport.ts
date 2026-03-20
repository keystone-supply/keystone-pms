import { evaluateUnifiedTape } from "@/lib/tapeCalculator";
import type { UnifiedTapeLine } from "@/lib/unifiedTapeTypes";
import { buildMaterialExport } from "@/lib/weightMaterialExport";

export function buildFullExport(lines: UnifiedTapeLine[]): string {
  const weightItems = lines
    .filter((l): l is Extract<UnifiedTapeLine, { kind: "weight" }> => l.kind === "weight")
    .map((l) => l.item);

  const parts: string[] = [];

  if (weightItems.length > 0) {
    parts.push("=== Material line items ===\n\n");
    parts.push(buildMaterialExport(weightItems));
  }

  const hasMath = lines.some((l) => l.kind === "math");
  if (hasMath) {
    parts.push("\n=== Math tape ===\n\n");
    const evals = evaluateUnifiedTape(lines);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.kind !== "math") continue;
      const e = evals[i];
      const r = e.error
        ? `=(error)`
        : e.display
          ? `=${e.display}`
          : "";
      parts.push(`${line.expr}\t${r}\n`);
    }
  }

  return parts.join("");
}

export function unifiedExportHasContent(lines: UnifiedTapeLine[]): boolean {
  return (
    lines.some((l) => l.kind === "weight") ||
    lines.some((l) => l.kind === "math" && l.expr.trim() !== "")
  );
}

export function unifiedExportFilename(lines: UnifiedTapeLine[]): string {
  const firstMath = lines.find((l) => l.kind === "math" && l.expr.trim()) as
    | Extract<UnifiedTapeLine, { kind: "math" }>
    | undefined;
  const firstWeight = lines.find((l) => l.kind === "weight");
  const base =
    firstMath?.expr.trim().slice(0, 40) ||
    firstWeight?.item.notes?.trim() ||
    firstWeight?.item.materialName ||
    "shop-tape";
  const sanitized = base
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${sanitized || "shop-tape"}-${stamp}.txt`;
}
