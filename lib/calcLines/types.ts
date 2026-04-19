export type ProjectCalcLineKind = "material" | "math" | "note";

export type ProjectCalcTapeSource = "weight_calc" | "pipad" | "manual";

export type ProjectCalcTapeRow = {
  id: string;
  project_id: string;
  name: string;
  source: ProjectCalcTapeSource;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const PROJECT_CALC_TAPE_SELECT =
  "id,project_id,name,source,created_by,created_at,updated_at";

export type ProjectCalcLineRow = {
  id: string;
  project_id: string;
  tape_id: string;
  position: number;
  kind: ProjectCalcLineKind;
  description: string;
  qty: number;
  uom: string;
  notes: string;
  material_key: string | null;
  material_name: string | null;
  shape: string | null;
  length_in: number | null;
  dim1: number | null;
  dim2: number | null;
  density: number | null;
  cost_per_lb: number | null;
  sell_per_lb: number | null;
  unit_weight_lb: number | null;
  unit_cost: number | null;
  total_weight_lb: number | null;
  total_cost: number | null;
  total_sell: number | null;
  expr: string | null;
  expr_display: string | null;
  expr_error: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export const PROJECT_CALC_LINE_SELECT =
  "id,project_id,tape_id,position,kind,description,qty,uom,notes,material_key,material_name,shape,length_in,dim1,dim2,density,cost_per_lb,sell_per_lb,unit_weight_lb,unit_cost,total_weight_lb,total_cost,total_sell,expr,expr_display,expr_error,payload,created_at,updated_at";

export type ProjectCalcTapeInsert = Pick<
  ProjectCalcTapeRow,
  "project_id" | "name" | "source" | "created_by"
>;

export type ProjectCalcLineInsert = Omit<
  ProjectCalcLineRow,
  "id" | "created_at" | "updated_at"
>;
