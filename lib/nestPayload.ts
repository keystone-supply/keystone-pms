export type NestPlacementType = "gravity" | "box" | "convexhull";

/** Fields edited in the Nest tab; persisted to localStorage (subset). */
export interface NestUiSettings {
  spacing: number;
  rotations: number;
  placementType: NestPlacementType;
  mergeLines: boolean;
  /** Client-side best-of-N: shuffle part order per attempt (1 = single run). */
  attempts: number;
  curveTolerance: number;
  simplify: boolean;
  clipperScale: number;
}

export const NEST_ROTATION_OPTIONS = [1, 2, 4, 8, 16] as const;

export const DEFAULT_NEST_UI_SETTINGS: NestUiSettings = {
  spacing: 0,
  rotations: 4,
  placementType: "gravity",
  mergeLines: true,
  attempts: 1,
  curveTolerance: 0.3,
  simplify: false,
  clipperScale: 10_000_000,
};

const STORAGE_KEY = "keystone-nest-config";

export function loadNestUiSettings(): NestUiSettings {
  if (typeof window === "undefined") return DEFAULT_NEST_UI_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_NEST_UI_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<NestUiSettings>;
    return { ...DEFAULT_NEST_UI_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_NEST_UI_SETTINGS;
  }
}

export function saveNestUiSettings(settings: NestUiSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota */
  }
}

/** Body.config sent to NestNow (merged server-side with DEFAULT_CONFIG). */
export function buildApiNestConfig(s: NestUiSettings) {
  return {
    spacing: s.spacing,
    rotations: s.rotations,
    placementType: s.placementType,
    mergeLines: s.mergeLines,
    curveTolerance: s.curveTolerance,
    simplify: s.simplify,
    clipperScale: s.clipperScale,
  };
}

export function shufflePartsOrder<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
