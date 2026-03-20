import type { TapeItem } from "@/lib/weightTapeTypes";

export type UnifiedMathLine = {
  id: string;
  kind: "math";
  expr: string;
};

export type UnifiedWeightLine = {
  id: string;
  kind: "weight";
  item: TapeItem;
  calculationText: string;
};

export type UnifiedTapeLine = UnifiedMathLine | UnifiedWeightLine;
