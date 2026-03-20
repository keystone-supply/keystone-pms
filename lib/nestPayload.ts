export type NestPlacementType = "gravity" | "box" | "convexhull";

/** Fields edited in the Nest tab; persisted to localStorage (subset). */
export interface NestUiSettings {
  spacing: number;
  rotations: number;
  placementType: NestPlacementType;
  mergeLines: boolean;
  /**
   * Run the full NestNow search this many times (independent attempts); UI keeps
   * the best layout.
   */
  attempts: number;
  curveTolerance: number;
  simplify: boolean;
  clipperScale: number;
  /** Layouts evaluated in parallel per round (≥2 enables multi-layout search). */
  populationSize: number;
  /** How often the search randomly shuffles order/angles between rounds. */
  mutationRate: number;
  gaGenerations: number;
  /** When merge-lines is on: weight shared cuts vs raw material usage. */
  timeRatio: number;
  /** Drawing unit scale for shared-edge detection (NestNow default 72). */
  scale: number;
  /**
   * Max time (seconds) NestNow may spend on one HTTP /nest attempt before timing out.
   * Sent as `requestTimeoutMs` on the API body; capped at 1 hour in NestNow.
   */
  requestTimeoutSec: number;
}

export const NEST_ROTATION_OPTIONS = [1, 2, 4, 8, 16] as const;

/** Min/max seconds for NestNow per-request timeout (server clamps body to this range). */
export const NEST_REQUEST_TIMEOUT_SEC_MIN = 60;
export const NEST_REQUEST_TIMEOUT_SEC_MAX = 3600;

export function clampNestRequestTimeoutSec(sec: number): number {
  const n = Math.floor(Number(sec));
  if (!Number.isFinite(n)) return DEFAULT_NEST_UI_SETTINGS.requestTimeoutSec;
  return Math.max(
    NEST_REQUEST_TIMEOUT_SEC_MIN,
    Math.min(NEST_REQUEST_TIMEOUT_SEC_MAX, n),
  );
}

export const DEFAULT_NEST_UI_SETTINGS: NestUiSettings = {
  spacing: 0,
  rotations: 4,
  placementType: "gravity",
  mergeLines: true,
  attempts: 1,
  curveTolerance: 0.3,
  simplify: false,
  clipperScale: 10_000_000,
  populationSize: 10,
  mutationRate: 10,
  gaGenerations: 3,
  timeRatio: 0.5,
  scale: 72,
  /** 10 minutes — large part counts often need more than NestNow’s 5‑minute env default. */
  requestTimeoutSec: 600,
};

const STORAGE_KEY = "keystone-nest-config";

export function loadNestUiSettings(): NestUiSettings {
  if (typeof window === "undefined") return DEFAULT_NEST_UI_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_NEST_UI_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<NestUiSettings>;
    const merged = { ...DEFAULT_NEST_UI_SETTINGS, ...parsed };
    merged.requestTimeoutSec = clampNestRequestTimeoutSec(
      merged.requestTimeoutSec ?? DEFAULT_NEST_UI_SETTINGS.requestTimeoutSec,
    );
    return merged;
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
    populationSize: Math.max(1, Math.floor(s.populationSize) || 10),
    mutationRate: Math.max(0, Math.floor(s.mutationRate) || 10),
    gaGenerations: Math.max(1, Math.floor(s.gaGenerations) || 3),
    timeRatio: s.timeRatio,
    scale: s.scale,
  };
}
