import type {
  CostKey,
  MaterialInfo,
  MaterialKey,
  Shape,
} from "@/lib/weightTapeTypes";

export const VIKING_SELL_PER_LB = 6;
export const HIACE_SELL_PER_LB = 3.25;
export const STANDARD_SELL_MULTIPLIER = 1.3;

export const materialDensities: Record<MaterialKey, MaterialInfo> = {
  al: { name: "Aluminum 6061", density: 0.098 },
  cs: { name: "Mild A36", density: 0.284 },
  ar500: { name: "AR500", density: 0.295 },
  viking: { name: "Viking", density: 0.303 },
  "304ss": { name: "304 SS", density: 0.295 },
  hiace: { name: "HiAce", density: 0.295 },
};

export const shapes: Shape[] = [
  {
    value: "square",
    label: "Rectangle / Plate",
    dimLabel1: "Width (in)",
    dimLabel2: "Thickness (in)",
    hasDim2: true,
  },
  {
    value: "round",
    label: "Solid Round",
    dimLabel1: "Diameter (in)",
    dimLabel2: null,
    hasDim2: false,
  },
  {
    value: "tube",
    label: "Hollow Tube",
    dimLabel1: "OD (in)",
    dimLabel2: "Wall Thickness (in)",
    hasDim2: true,
  },
];

export const costs: Record<CostKey, number> = {
  mild: 0.65,
  ar500: 1.75,
  viking: 3.03,
  aluminum: 6.0,
  "304ss": 3.5,
  hiace: 2.1,
};

export const materialOrder: Record<MaterialKey, number> = {
  cs: 0,
  ar500: 1,
  viking: 2,
  hiace: 3,
  "304ss": 4,
  al: 5,
};

export const materialCostOptions: {
  costKey: CostKey;
  materialKey: MaterialKey;
  label: string;
}[] = [
  { costKey: "mild", materialKey: "cs", label: "Mild A36" },
  { costKey: "ar500", materialKey: "ar500", label: "AR500" },
  { costKey: "viking", materialKey: "viking", label: "Viking" },
  { costKey: "hiace", materialKey: "hiace", label: "HiAce" },
  { costKey: "aluminum", materialKey: "al", label: "Aluminum 6061" },
  { costKey: "304ss", materialKey: "304ss", label: "304 SS" },
];
