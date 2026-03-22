import type { NestStrategyMode } from "@/lib/nestStrategy";

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
  /**
   * When set to a localhost NestNow base URL (e.g. http://127.0.0.1:3001), the browser
   * calls NestNow directly (CORS). Empty string uses Next.js `/api/nest` proxy.
   */
  directNestNowUrl: string;
  /**
   * auto: grid when many copies + rect sheet; full GA/NFP for irregular sheets or small batches.
   * production_batch: module + grid on rect or polygon sheet when possible.
   * tight: always full NestNow job with part quantities as given.
   */
  nestStrategy: NestStrategyMode;
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
  curveTolerance: 0.005,
  simplify: false,
  clipperScale: 10_000_000,
  populationSize: 100,
  mutationRate: 10,
  gaGenerations: 100,
  timeRatio: 0.5,
  scale: 72,
  /** 1 hour — matches NestNow / UI max per evaluation. */
  requestTimeoutSec: 3600,
  directNestNowUrl: "",
  nestStrategy: "auto",
};

/** Fast smoke nest: fewer rotations, single GA generation, small population. */
export const NEST_PRESET_PREVIEW_FIELDS: Partial<NestUiSettings> = {
  populationSize: 4,
  gaGenerations: 1,
  attempts: 1,
  rotations: 2,
};

/** Quality preset: matches app default search tuning. */
export const NEST_PRESET_FINAL_FIELDS: Partial<NestUiSettings> = {
  populationSize: 100,
  gaGenerations: 100,
  attempts: 1,
  rotations: 4,
};

/** Module-only nest before grid expansion (NestNow defaults–scale GA). */
export const NEST_PRESET_MODULE_FIELDS: Partial<NestUiSettings> = {
  populationSize: 10,
  gaGenerations: 3,
  attempts: 1,
  rotations: 4,
};

/** Allow only http localhost so “direct” mode cannot point at arbitrary hosts. */
export function sanitizeDirectNestNowUrl(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return "";
  try {
    const u = new URL(t);
    if (u.protocol !== "http:") return "";
    const h = u.hostname.toLowerCase();
    if (h !== "127.0.0.1" && h !== "localhost") return "";
    return `${u.protocol}//${u.host}`.replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function nestNowEndpoints(directRaw: string): {
  nest: string;
  stop: string;
  progress: string;
  isDirect: boolean;
} {
  const base = sanitizeDirectNestNowUrl(directRaw);
  if (base) {
    return {
      nest: `${base}/nest`,
      stop: `${base}/stop`,
      progress: `${base}/progress`,
      isDirect: true,
    };
  }
  return {
    nest: "/api/nest",
    stop: "/api/nest/stop",
    progress: "/api/nest/progress",
    isDirect: false,
  };
}

const STORAGE_KEY = "keystone-nest-config";

export function loadNestUiSettings(): NestUiSettings {
  if (typeof window === "undefined") return DEFAULT_NEST_UI_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const h = window.location.hostname.toLowerCase();
      if (h === "localhost" || h === "127.0.0.1") {
        return {
          ...DEFAULT_NEST_UI_SETTINGS,
          directNestNowUrl: "http://127.0.0.1:3001",
        };
      }
      return DEFAULT_NEST_UI_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<NestUiSettings>;
    const merged = { ...DEFAULT_NEST_UI_SETTINGS, ...parsed };
    merged.requestTimeoutSec = clampNestRequestTimeoutSec(
      merged.requestTimeoutSec ?? DEFAULT_NEST_UI_SETTINGS.requestTimeoutSec,
    );
    merged.directNestNowUrl =
      typeof merged.directNestNowUrl === "string"
        ? merged.directNestNowUrl
        : DEFAULT_NEST_UI_SETTINGS.directNestNowUrl;
    const strat = merged.nestStrategy;
    merged.nestStrategy =
      strat === "production_batch" || strat === "tight" || strat === "auto"
        ? strat
        : DEFAULT_NEST_UI_SETTINGS.nestStrategy;
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
