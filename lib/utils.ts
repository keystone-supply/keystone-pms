import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface Remnant {
  id: string;
  img_url?: string;
  svg_path?: string; // e.g., "M10 10 L20 30 ... Z"
  dims?: string;
  material: string;
  thickness_in: number;
  est_weight_lbs: number;
  status: "Available" | "Allocated";
}

const DENSITIES = {
  // lb/in³
  "A36 Steel": 0.283,
  "304 SS": 0.289,
  // ...
};

export function calcPolygonArea(points: number[][]): number {
  // Shoelace
  const n = points.length;
  return (
    Math.abs(
      points.reduce(
        (sum, [x, y], i) =>
          sum +
          (points[(i + 1) % n][0] * y - points[i][1] * points[(i + 1) % n][0]),
        0,
      ),
    ) / 2
  );
}

export function calcWeight(
  areaIn2: number,
  thicknessIn: number,
  material: string,
): number {
  const density = DENSITIES[material as keyof typeof DENSITIES] || 0.283;
  return +(areaIn2 * thicknessIn * density).toFixed(1);
}

// Mock for demo: Random polygon SVG path
export function genMockSVG(width = 100, height = 50): string {
  const points = [
    [0, 0],
    [width, 0],
    [width * 0.8, height],
    [width * 0.2, height],
  ];
  return `M${points.map(([x, y]) => `${x},${y}`).join(" L")} Z`;
}
