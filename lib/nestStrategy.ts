import type { PartShape } from "@/lib/utils";
import type { NestApiSheetPayload } from "@/lib/remnantNestGeometry";
import { isRectNestSheet } from "@/lib/remnantNestGeometry";

/** User-facing nesting strategy (persisted with other nest UI settings). */
export type NestStrategyMode = "auto" | "production_batch" | "tight";

export type NestPlacementLane =
  | { kind: "full" }
  | { kind: "grid"; sheetKind: "rect" | "polygon" };

const AUTO_MIN_TOTAL_COPIES = 40;
const AUTO_MAX_UNIQUES_FOR_GRID = 8;
const AUTO_MIN_UNIQUES_FORCE_FULL = 16;

function totalPartCopies(parts: PartShape[]): number {
  return parts.reduce(
    (s, p) => s + Math.max(1, Math.floor(Number(p.quantity)) || 1),
    0,
  );
}

/**
 * Decide whether to run full NestNow on all copies vs module+grid expansion.
 */
export function selectNestPlacementLane(
  mode: NestStrategyMode,
  parts: PartShape[],
  sheets: NestApiSheetPayload[],
): NestPlacementLane {
  if (mode === "tight") {
    return { kind: "full" };
  }

  const uniqueParts = parts.length;
  const copies = totalPartCopies(parts);
  const allRect = sheets.length > 0 && sheets.every(isRectNestSheet);
  const anyPolygon = sheets.some((s) => !isRectNestSheet(s));

  if (mode === "production_batch") {
    if (allRect) return { kind: "grid", sheetKind: "rect" };
    if (anyPolygon) return { kind: "grid", sheetKind: "polygon" };
    return { kind: "full" };
  }

  // auto
  if (uniqueParts >= AUTO_MIN_UNIQUES_FORCE_FULL) {
    return { kind: "full" };
  }
  if (anyPolygon) {
    return { kind: "full" };
  }
  if (
    allRect &&
    copies >= AUTO_MIN_TOTAL_COPIES &&
    uniqueParts <= AUTO_MAX_UNIQUES_FOR_GRID
  ) {
    return { kind: "grid", sheetKind: "rect" };
  }
  return { kind: "full" };
}

/** Parts with quantity 1 each for the module nest request. */
export function partsUnitQuantities(parts: PartShape[]): PartShape[] {
  return parts.map((p) => ({ ...p, quantity: 1 }));
}
