declare module "dxf" {
  export class Helper {
    constructor(source: string);
    parsed: unknown;
    toPolylines():
      | unknown[]
      | {
          bbox?: unknown;
          polylines?: unknown[];
        };
  }
}
