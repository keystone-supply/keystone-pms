export type MaterialKey = "al" | "cs" | "ar500" | "viking" | "304ss" | "hiace";

export type ShapeValue = "round" | "square" | "tube";

export type CostKey = "mild" | "ar500" | "viking" | "aluminum" | "304ss" | "hiace";

export interface MaterialInfo {
  name: string;
  density: number;
}

export interface Shape {
  value: ShapeValue;
  label: string;
  dimLabel1: string;
  dimLabel2: string | null;
  hasDim2: boolean;
}

export interface TapeItem {
  id: string;
  notes: string;
  material: MaterialKey;
  materialName: string;
  density: number;
  shape: ShapeValue;
  lengthIn: number;
  dim1: number;
  dim2: number;
  thickness: number;
  costPerLb: number;
  sellPerLb?: number;
  quantity: number;
}
