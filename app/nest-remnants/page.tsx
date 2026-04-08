"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
  forwardRef,
  useImperativeHandle,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  Package,
  Layers,
  Search,
  Filter,
  Plus,
  Edit,
  Trash2,
  Upload,
  Zap,
  Loader2,
  AlertCircle,
  X,
  ChevronRight,
  ChevronDown,
  Minus,
  LayoutGrid,
  Table2,
  Percent,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  HardDriveDownload,
  CloudUpload,
} from "lucide-react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { QuickLinksBar } from "@/components/dashboard/quick-links-bar";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { supabase } from "@/lib/supabaseClient";
import {
  aggregateDashboardMetrics,
  type DashboardProjectRow,
} from "@/lib/dashboardMetrics";
import { PROJECT_SELECT } from "@/lib/projectQueries";
import { canRunNesting, normalizeAppRole } from "@/lib/auth/roles";
import {
  type Remnant,
  type PartShape,
  parseRemnantDims,
  placeOutline,
  placeHoles,
  calcWeight,
  rectOutline,
  circleOutline,
  ringOutline,
  getPartDims,
  formatPartDims,
} from "@/lib/utils";
import { MATERIAL_NAMES } from "@/lib/materials";
import {
  type NestPlacementType,
  type NestUiSettings,
  loadNestUiSettings,
  saveNestUiSettings,
  buildApiNestConfig,
  clampNestRequestTimeoutSec,
  nestNowEndpoints,
  NEST_PRESET_FINAL_FIELDS,
  NEST_PRESET_EXPLORE_FIELDS,
  NEST_PRESET_REFINE_FIELDS,
  NEST_PRESET_PREVIEW_FIELDS,
  NEST_REQUEST_TIMEOUT_SEC_MAX,
  NEST_REQUEST_TIMEOUT_SEC_MIN,
  NEST_PRESET_MODULE_FIELDS,
  NEST_ROTATION_OPTIONS,
  sanitizeDirectNestNowUrl,
} from "@/lib/nestPayload";
import {
  remnantToNestSheet,
  nestSheetPreviewDimensions,
  nestSheetPayloadToPreviewOutline,
  type NestApiSheetPayload,
  isRectNestSheet,
} from "@/lib/remnantNestGeometry";
import {
  selectNestPlacementLane,
  partsUnitQuantities,
} from "@/lib/nestStrategy";
import {
  buildNestSheetDxf,
  nestDxfFilename,
} from "@/lib/nestDxfExport";
import { uploadDxfToProjectCad } from "@/lib/onedrive";
import {
  expandModuleToGrid,
  type NestGridMetadata,
} from "@/lib/nestGridExpand";
import { NestFieldHelp, NestLabelWithHelp } from "@/lib/nestHelp";

/** UI caps for advanced nest fields (keep in sync with inputs and `handleGenerateNest`). */
const NEST_UI_MAX_SEPARATE_ATTEMPTS = 30;
const NEST_UI_MAX_POPULATION_SIZE = 100000;
const NEST_UI_MAX_MUTATION_RATE = 1000;
const NEST_UI_MAX_GA_GENERATIONS = 100000;

type SheetPlacement = {
  filename?: string;
  id?: number;
  rotation?: number;
  source?: number;
  x?: number;
  y?: number;
};
/** One gene from NestNow: `{ id, outline }` preserves GA order over JSON; legacy ring arrays are older shape. */
type NestChromosomeGene =
  | { id: number; source?: number; outline: { x: number; y: number }[] }
  | { x: number; y: number }[];

/** GA individual snapshot for Phase 2 seeding (NestNow ≥ chromosome support). */
type NestChromosome = {
  placement: NestChromosomeGene[];
  rotation: number[];
};

type NestResult = {
  fitness: number;
  area: number;
  totalarea: number;
  mergedLength: number;
  utilisation: number;
  placements: { sheet: number; sheetid: unknown; sheetplacements: SheetPlacement[] }[];
  /** Top alternative layouts from one NestNow run (lower fitness is better); index 0 matches top-level fields. */
  candidates?: NestResult[];
  /** Optional GA chromosome for re-seeding a later Refine run. */
  chromosome?: NestChromosome;
  /** Set when result came from production grid expansion. */
  nestStrategyMeta?: NestGridMetadata;
};

/** `/api/nest` may add these for debugging timeouts (see `app/api/nest/route.ts`). */
type NestApiResponse = NestResult &
  Partial<{
    error: string;
    /** Technical detail for IT; safe to show in an expandable panel. */
    adminHint: string;
    proxyDurationMs: number;
    nestNowHttpStatus: number;
    stage: string;
    /** NestNow server mode: timeout | no_layout | placement_failed | stopped | exception */
    failureKind: string;
    /** Wall time for the NestNow /nest job (ms), from NestNow JSON. */
    nestNowDurationMs: number;
    /** Layout evaluations run in the failed NestNow job (GA or single). */
    evalCount: number;
    populationSize: number;
    gaGenerations: number;
    /** Last worker error string from a failed evaluation (NestNow 500). */
    lastEvalError: string;
    /** Progress snapshot when the job failed without a final layout (rare). */
    bestEffort: NestResult;
  }>;

function stripNestApiDiagnostics(raw: NestApiResponse): NestResult {
  const {
    proxyDurationMs: _p,
    nestNowHttpStatus: _n,
    stage: _s,
    error: _e,
    adminHint: _ah,
    failureKind: _fk,
    nestNowDurationMs: _nnd,
    evalCount: _ec,
    populationSize: _ps,
    gaGenerations: _gg,
    lastEvalError: _lee,
    bestEffort: _be,
    candidates: rawCandidates,
    ...nest
  } = raw;
  const out = nest as NestResult;
  if (Array.isArray(rawCandidates) && rawCandidates.length > 0) {
    out.candidates = rawCandidates.map((c) => {
      const row = c as NestApiResponse;
      const {
        proxyDurationMs: __p,
        nestNowHttpStatus: __n,
        stage: __s,
        error: __e,
        adminHint: __ah,
        failureKind: __fk,
        nestNowDurationMs: __nnd,
        evalCount: __ec,
        populationSize: __ps,
        gaGenerations: __gg,
        lastEvalError: __lee,
        bestEffort: __be,
        candidates: __nested,
        ...rest
      } = row;
      return rest as NestResult;
    });
  }
  return out;
}

const NEST_SEED_FITNESS_EPS = 1e-6;
const NEST_SEEDS_STORAGE_PREFIX = "keystone-nest-seeds:v1:";

/** One distinct layout kept for Explore → Refine (preview + optional chromosome). */
type NestSeedEntry = {
  fitness: number;
  utilisation: number;
  mergedLength: number;
  area: number;
  totalarea: number;
  placements: NestResult["placements"];
  attemptLabel?: string;
  chromosome?: NestChromosome;
};

function nestJobFingerprint(
  sheets: NestApiSheetPayload[],
  parts: NestApiPartPayload[],
): string {
  const encSheet = (s: NestApiSheetPayload) =>
    isRectNestSheet(s)
      ? `R${s.width}:${s.height}:${s.quantity ?? 1}`
      : `P${s.outline?.length ?? 0}`;
  const encPart = (p: NestApiPartPayload) =>
    `${p.outline.length}q${p.quantity ?? 1}h${p.holes?.length ?? 0}`;
  return `${sheets.map(encSheet).join(";")}|${parts.map(encPart).join(";")}`;
}

function nestResultRowsForSeeds(data: NestResult): NestResult[] {
  const rows: NestResult[] = [];
  const add = (r: NestResult) => {
    if (
      typeof r.fitness === "number" &&
      Number.isFinite(r.fitness) &&
      Array.isArray(r.placements)
    ) {
      rows.push(r);
    }
  };
  add(data);
  if (Array.isArray(data.candidates)) {
    for (const c of data.candidates) add(c);
  }
  return rows;
}

function nestResultToSeedEntry(
  r: NestResult,
  attemptLabel?: string,
): NestSeedEntry {
  return {
    fitness: r.fitness,
    utilisation: r.utilisation,
    mergedLength: r.mergedLength,
    area: r.area,
    totalarea: r.totalarea,
    placements: r.placements,
    attemptLabel,
    chromosome: r.chromosome,
  };
}

function mergeTopNestSeeds(
  prev: NestSeedEntry[],
  data: NestResult,
  attemptLabel?: string,
): NestSeedEntry[] {
  const incoming = nestResultRowsForSeeds(data).map((r) =>
    nestResultToSeedEntry(r, attemptLabel),
  );
  const all = [...prev, ...incoming];
  all.sort((a, b) => a.fitness - b.fitness);
  const out: NestSeedEntry[] = [];
  for (const row of all) {
    if (
      out.some(
        (o) => Math.abs(o.fitness - row.fitness) < NEST_SEED_FITNESS_EPS,
      )
    ) {
      continue;
    }
    out.push(row);
    if (out.length >= 3) break;
  }
  return out;
}

function loadNestSeedsFromStorage(fp: string): NestSeedEntry[] {
  if (typeof window === "undefined" || !fp) return [];
  try {
    const raw = window.localStorage.getItem(NEST_SEEDS_STORAGE_PREFIX + fp);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x) =>
        x &&
        typeof x === "object" &&
        typeof (x as NestSeedEntry).fitness === "number",
    ) as NestSeedEntry[];
  } catch {
    return [];
  }
}

function saveNestSeedsToStorage(fp: string, seeds: NestSeedEntry[]) {
  if (typeof window === "undefined" || !fp) return;
  try {
    window.localStorage.setItem(
      NEST_SEEDS_STORAGE_PREFIX + fp,
      JSON.stringify(seeds),
    );
  } catch {
    /* ignore quota */
  }
}

/** Context for IT quick read (path + browser-measured POST duration). */
type NestFailureContext = {
  nestPath: "direct" | "proxy";
  clientRequestDurationMs?: number;
  responseParseError?: string;
};

/** True when the server error is likely NestNow’s per-eval timeout, not a network/proxy cut. */
function looksLikeNestEvalTimeoutMessage(message: string): boolean {
  const m = message.toLowerCase().trim();
  if (
    m.includes("connection") ||
    m.includes("network") ||
    m.includes("econnrefused") ||
    m.includes("failed to fetch") ||
    m.includes("load failed")
  ) {
    return false;
  }
  // Legacy generic NestNow 500 copy — not a real timeout signal
  if (m === "nesting failed or timed out") return false;
  if (m.includes("nesting timed out")) return true;
  if (m.includes("nest request timed out")) return true;
  if (/\btimed out after\b/.test(m)) return true;
  return false;
}

function nestFailureIsFastNoSuccess(raw: NestApiResponse): boolean {
  const fk =
    typeof raw.failureKind === "string" ? raw.failureKind.trim() : "";
  if (fk === "timeout" || fk === "stopped" || fk === "exception") {
    return false;
  }
  const n = raw.nestNowDurationMs;
  if (typeof n !== "number" || !Number.isFinite(n) || n >= 8000) {
    return false;
  }
  return fk === "no_layout" || fk === "placement_failed";
}

function formatProxyDurationForIt(ms: number): string {
  const n = Math.max(0, ms);
  const sec = n / 1000;
  const secLabel = sec < 10 ? sec.toFixed(2) : sec.toFixed(1);
  return `${Math.round(n)} ms (~${secLabel}s)`;
}

function proxyDurationFailureBucket(
  ms: number | undefined,
): "unknown" | "instant" | "mid" | "hosting60" | "veryLong" {
  if (ms == null || !Number.isFinite(ms)) return "unknown";
  if (ms < 3000) return "instant";
  if (ms >= 55_000 && ms <= 75_000) return "hosting60";
  if (ms >= 3500 * 1000) return "veryLong";
  return "mid";
}

function nestTimingHintLines(
  labelMs: number,
  forProxyPath: boolean,
): string[] {
  const bucket = proxyDurationFailureBucket(labelMs);
  if (bucket === "instant") {
    return [
      `Timing (${forProxyPath ? "proxy" : "client"}): instant/sub‑3s (not a ~60s proxy cut — check NestNow up, 503 worker race, or payload 400).`,
    ];
  }
    if (bucket === "hosting60") {
    return [
      `Timing (${forProxyPath ? "proxy" : "client"}): ~60s window — often reverse-proxy/hosting read timeout${
        forProxyPath ? " on /api/nest" : " (browser clock; compare proxyDurationMs when using app proxy)"
      }.`,
    ];
  }
  if (bucket === "veryLong") {
    return [
      `Timing (${forProxyPath ? "proxy" : "client"}): very long — near max serverless route duration or huge nest run.`,
    ];
  }
  if (bucket === "mid") {
    return [
      `Timing (${forProxyPath ? "proxy" : "client"}): mid — NestNow ran a while before failing.`,
    ];
  }
  return [];
}

/** Structured lines for “Details for IT” (timing bucket, status codes, proxy ms). */
function buildNestItQuickRead(
  res: Response,
  raw: NestApiResponse,
  ctx: NestFailureContext,
): string {
  const lines: string[] = ["--- IT quick read ---"];
  lines.push(
    ctx.nestPath === "direct"
      ? "Nest request path: direct (browser → NestNow; no Next.js proxy)"
      : "Nest request path: app proxy (browser → /api/nest → NestNow)",
  );
  lines.push(`Client HTTP status: ${res.status}`);

  if (ctx.responseParseError) {
    lines.push(
      `Response body: not valid JSON (${ctx.responseParseError}) — often HTML error page from host/proxy.${
        res.ok ? " Unexpected on HTTP 200." : ""
      }`,
    );
  }

  const cr = ctx.clientRequestDurationMs;
  if (typeof cr === "number" && Number.isFinite(cr)) {
    lines.push(`clientRequestDurationMs: ${formatProxyDurationForIt(cr)}`);
    lines.push(...nestTimingHintLines(cr, false));
  }

  const nns = raw.nestNowHttpStatus;
  if (typeof nns === "number" && Number.isFinite(nns)) {
    lines.push(`NestNow upstream HTTP status: ${nns}`);
  }

  const fk =
    typeof raw.failureKind === "string" && raw.failureKind.trim()
      ? raw.failureKind.trim()
      : "";
  if (fk) {
    lines.push(`failureKind: ${fk}`);
  }

  const nnd = raw.nestNowDurationMs;
  if (typeof nnd === "number" && Number.isFinite(nnd)) {
    lines.push(`nestNowDurationMs: ${formatProxyDurationForIt(nnd)}`);
  }

  const pdm = raw.proxyDurationMs;
  if (typeof pdm === "number" && Number.isFinite(pdm)) {
    lines.push(`proxyDurationMs: ${formatProxyDurationForIt(pdm)}`);
    const bucket = proxyDurationFailureBucket(pdm);
    if (bucket === "instant") {
      lines.push(
        "Timing (proxy): instant/sub‑3s (not a ~60s proxy cut — check NestNow up, 503 worker race, or payload 400).",
      );
    } else if (bucket === "hosting60") {
      lines.push(
        "Timing (proxy): ~60s window — often reverse-proxy/hosting read timeout on /api/nest.",
      );
    } else if (bucket === "veryLong") {
      lines.push(
        "Timing (proxy): very long — near max serverless route duration or huge nest run.",
      );
    } else if (bucket === "mid") {
      lines.push("Timing (proxy): mid — NestNow ran a while before failing.");
    }
  } else {
    lines.push(
      "proxyDurationMs: (not reported — direct NestNow, Next connect error without JSON, or non-JSON error body)",
    );
  }

  if (typeof raw.stage === "string" && raw.stage.trim()) {
    lines.push(`stage: ${raw.stage.trim()}`);
  }

  if (typeof raw.evalCount === "number" && Number.isFinite(raw.evalCount)) {
    lines.push(`evalCount: ${raw.evalCount}`);
  }
  if (
    typeof raw.populationSize === "number" &&
    Number.isFinite(raw.populationSize)
  ) {
    lines.push(`populationSize: ${raw.populationSize}`);
  }
  if (
    typeof raw.gaGenerations === "number" &&
    Number.isFinite(raw.gaGenerations)
  ) {
    lines.push(`gaGenerations: ${raw.gaGenerations}`);
  }
  if (
    typeof raw.lastEvalError === "string" &&
    raw.lastEvalError.trim().length > 0
  ) {
    lines.push(`lastEvalError: ${raw.lastEvalError.trim()}`);
  }
  if (
    raw.bestEffort &&
    typeof raw.bestEffort === "object" &&
    Array.isArray(raw.bestEffort.placements) &&
    raw.bestEffort.placements.length > 0
  ) {
    lines.push(
      "bestEffort: present (partial layout in JSON — check network response)",
    );
  }

  lines.push("---------------------");
  return lines.join("\n");
}

/** Proxy / NestNow job timing for IT (supplements quick read; failureKind is only in quick read). */
function buildNestAdminDiagnostics(
  proxyDurationMs?: number,
  nestNowDurationMs?: number,
): string {
  const parts: string[] = [];
  if (proxyDurationMs != null && Number.isFinite(proxyDurationMs)) {
    const ms = Math.max(0, proxyDurationMs);
    const sec = ms / 1000;
    const durationLabel =
      ms < 1000
        ? `${sec.toFixed(2)}s`
        : ms < 10_000
          ? `${sec.toFixed(1)}s`
          : `${sec.toFixed(0)}s`;
    let tail = `Next.js proxy duration ${durationLabel}`;
    if (ms >= 55_000 && ms <= 75_000) {
      tail += " (often a ~60s reverse-proxy or hosting limit)";
    } else if (ms >= 3500 * 1000) {
      tail +=
        " (near max route duration — reduce search settings or raise platform limits)";
    } else if (ms > 0 && ms < 3000) {
      tail += " (instant failure — not NestNow’s long eval timeout)";
    }
    parts.push(tail);
  }
  if (nestNowDurationMs != null && Number.isFinite(nestNowDurationMs)) {
    const s = nestNowDurationMs / 1000;
    const label = s < 10 ? s.toFixed(2) : s.toFixed(1);
    parts.push(`NestNow job wall time ~${label}s (nestNowDurationMs)`);
  }
  return parts.join(" · ");
}

/** Human-readable cap for one NestNow layout evaluation (matches requestTimeoutSec). */
function formatNestMaxEvalTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.round((s % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r > 0 ? `${m}m ${r}s` : `${m} min`;
  }
  return `${s}s`;
}

function parseNestFailure(
  res: Response,
  raw: NestApiResponse,
  ctx: NestFailureContext,
): { userMessage: string; adminDetail: string } {
  const base =
    typeof raw.error === "string"
      ? raw.error
      : res.statusText || "Nesting failed";

  let userMessage = base;
  if (res.status === 503) {
    userMessage = base.trim().length
      ? `${base.trim()} Try Generate Nest again in a moment.`
      : "The nesting service is busy or still starting. Try Generate Nest again in a moment.";
  } else {
    const fastNoSuccess = nestFailureIsFastNoSuccess(raw);
    if (!fastNoSuccess && looksLikeNestEvalTimeoutMessage(base)) {
      userMessage = `${base} You can raise “Max time per layout try” under More tuning, or use a simpler Preview preset.`;
    }
    if (raw.failureKind === "timeout") {
      userMessage = `${userMessage} (NestNow reported timeout — increase “Max time per layout try” or simplify the job.)`;
    }
    if (fastNoSuccess) {
      userMessage = `${userMessage} NestNow finished this attempt in under a few seconds (see nestNowDurationMs in Details for IT) — that usually means no valid layout was found, not a long timeout.`;
    }
    const pdm = raw.proxyDurationMs;
    if (typeof pdm === "number" && pdm >= 55_000 && pdm <= 75_000) {
      userMessage = `${userMessage} If you use the app proxy, a ~60s hosting limit may be cutting off /api/nest — try Direct NestNow (localhost) or ask IT to raise the proxy read timeout.`;
    }
    const cr = ctx.clientRequestDurationMs;
    if (
      ctx.nestPath === "proxy" &&
      typeof cr === "number" &&
      cr >= 55_000 &&
      cr <= 75_000 &&
      !(typeof pdm === "number" && pdm >= 55_000 && pdm <= 75_000)
    ) {
      userMessage = `${userMessage} Client saw ~60s — likely a hosting/proxy read timeout on /api/nest; ask IT to raise the limit or use Direct NestNow.`;
    }
  }

  const quick = buildNestItQuickRead(res, raw, ctx);
  const diag = buildNestAdminDiagnostics(
    raw.proxyDurationMs,
    raw.nestNowDurationMs,
  );
  const hint =
    typeof raw.adminHint === "string" && raw.adminHint.trim().length > 0
      ? raw.adminHint.trim()
      : base;
  const adminDetail = [quick, hint, diag].filter(Boolean).join("\n\n");
  return { userMessage, adminDetail };
}

/** Only retry another full attempt on likely-transient gateway errors. */
function shouldAbortMultiAttemptNest(status: number): boolean {
  if (status === 502 || status === 504) return false;
  return status >= 400;
}

/**
 * When using multiple “Separate full attempts”, keep going after NestNow 500
 * for no_layout / placement_failed (same idea as clicking Generate again).
 */
function shouldRetryNestOnRecoverableFailure(
  status: number,
  raw: NestApiResponse,
  attempt: number,
  maxAttempts: number,
): boolean {
  if (attempt >= maxAttempts) return false;
  if (status !== 500) return false;
  const fk =
    typeof raw.failureKind === "string" ? raw.failureKind.trim() : "";
  return fk === "no_layout" || fk === "placement_failed";
}

/** Small jitter before another full /nest POST so we don’t hammer the worker. */
const NEST_RETRY_BACKOFF_MIN_MS = 120;
const NEST_RETRY_BACKOFF_EXTRA_MS = 380;

const NEST_POST_503_MAX_TRIES = 5;
const NEST_POST_503_BACKOFF_MS = [400, 800, 1200, 2000, 3200];
/** Keep loading UI visible at least this long so fast failures still show a spinner (ms). */
const NEST_LOADING_MIN_VISIBLE_MS = 480;

/**
 * POST /nest with retries for transient 503 (worker recycling / “still in progress”).
 * On 503, optionally POST /stop to clear NestNow, then exponential backoff — avoids
 * racing /nest immediately after /stop recreates the Electron worker.
 */
async function postNestWith503Retry(
  nestUrl: string,
  payloadObj: object,
  stopUrl?: string,
): Promise<Response> {
  const body = JSON.stringify(payloadObj);
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  };

  let lastRes: Response | null = null;
  for (let i = 0; i < NEST_POST_503_MAX_TRIES; i++) {
    lastRes = await fetch(nestUrl, init);
    if (lastRes.status !== 503) {
      return lastRes;
    }
    if (i < NEST_POST_503_MAX_TRIES - 1) {
      await lastRes.text().catch(() => {});
      if (stopUrl) {
        try {
          await fetch(stopUrl, { method: "POST" });
        } catch {
          /* ignore */
        }
      }
      const delayMs = NEST_POST_503_BACKOFF_MS[i] ?? 400;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return lastRes!;
}

type NestProgressApi = {
  busy?: boolean;
  placement?: { index: number; progress: number } | null;
  ga?: {
    gen: number;
    generations: number;
    idx: number;
    pop: number;
    evalCount: number;
  } | null;
  /** Genetic search: best layout so far this HTTP job (same core fields as POST /nest). */
  bestSoFar?: NestResult | null;
  /** Server-reported progress timestamp (ms); from NestNow GET /progress. */
  updatedAt?: number;
};

function formatNestProgressFromApi(p: NestProgressApi): string | null {
  if (!p.busy) return null;
  const pl = p.placement;
  if (pl && typeof pl.progress === "number") {
    const prog = pl.progress;
    if (prog < 0) return "Finishing…";
    if (prog < 0.5) {
      const pct = Math.min(100, Math.round((prog / 0.5) * 100));
      return `NFP / prep ~${pct}%`;
    }
    const pct = Math.min(100, Math.round(((prog - 0.5) / 0.5) * 100));
    return `Placing parts ~${pct}%`;
  }
  const g = p.ga;
  if (g && typeof g.gen === "number" && typeof g.generations === "number") {
    return `Search gen ${g.gen + 1}/${g.generations} · layout ${(g.idx ?? 0) + 1}/${g.pop ?? "?"}${
      typeof g.evalCount === "number" ? ` (#${g.evalCount})` : ""
    }`;
  }
  return "Starting…";
}

type NestApiPartPayload = {
  outline: { x: number; y: number }[];
  holes?: { x: number; y: number }[][];
  filename?: string;
  quantity?: number;
  canRotate?: boolean;
};

type LastNestPayload = {
  /** Sent to NestNow (rectangle and/or polygon outline per sheet). */
  sheets: NestApiSheetPayload[];
  parts: NestApiPartPayload[];
  config: Record<string, string | number | boolean>;
  attemptsUsed: number;
};

type NestDxfProjectRow = {
  project_number: string;
  project_name: string;
  customer: string;
};

// Semi-transparent fills and distinct strokes so parts are visible and distinguishable (plan: cyan/purple/amber by index).
// Colors are ~50% desaturated (blend toward luminance) so preview shading reads softer than the UI accent palette.
const PART_FILLS = [
  "rgba(98, 186, 200, 0.35)",
  "rgba(148, 107, 188, 0.35)",
  "rgba(206, 163, 89, 0.35)",
  "rgba(86, 167, 116, 0.35)",
  "rgba(179, 94, 94, 0.35)",
];
const PART_STROKES = [
  "rgb(98, 186, 200)",
  "rgb(148, 107, 188)",
  "rgb(206, 163, 89)",
  "rgb(86, 167, 116)",
  "rgb(179, 94, 94)",
];

// Subdued sheet border so nested parts stand out; muted color
const SHEET_STROKE = "rgb(255, 255, 255)"; // zinc-500
/** Viewport pixels; used with vectorEffect non-scaling-stroke so edges stay thin when zoomed. */
const NEST_PREVIEW_VECTOR_STROKE_PX = 1.25;
const VIEW_PADDING = 3; // space between viewBox edge and remnant
const NEST_PREVIEW_ZOOM_MIN = 1;
const NEST_PREVIEW_ZOOM_MAX = 32;
/**
 * NestNow rectSheet: API `width` = horizontal (x), `height` = vertical (y), origin bottom-left, y up.
 * We send length_in as `width` and width_in as `height` so the long side matches Nest’s x-axis and the preview.
 * Preview: flip y only (y ↦ sheetHeight − y) so (0,0) reads as bottom-left on screen.
 */
/** Aspect-ratio frame for nest SVG; min height for empty states; max respects parent then viewport. */
const NEST_PREVIEW_FRAME_CLASS =
  "relative h-auto w-full min-w-0 min-h-[140px] max-h-[min(100%,min(840px,120dvh))] overflow-hidden";

function clampNestPreviewPan(
  panX: number,
  panY: number,
  zoom: number,
  worldW: number,
  worldH: number,
) {
  const vbW = worldW / zoom;
  const vbH = worldH / zoom;
  const maxX = Math.max(0, worldW - vbW);
  const maxY = Math.max(0, worldH - vbH);
  return {
    panX: Math.min(maxX, Math.max(0, panX)),
    panY: Math.min(maxY, Math.max(0, panY)),
  };
}

type NestPreviewPart = {
  outline: { x: number; y: number }[];
  holes?: { x: number; y: number }[][];
  filename?: string;
};

/** Union of sheet rect and all placed part geometry in preview coordinates. */
function computeNestPreviewWorld(
  sw: number,
  sh: number,
  parts: NestPreviewPart[],
  sheetplacements: SheetPlacement[],
  sheetOutlineNest?: { x: number; y: number }[],
): { worldW: number; worldH: number; innerTf: string } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  /** Nest y-up → on-screen y-down (same x). */
  const toPreview = (x: number, y: number) => ({
    x,
    y: sh - y,
  });

  const expand = (pts: { x: number; y: number }[]) => {
    for (const pt of pts) {
      if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
      const q = toPreview(pt.x, pt.y);
      minX = Math.min(minX, q.x);
      maxX = Math.max(maxX, q.x);
      minY = Math.min(minY, q.y);
      maxY = Math.max(maxY, q.y);
    }
  };

  if (sheetOutlineNest && sheetOutlineNest.length >= 3) {
    expand(sheetOutlineNest);
  } else {
    expand([
      { x: 0, y: 0 },
      { x: sw, y: 0 },
      { x: sw, y: sh },
      { x: 0, y: sh },
    ]);
  }

  for (const p of sheetplacements) {
    if (!p || typeof p.source !== "number") continue;
    const part = parts[p.source];
    const outline = part?.outline;
    if (!outline || outline.length < 3) continue;
    const rot = p.rotation ?? 0;
    const px = p.x ?? 0;
    const py = p.y ?? 0;
    expand(placeOutline(outline, rot, px, py));
    const holes = part.holes;
    if (holes?.length) {
      const placedHoles = placeHoles(holes, rot, px, py);
      for (const loop of placedHoles) {
        expand(loop);
      }
    }
  }

  const pad = VIEW_PADDING;
  const worldW = Math.max(1e-6, maxX - minX + 2 * pad);
  const worldH = Math.max(1e-6, maxY - minY + 2 * pad);
  const flipY = `matrix(1,0,0,-1,0,${sh})`;
  const innerTf = `translate(${pad - minX}, ${pad - minY}) ${flipY}`;
  return { worldW, worldH, innerTf };
}

function nestPreviewSheetView(s: NestApiSheetPayload | undefined): {
  sheetWidth: number;
  sheetHeight: number;
  sheetOutlineNest?: { x: number; y: number }[];
} {
  if (!s) {
    return { sheetWidth: 96, sheetHeight: 48 };
  }
  const { width, height } = nestSheetPreviewDimensions(s);
  return {
    sheetWidth: width,
    sheetHeight: height,
    sheetOutlineNest: nestSheetPayloadToPreviewOutline(s),
  };
}

/** Selectable mini schematics for layout goal: gravity (width-heavy), box AABB, convex hull. */
function PlacementTypeVisuals({
  active,
  onSelect,
  disabled = false,
}: {
  active: NestPlacementType;
  onSelect: (t: NestPlacementType) => void;
  disabled?: boolean;
}) {
  const wrap = (
    id: NestPlacementType,
    caption: string,
    svg: ReactNode,
  ) => {
    const on = active === id;
    return (
      <button
        type="button"
        disabled={disabled}
        aria-pressed={on}
        onClick={() => onSelect(id)}
        className={`flex w-full flex-col items-stretch gap-1.5 rounded-lg p-2 border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 disabled:pointer-events-none disabled:opacity-50 ${
          on
            ? "border-cyan-500/60 bg-cyan-950/35 shadow-[0_0_0_1px_rgba(34,211,238,0.15)]"
            : "border-zinc-800/90 bg-zinc-900/25 opacity-90 hover:border-zinc-600/80 hover:bg-zinc-900/40"
        }`}
      >
        <svg
          viewBox="0 0 72 52"
          className="h-[3.25rem] w-full shrink-0 text-cyan-300/90"
          aria-hidden
        >
          {svg}
        </svg>
        <p
          className={`text-center text-[10px] leading-snug ${
            on ? "text-cyan-100/95" : "text-zinc-500"
          }`}
        >
          {caption}
        </p>
      </button>
    );
  };

  const partFill = "rgba(98, 186, 200, 0.35)";
  const partStroke = "rgb(98, 186, 200)";
  const mute = "rgba(161, 161, 170, 0.55)";
  const accent = "rgb(244, 114, 182)";

  return (
    <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-xl sm:max-w-none">
      {wrap(
        "gravity",
        "Prioritize using less width side‑to‑side (helpful on wide sheets).",
        <>
          <rect x={2} y={2} width={68} height={48} rx={3} fill="none" stroke={mute} strokeWidth={0.6} />
          {/* two parts */}
          <rect x={10} y={18} width={14} height={10} fill={partFill} stroke={partStroke} strokeWidth={0.8} />
          <rect x={26} y={18} width={14} height={10} fill={partFill} stroke={partStroke} strokeWidth={0.8} />
          {/* width emphasis */}
          <path
            d="M 8 44 L 50 44"
            fill="none"
            stroke={accent}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          <path d="M 8 44 L 12 41 M 8 44 L 12 47 M 50 44 L 46 41 M 50 44 L 46 47" stroke={accent} strokeWidth={1.2} strokeLinecap="round" />
          <path
            d="M 58 14 L 58 34"
            fill="none"
            stroke={mute}
            strokeWidth={1}
            strokeDasharray="2 2"
          />
          <path d="M 58 14 L 55 18 M 58 14 L 61 18 M 58 34 L 55 30 M 58 34 L 61 30" stroke={mute} strokeWidth={0.8} />
        </>,
      )}
      {wrap(
        "box",
        "Prioritize the smallest upright rectangle that fits all parts.",
        <>
          <rect x={2} y={2} width={68} height={48} rx={3} fill="none" stroke={mute} strokeWidth={0.6} />
          <rect x={12} y={14} width={12} height={9} fill={partFill} stroke={partStroke} strokeWidth={0.8} />
          <rect x={30} y={22} width={11} height={14} fill={partFill} stroke={partStroke} strokeWidth={0.8} />
          <rect
            x={10}
            y={12}
            width={33}
            height={26}
            fill="none"
            stroke={accent}
            strokeWidth={1.2}
            strokeDasharray="3.5 3"
            rx={1}
          />
        </>,
      )}
      {wrap(
        "convexhull",
        "Prioritize a tight band around the whole group; can tuck into corners better than a plain box.",
        <>
          <rect x={2} y={2} width={68} height={48} rx={3} fill="none" stroke={mute} strokeWidth={0.6} />
          {/* L-shaped pair — hull follows outer outline; dashed box is the same AABB */}
          <rect x={14} y={12} width={16} height={9} fill={partFill} stroke={partStroke} strokeWidth={0.8} />
          <rect x={14} y={21} width={9} height={16} fill={partFill} stroke={partStroke} strokeWidth={0.8} />
          <polygon
            points="14,12 30,12 30,21 23,21 23,37 14,37"
            fill="none"
            stroke={accent}
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
          <rect
            x={14}
            y={12}
            width={16}
            height={25}
            fill="none"
            stroke={mute}
            strokeWidth={0.9}
            strokeDasharray="2 3"
            opacity={0.75}
          />
        </>,
      )}
    </div>
  );
}

type NestPreviewZoomableHandle = {
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

const NestPreviewZoomable = forwardRef(function NestPreviewZoomable(
  {
    sheetWidth,
    sheetHeight,
    parts,
    sheetplacements,
    sheetOutlineNest,
  }: {
    sheetWidth: number;
    sheetHeight: number;
    parts: NestPreviewPart[];
    sheetplacements: SheetPlacement[];
    /** When set, draw this polygon instead of a rectangle (Nest y-up coordinates). */
    sheetOutlineNest?: { x: number; y: number }[];
  },
  ref: Ref<NestPreviewZoomableHandle>,
) {
  const sw = Math.max(1e-6, Number(sheetWidth) || 96);
  const sh = Math.max(1e-6, Number(sheetHeight) || 48);
  const { worldW, worldH, innerTf } = useMemo(
    () =>
      computeNestPreviewWorld(
        sw,
        sh,
        parts,
        sheetplacements,
        sheetOutlineNest,
      ),
    [sw, sh, parts, sheetplacements, sheetOutlineNest],
  );
  const [view, setView] = useState({
    zoom: NEST_PREVIEW_ZOOM_MIN,
    panX: 0,
    panY: 0,
  });
  const svgRef = useRef<SVGSVGElement>(null);
  const interactionRef = useRef({
    zoom: NEST_PREVIEW_ZOOM_MIN,
    panX: 0,
    panY: 0,
    worldW: 1,
    worldH: 1,
  });
  const viewRef = useRef(view);
  const dragRef = useRef<{
    pointerId: number;
    panStart: { x: number; y: number };
    worldStart: { x: number; y: number };
  } | null>(null);

  useLayoutEffect(() => {
    viewRef.current = view;
    interactionRef.current = {
      zoom: view.zoom,
      panX: view.panX,
      panY: view.panY,
      worldW,
      worldH,
    };
  }, [view, worldW, worldH]);

  /** Reset camera when stock or computed scene bounds change. */
  useLayoutEffect(() => {
    setView({ zoom: NEST_PREVIEW_ZOOM_MIN, panX: 0, panY: 0 });
  }, [sheetWidth, sheetHeight, worldW, worldH]);

  useImperativeHandle(
    ref,
    () => ({
      resetView: () =>
        setView({ zoom: NEST_PREVIEW_ZOOM_MIN, panX: 0, panY: 0 }),
      zoomIn: () => {
        setView((prev) => {
          const z0 = prev.zoom;
          const z1 = Math.min(
            NEST_PREVIEW_ZOOM_MAX,
            Math.max(NEST_PREVIEW_ZOOM_MIN, z0 * 1.25),
          );
          if (z1 === z0) return prev;
          const oldVbW = worldW / z0;
          const oldVbH = worldH / z0;
          const newVbW = worldW / z1;
          const newVbH = worldH / z1;
          const cx = prev.panX + oldVbW / 2;
          const cy = prev.panY + oldVbH / 2;
          const c = clampNestPreviewPan(
            cx - newVbW / 2,
            cy - newVbH / 2,
            z1,
            worldW,
            worldH,
          );
          return { zoom: z1, panX: c.panX, panY: c.panY };
        });
      },
      zoomOut: () => {
        setView((prev) => {
          const z0 = prev.zoom;
          const z1 = Math.min(
            NEST_PREVIEW_ZOOM_MAX,
            Math.max(NEST_PREVIEW_ZOOM_MIN, z0 / 1.25),
          );
          if (z1 === z0) return prev;
          const oldVbW = worldW / z0;
          const oldVbH = worldH / z0;
          const newVbW = worldW / z1;
          const newVbH = worldH / z1;
          const cx = prev.panX + oldVbW / 2;
          const cy = prev.panY + oldVbH / 2;
          const c = clampNestPreviewPan(
            cx - newVbW / 2,
            cy - newVbH / 2,
            z1,
            worldW,
            worldH,
          );
          return { zoom: z1, panX: c.panX, panY: c.panY };
        });
      },
    }),
    [worldW, worldH],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const iv = interactionRef.current;
      const { zoom: z0, panX: px0, panY: py0, worldW: pw, worldH: ph } = iv;
      const oldVbW = pw / z0;
      const oldVbH = ph / z0;

      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const loc = pt.matrixTransform(ctm.inverse());
      const sx = loc.x;
      const sy = loc.y;

      const direction = e.deltaY > 0 ? -1 : 1;
      const factor = direction > 0 ? 1 / 1.12 : 1.12;
      const z1 = Math.min(
        NEST_PREVIEW_ZOOM_MAX,
        Math.max(NEST_PREVIEW_ZOOM_MIN, z0 * factor),
      );
      if (z1 === z0) return;

      const newVbW = pw / z1;
      const newVbH = ph / z1;
      const fracX = (sx - px0) / oldVbW;
      const fracY = (sy - py0) / oldVbH;
      const px1 = sx - fracX * newVbW;
      const py1 = sy - fracY * newVbH;
      const c = clampNestPreviewPan(px1, py1, z1, pw, ph);
      setView({ zoom: z1, panX: c.panX, panY: c.panY });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  const clientToSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const loc = pt.matrixTransform(ctm.inverse());
    return { x: loc.x, y: loc.y };
  }, []);

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (viewRef.current.zoom <= NEST_PREVIEW_ZOOM_MIN) return;
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const u = clientToSvg(e.clientX, e.clientY);
    dragRef.current = {
      pointerId: e.pointerId,
      panStart: { x: viewRef.current.panX, y: viewRef.current.panY },
      worldStart: u,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const u = clientToSvg(e.clientX, e.clientY);
    const v = viewRef.current;
    const nextPanX = d.panStart.x + (d.worldStart.x - u.x);
    const nextPanY = d.panStart.y + (d.worldStart.y - u.y);
    const c = clampNestPreviewPan(
      nextPanX,
      nextPanY,
      v.zoom,
      worldW,
      worldH,
    );
    setView((prev) => ({ ...prev, panX: c.panX, panY: c.panY }));
  };

  const endDrag = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (d && d.pointerId === e.pointerId) {
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    }
  };

  const { zoom, panX, panY } = view;
  const vbW = worldW / zoom;
  const vbH = worldH / zoom;
  const mapPt = (x: number, y: number) => `${x},${y}`;
  const canPan = zoom > NEST_PREVIEW_ZOOM_MIN;

  return (
    <svg
      ref={svgRef}
      viewBox={`${panX} ${panY} ${vbW} ${vbH}`}
      overflow="hidden"
      className={`block h-full min-h-0 w-full ${canPan ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ touchAction: "none", overflow: "hidden" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="img"
      aria-label="Nest layout preview. Scroll to zoom, drag to pan when zoomed."
    >
      <g transform={innerTf}>
        {/* NestNow sheet: rect or polygon in nest y-up space */}
        <path
          d={
            sheetOutlineNest && sheetOutlineNest.length >= 3
              ? [
                  `M ${mapPt(sheetOutlineNest[0].x, sheetOutlineNest[0].y)}`,
                  ...sheetOutlineNest
                    .slice(1)
                    .map((pt) => `L ${mapPt(pt.x, pt.y)}`),
                  "Z",
                ].join(" ")
              : `M 0 0 L ${sw} 0 L ${sw} ${sh} L 0 ${sh} Z`
          }
          fill="none"
          stroke={SHEET_STROKE}
          strokeWidth={NEST_PREVIEW_VECTOR_STROKE_PX}
          vectorEffect="non-scaling-stroke"
        />
        {sheetplacements.map((p, idx) => {
          if (!p || typeof p.source !== "number") return null;
          const part = parts[p.source];
          const outline = part?.outline;
          if (!outline || !Array.isArray(outline) || outline.length < 3)
            return null;
          const rot = p.rotation ?? 0;
          const px = p.x ?? 0;
          const py = p.y ?? 0;
          const outerPlaced = placeOutline(outline, rot, px, py);
          const holesPlaced = placeHoles(part.holes, rot, px, py);
          const toSubpath = (
            loop: { x: number; y: number }[],
          ): string | null => {
            if (loop.length < 3) return null;
            const [p0, ...rest] = loop;
            return [
              `M ${mapPt(p0.x, p0.y)}`,
              ...rest.map((pt) => `L ${mapPt(pt.x, pt.y)}`),
              "Z",
            ].join(" ");
          };
          const d = [outerPlaced, ...holesPlaced]
            .map(toSubpath)
            .filter((s): s is string => Boolean(s))
            .join(" ");
          if (!d) return null;
          const fill = PART_FILLS[idx % PART_FILLS.length];
          const stroke = PART_STROKES[idx % PART_STROKES.length];
          return (
            <path
              key={`${p.source}-${p.id}`}
              d={d}
              fillRule="evenodd"
              fill={fill}
              stroke={stroke}
              strokeWidth={NEST_PREVIEW_VECTOR_STROKE_PX}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </g>
    </svg>
  );
});

NestPreviewZoomable.displayName = "NestPreviewZoomable";

function SheetWireframe({
  lengthIn,
  widthIn,
  dims,
}: {
  lengthIn?: number;
  widthIn?: number;
  dims?: string;
}) {
  let w = lengthIn;
  let h = widthIn;
  if (!w || !h) {
    const parsed = parseRemnantDims(dims);
    w = parsed.width;
    h = parsed.height;
  }
  if (!w || !h) return null;
  // Fit rectangle to viewBox while preserving aspect ratio.
  // (Previously we normalized into an 80x80 box, which could exceed the 60px-high viewBox and clip top/bottom edges.)
  const vbW = 100;
  const vbH = 60;
  const pad = 6;
  const innerW = vbW - pad * 2;
  const innerH = vbH - pad * 2;
  const scale = Math.min(innerW / w, innerH / h);
  const minSide = 8;
  const normW = Math.max(w * scale, minSide);
  const normH = Math.max(h * scale, minSide);
  const x = (vbW - normW) / 2;
  const y = (vbH - normH) / 2;
  return (
    <div className="mt-1 mb-2 flex items-center justify-start">
      <svg
        viewBox="0 0 100 60"
        className="w-24 h-15 text-zinc-500"
        aria-hidden="true"
      >
        <rect
          x={x}
          y={y}
          width={normW}
          height={normH}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          rx={3}
          ry={3}
        />
      </svg>
    </div>
  );
}

export default function NestRemnantsPage() {
  const { data: session, status } = useSession();
  const role = normalizeAppRole(session?.role);
  const canUseNest = canRunNesting(role);
  const [activeTab, setActiveTab] = useState<"remnants" | "nest">("nest");
  const [pageLastUpdated, setPageLastUpdated] = useState<Date | null>(null);
  const [openQuotesCount, setOpenQuotesCount] = useState(0);
  const [remnantsCardView, setRemnantsCardView] = useState(false);
  const remnantsSectionRef = useRef<HTMLElement | null>(null);

  const [remnants, setRemnants] = useState<Remnant[]>([]);
  const [remnantsLoading, setRemnantsLoading] = useState(true);
  const [remnantsError, setRemnantsError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [addStockMode, setAddStockMode] = useState<"sheet" | "remnant" | null>(null);
  const [sheetLengthIn, setSheetLengthIn] = useState<string>("");
  const [sheetWidthIn, setSheetWidthIn] = useState<string>("");
  const [sheetThicknessIn, setSheetThicknessIn] = useState<string>("");
  const [sheetMaterial, setSheetMaterial] = useState<string>("");
  const [sheetLabel, setSheetLabel] = useState<string>("");
  const [sheetNotes, setSheetNotes] = useState<string>("");
  const [sheetStatus, setSheetStatus] = useState<string>("available");
  const [addSheetError, setAddSheetError] = useState<string | null>(null);
  const [addSheetLoading, setAddSheetLoading] = useState(false);
  const [selectedSheetIds, setSelectedSheetIds] = useState<string[]>([]);
  const [editingSheetId, setEditingSheetId] = useState<string | null>(null);
  const [nestResult, setNestResult] = useState<NestResult | null>(null);
  /** Which layout from `nestResult.candidates` (or sole result) is shown in the preview. */
  const [nestCandidateIndex, setNestCandidateIndex] = useState(0);
  /** Live best layout from GET /progress while a nest HTTP request is in flight. */
  const [nestLiveBestSoFar, setNestLiveBestSoFar] = useState<NestResult | null>(
    null,
  );
  /** Sheets + parts for preview during nesting (same as request body). */
  const [nestRunPreviewGeometry, setNestRunPreviewGeometry] = useState<{
    sheets: NestApiSheetPayload[];
    parts: NestApiPartPayload[];
  } | null>(null);
  const [nestError, setNestError] = useState<string | null>(null);
  const [nestErrorAdmin, setNestErrorAdmin] = useState<string | null>(null);
  const [nestLoading, setNestLoading] = useState(false);
  const [nestProgressLabel, setNestProgressLabel] = useState<string | null>(null);
  const [nestElapsedSec, setNestElapsedSec] = useState(0);
  const [lastNestPayload, setLastNestPayload] = useState<LastNestPayload | null>(null);
  const nestInFlightRef = useRef(false);
  const nestRunVersionRef = useRef(0);
  /** Latest progress snapshot; read in `handleStopNest` so promotion is not stale. */
  const nestLiveBestSoFarRef = useRef<NestResult | null>(null);
  const nestRunPreviewGeometryRef = useRef<{
    sheets: NestApiSheetPayload[];
    parts: NestApiPartPayload[];
  } | null>(null);
  const nestActiveEndpointsRef = useRef(
    nestNowEndpoints(""),
  );
  const [nestUiSettings, setNestUiSettings] = useState<NestUiSettings>(() =>
    loadNestUiSettings(),
  );
  const [nestAdvancedOpen, setNestAdvancedOpen] = useState(false);
  const [nestGeometryOpen, setNestGeometryOpen] = useState(false);
  /** Up to three distinct Explore layouts (and latest Refine alternatives) for Phase 2 seeding. */
  const [nestTopSeeds, setNestTopSeeds] = useState<NestSeedEntry[]>([]);
  const [nestSelectedSeedIndex, setNestSelectedSeedIndex] = useState<
    number | null
  >(null);
  const [nestAdminVisible, setNestAdminVisible] = useState(false);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const [filterDropdownPosition, setFilterDropdownPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [pendingDeleteRemnant, setPendingDeleteRemnant] = useState<Remnant | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const [isAddShapeOpen, setIsAddShapeOpen] = useState(false);
  const [shapeType, setShapeType] = useState<"rect" | "round">("rect");
  const [rectW, setRectW] = useState<string>("");
  const [rectH, setRectH] = useState<string>("");
  const [rectSquareLocked, setRectSquareLocked] = useState(false);
  const [roundOD, setRoundOD] = useState<string>("");
  const [roundID, setRoundID] = useState<string>("");
  const [roundHasHole, setRoundHasHole] = useState(false);
  const [shapeQty, setShapeQty] = useState<string>("1");
  const [addShapeError, setAddShapeError] = useState<string | null>(null);
  const [parts, setParts] = useState<PartShape[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMaterial, setFilterMaterial] = useState<string>("");
  const [filterThickness, setFilterThickness] = useState<string>("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [nestSheetQuickFilter, setNestSheetQuickFilter] = useState("");
  const [previewSheetIndex, setPreviewSheetIndex] = useState(0);
  const nestPreviewRef = useRef<NestPreviewZoomableHandle>(null);

  const [nestDxfModalOpen, setNestDxfModalOpen] = useState(false);
  const [nestDxfExportMethod, setNestDxfExportMethod] = useState<
    "download" | "onedrive"
  >("download");
  const [nestDxfProjects, setNestDxfProjects] = useState<NestDxfProjectRow[]>(
    [],
  );
  const [nestDxfProjectsLoading, setNestDxfProjectsLoading] = useState(false);
  const [nestDxfSelectedJob, setNestDxfSelectedJob] = useState("");
  const [nestDxfExportError, setNestDxfExportError] = useState("");
  const [nestDxfExporting, setNestDxfExporting] = useState(false);
  const [nestDxfIncludeLabels, setNestDxfIncludeLabels] = useState(true);
  const [nestDxfIncludeSheetOutline, setNestDxfIncludeSheetOutline] =
    useState(true);
  const [nestDxfTextHeight, setNestDxfTextHeight] = useState("1");

  const fetchOpenQuotesCount = useCallback(async () => {
    const { data, error } = await supabase
      .from("projects")
      .select(PROJECT_SELECT);
    if (error || !data) return;
    setOpenQuotesCount(
      aggregateDashboardMetrics(data as DashboardProjectRow[]).openQuotes,
    );
  }, []);

  const fetchNestDxfProjects = useCallback(async () => {
    setNestDxfProjectsLoading(true);
    const { data, error } = await supabase
      .from("projects")
      .select(
        "project_number, project_name, customer, project_status, customer_approval",
      )
      .eq("project_complete", false)
      .or("customer_approval.is.null,customer_approval.neq.CANCELLED")
      .or("project_status.is.null,project_status.neq.cancelled")
      .order("project_number", { ascending: false });
    if (error) console.error("Error fetching projects for DXF export:", error);
    setNestDxfProjects((data as NestDxfProjectRow[]) || []);
    setNestDxfProjectsLoading(false);
  }, []);

  useEffect(() => {
    if (!nestDxfModalOpen) return;
    setNestDxfExportMethod("download");
    setNestDxfSelectedJob("");
    setNestDxfExportError("");
    void fetchNestDxfProjects();
  }, [nestDxfModalOpen, fetchNestDxfProjects]);

  const uniqueMaterials = useMemo(
    () =>
      [...new Set(remnants.map((r) => r.material).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [remnants],
  );
  const uniqueThicknesses = useMemo(
    () =>
      [
        ...new Set(
          remnants
            .map((r) =>
              r.thickness_in != null ? r.thickness_in.toFixed(3) : "",
            )
            .filter(Boolean),
        ),
      ].sort((a, b) => parseFloat(a) - parseFloat(b)),
    [remnants],
  );

  useEffect(() => {
    if (!nestLoading) {
      setNestElapsedSec(0);
      return;
    }
    setNestElapsedSec(0);
    const t = window.setInterval(() => {
      setNestElapsedSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [nestLoading]);

  const nestDisplayTimeoutSec = useMemo(
    () => clampNestRequestTimeoutSec(nestUiSettings.requestTimeoutSec),
    [nestUiSettings.requestTimeoutSec],
  );

  const nestPartStats = useMemo(() => {
    const rowCount = parts.length;
    const expanded = parts.reduce(
      (n, p) => n + Math.max(1, Math.floor(Number(p.quantity)) || 1),
      0,
    );
    const vertexTotal = parts.reduce((n, p) => {
      const holeVerts =
        p.holes?.reduce((hn, hole) => hn + (hole?.length ?? 0), 0) ?? 0;
      return n + (p.outline?.length ?? 0) + holeVerts;
    }, 0);
    const approxPairs =
      expanded > 1 ? Math.round((expanded * (expanded - 1)) / 2) : 0;
    return { rowCount, expanded, vertexTotal, approxPairs };
  }, [parts]);

  const nestJobCtxFingerprint = useMemo(() => {
    if (!remnants.length || !parts.length) {
      return {
        fingerprint: "",
        sheets: [] as NestApiSheetPayload[],
        parts: [] as NestApiPartPayload[],
      };
    }
    const selectedRemnants = remnants.filter(
      (r) => r.db_id && selectedSheetIds.includes(r.db_id),
    );
    const sheetsSource =
      selectedRemnants.length > 0
        ? selectedRemnants
        : [
            remnants.find((r) => r.status === "Available") ??
              remnants[0],
          ];
    if (!sheetsSource[0]) {
      return {
        fingerprint: "",
        sheets: [] as NestApiSheetPayload[],
        parts: [] as NestApiPartPayload[],
      };
    }
    const sheets = sheetsSource.map(remnantToNestSheet);
    const nestPartsPayload: NestApiPartPayload[] = parts.map((p, index) => ({
      outline: p.outline,
      ...(p.holes?.length ? { holes: p.holes } : {}),
      quantity: p.quantity,
      filename: p.name || `part-${index + 1}`,
      ...(p.canRotate === false ? { canRotate: false } : {}),
    }));
    return {
      fingerprint: nestJobFingerprint(sheets, nestPartsPayload),
      sheets,
      parts: nestPartsPayload,
    };
  }, [remnants, selectedSheetIds, parts]);

  function filterRemnants(list: Remnant[], query: string): Remnant[] {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const id = (r.id ?? "").toLowerCase();
      const label = (r.label ?? "").toLowerCase();
      const material = (r.material ?? "").toLowerCase();
      const dims = (r.dims ?? "").toLowerCase();
      const status = (r.status ?? "").toLowerCase();
      const notes = (r.notes ?? "").toLowerCase();
      const thickness = r.thickness_in != null ? r.thickness_in.toFixed(3) : "";
      return (
        id.includes(q) ||
        label.includes(q) ||
        material.includes(q) ||
        dims.includes(q) ||
        status.includes(q) ||
        notes.includes(q) ||
        thickness.includes(q)
      );
    });
  }

  const searchFiltered = filterRemnants(remnants, searchQuery);
  const filteredRemnants = useMemo(() => {
    return searchFiltered.filter((r) => {
      if (
        filterMaterial &&
        (r.material ?? "") !== filterMaterial
      )
        return false;
      if (
        filterThickness &&
        (r.thickness_in == null ||
          r.thickness_in.toFixed(3) !== filterThickness)
      )
        return false;
      return true;
    });
  }, [searchFiltered, filterMaterial, filterThickness]);

  const nestQuickFilteredRemnants = useMemo(
    () => filterRemnants(remnants, nestSheetQuickFilter),
    [remnants, nestSheetQuickFilter],
  );

  useEffect(() => {
    setPreviewSheetIndex(0);
    setNestCandidateIndex(0);
  }, [nestResult]);

  useEffect(() => {
    setPreviewSheetIndex(0);
  }, [nestCandidateIndex]);

  const nestCandidateOptions = useMemo((): NestResult[] => {
    if (!nestResult) return [];
    if (nestResult.candidates?.length) return nestResult.candidates;
    return [nestResult];
  }, [nestResult]);

  const displayedNestResult =
    nestCandidateOptions[
      Math.min(
        nestCandidateIndex,
        Math.max(0, nestCandidateOptions.length - 1),
      )
    ] ?? null;

  useLayoutEffect(() => {
    if (!filterOpen) {
      setFilterDropdownPosition(null);
      return;
    }
    const el = filterButtonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = 256;
    setFilterDropdownPosition({
      top: rect.bottom + 8,
      left: rect.right - width,
    });
  }, [filterOpen]);

  useEffect(() => {
    if (!filterOpen) return;
    function updatePosition() {
      const el = filterButtonRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const width = 256;
      setFilterDropdownPosition({
        top: rect.bottom + 8,
        left: rect.right - width,
      });
    }
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [filterOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!filterOpen) return;
      const target = event.target as Node;
      const inButton = filterPanelRef.current?.contains(target);
      const inDropdown = filterDropdownRef.current?.contains(target);
      if (!inButton && !inDropdown) setFilterOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [filterOpen]);

  const selectedForNest = remnants.filter(
    (r) => r.db_id && selectedSheetIds.includes(r.db_id),
  );

  const selectedNestWeightLbs = useMemo(
    () =>
      selectedForNest.reduce((n, r) => {
        const w = r.est_weight_lbs;
        return n + (typeof w === "number" && Number.isFinite(w) ? w : 0);
      }, 0),
    [selectedForNest],
  );

  const availableSheetCount = useMemo(
    () => remnants.filter((r) => r.status === "Available").length,
    [remnants],
  );

  function mapRowToRemnant(row: any): Remnant {
    const length_in = Number(row.length_in) || 0;
    const width_in = Number(row.width_in) || 0;
    const thickness_in = Number(row.thickness_in) || 0;
    const material: string = row.material ?? "Unknown";
    const dims = length_in && width_in ? `${length_in}x${width_in}"` : undefined;
    const est_weight_lbs =
      length_in && width_in && thickness_in
        ? calcWeight(length_in * width_in, thickness_in, material)
        : row.est_weight_lbs ?? 0;
    const isArchived = Boolean(row.is_archived);
    const statusRaw: string = row.status ?? "available";
    const lowered = statusRaw.toLowerCase();
    const normalized =
      lowered === "scrapped" ? "scrap" : lowered;
    const status: Remnant["status"] = isArchived
      ? "Archived"
      : normalized === "allocated"
        ? "Allocated"
        : normalized === "consumed"
          ? "Consumed"
          : normalized === "scrap"
            ? "Scrap"
            : "Available";

    const dbId: string = row.id;
    const shortId = dbId ? `#${dbId.slice(0, 8).toUpperCase()}` : "#SHEET";
    const label: string | null = row.label ?? null;

    const pathFromDb =
      typeof row.svg_path === "string" && row.svg_path.trim()
        ? row.svg_path.trim()
        : undefined;

    return {
      id: label || shortId,
      db_id: dbId,
      label,
      /** Real remnant outline from DB only — no synthetic shape, so rect stock nests as a rectangle. */
      svg_path: pathFromDb,
      dims,
      length_in,
      width_in,
      material,
      thickness_in,
      est_weight_lbs,
      status,
      notes: row.notes ?? null,
    };
  }

  const fetchSheets = async () => {
    setRemnantsLoading(true);
    setRemnantsError(null);
    const { data, error } = await supabase
      .from("sheet_stock")
      .select("*")
      .or("is_archived.is.null,is_archived.eq.false")
      .order("created_at", { ascending: false });
    if (error) {
      setRemnantsError(error.message ?? "Failed to load sheets");
      setRemnantsLoading(false);
      return;
    }
    const mapped = (data ?? []).map((row) => mapRowToRemnant(row));
    setRemnants(mapped);
    setRemnantsLoading(false);
    setPageLastUpdated(new Date());
  };

  const handleRequestDeleteSheet = (remnant: Remnant) => {
    if (!remnant.db_id) return;
    setArchiveError(null);
    setPendingDeleteRemnant(remnant);
  };

  const handleConfirmDeleteSheet = async () => {
    if (!pendingDeleteRemnant?.db_id) return;
    setDeleteLoading(true);
    setArchiveError(null);
    try {
      const { error } = await supabase
        .from("sheet_stock")
        .update({ is_archived: true })
        .eq("id", pendingDeleteRemnant.db_id);
      if (error) {
        setArchiveError(error.message ?? "Failed to archive sheet");
        setDeleteLoading(false);
        return;
      }
      setRemnants((prev) =>
        prev.filter((r) => r.db_id !== pendingDeleteRemnant.db_id),
      );
      setPendingDeleteRemnant(null);
      setDeleteLoading(false);
    } catch (e) {
      setArchiveError(e instanceof Error ? e.message : "Failed to archive sheet");
      setDeleteLoading(false);
    }
  };

  const handleCancelDeleteSheet = () => {
    if (deleteLoading) return;
    setArchiveError(null);
    setPendingDeleteRemnant(null);
  };

  const resetAddShapeForm = () => {
    setShapeType("rect");
    setRectW("");
    setRectH("");
    setRectSquareLocked(false);
    setRoundOD("");
    setRoundID("");
    setRoundHasHole(false);
    setShapeQty("1");
    setAddShapeError(null);
  };

  const openAddShapeModal = () => {
    resetAddShapeForm();
    setIsAddShapeOpen(true);
  };

  const closeAddShapeModal = () => {
    setIsAddShapeOpen(false);
    setAddShapeError(null);
  };

  const handleSubmitAddShape = () => {
    setAddShapeError(null);
    const qty = Math.floor(Number(shapeQty));
    if (!Number.isFinite(qty) || qty < 1) {
      setAddShapeError("Quantity must be at least 1.");
      return;
    }

    if (shapeType === "rect") {
      const w = Number(rectW);
      const h = Number(rectH);
      if (!Number.isFinite(w) || w <= 0) {
        setAddShapeError("Width must be a positive number.");
        return;
      }
      if (!Number.isFinite(h) || h <= 0) {
        setAddShapeError("Height must be a positive number.");
        return;
      }
      const outline = rectOutline(w, h);
      if (!outline.length) {
        setAddShapeError("Failed to create rectangle outline.");
        return;
      }
      const newPart: PartShape = {
        id: `rect-${parts.length + 1}-${Date.now()}`,
        name: `Rect ${parts.length + 1}`,
        kind: "rect",
        outline,
        quantity: qty,
        canRotate: true,
        meta: { source: "ui", originalParams: { width_in: w, height_in: h } },
      };
      setParts((prev) => [...prev, newPart]);
      closeAddShapeModal();
      return;
    }

    if (shapeType === "round") {
      const od = Number(roundOD);
      if (!Number.isFinite(od) || od <= 0) {
        setAddShapeError("Outer diameter (OD) must be a positive number.");
        return;
      }

      if (!roundHasHole) {
        const outline = circleOutline(od);
        if (!outline.length) {
          setAddShapeError("Failed to create round outline.");
          return;
        }
        const newPart: PartShape = {
          id: `round-${parts.length + 1}-${Date.now()}`,
          name: `Round ${parts.length + 1}`,
          kind: "round",
          outline,
          quantity: qty,
          canRotate: true,
          meta: { source: "ui", originalParams: { od_in: od } },
        };
        setParts((prev) => [...prev, newPart]);
        closeAddShapeModal();
        return;
      }

      const idVal = Number(roundID);
      if (!Number.isFinite(idVal) || idVal <= 0) {
        setAddShapeError("Inner diameter (ID) must be a positive number.");
        return;
      }
      if (idVal >= od) {
        setAddShapeError("ID must be smaller than OD.");
        return;
      }

      const { outer, inner } = ringOutline(od, idVal);
      if (!outer.length || !inner.length) {
        setAddShapeError("Failed to create ring outline.");
        return;
      }

      const newPart: PartShape = {
        id: `ring-${parts.length + 1}-${Date.now()}`,
        name: `Round w/ Hole ${parts.length + 1}`,
        kind: "round_hole",
        outline: outer,
        holes: [inner],
        quantity: qty,
        canRotate: true,
        meta: { source: "ui", originalParams: { od_in: od, id_in: idVal } },
      };
      setParts((prev) => [...prev, newPart]);
      closeAddShapeModal();
      return;
    }
  };

  useEffect(() => {
    saveNestUiSettings(nestUiSettings);
  }, [nestUiSettings]);

  useEffect(() => {
    const fp = nestJobCtxFingerprint.fingerprint;
    if (!fp) {
      setNestTopSeeds([]);
      setNestSelectedSeedIndex(null);
      return;
    }
    setNestTopSeeds(loadNestSeedsFromStorage(fp));
    setNestSelectedSeedIndex(null);
  }, [nestJobCtxFingerprint.fingerprint]);

  useEffect(() => {
    if (
      nestSelectedSeedIndex != null &&
      nestSelectedSeedIndex >= nestTopSeeds.length
    ) {
      setNestSelectedSeedIndex(null);
    }
  }, [nestTopSeeds, nestSelectedSeedIndex]);

  useEffect(() => {
    nestLiveBestSoFarRef.current = nestLiveBestSoFar;
  }, [nestLiveBestSoFar]);

  useEffect(() => {
    nestRunPreviewGeometryRef.current = nestRunPreviewGeometry;
  }, [nestRunPreviewGeometry]);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      setNestAdminVisible(
        q.get("admin") === "1" ||
          process.env.NEXT_PUBLIC_SHOW_NEST_ADMIN === "1",
      );
    } catch {
      setNestAdminVisible(false);
    }
  }, []);

  function mapPartsToApiPayload(
    partList: PartShape[],
  ): NestApiPartPayload[] {
    return partList.map((p, index) => ({
      outline: p.outline,
      ...(p.holes?.length ? { holes: p.holes } : {}),
      quantity: p.quantity,
      filename: p.name || `part-${index + 1}`,
      ...(p.canRotate === false ? { canRotate: false } : {}),
    }));
  }

  function nestAttemptBetter(
    next: NestResult,
    prev: NestResult | null,
  ): boolean {
    if (!prev) return true;
    const nf = prev.fitness;
    const nnf = next.fitness;
    if (nnf !== nf) return nnf < nf;
    return (next.utilisation ?? 0) > (prev.utilisation ?? 0);
  }

  function applyNestSeedPreview(seed: NestSeedEntry) {
    if (!nestJobCtxFingerprint.fingerprint) return;
    setNestResult({
      fitness: seed.fitness,
      area: seed.area,
      totalarea: seed.totalarea,
      mergedLength: seed.mergedLength,
      utilisation: seed.utilisation,
      placements: seed.placements,
    });
    setNestCandidateIndex(0);
    const rtc = clampNestRequestTimeoutSec(nestUiSettings.requestTimeoutSec);
    setLastNestPayload({
      sheets: nestJobCtxFingerprint.sheets,
      parts: nestJobCtxFingerprint.parts,
      config: {
        ...buildApiNestConfig(nestUiSettings),
        attempts: nestUiSettings.attempts,
        requestTimeoutSec: rtc,
        nestStrategy: nestUiSettings.nestStrategy,
        nestSearchPhase: nestUiSettings.nestSearchPhase,
      },
      attemptsUsed: 0,
    });
    setPageLastUpdated(new Date());
  }

  function clearNestTopSeedsForJob() {
    setNestTopSeeds([]);
    setNestSelectedSeedIndex(null);
    const fp = nestJobCtxFingerprint.fingerprint;
    if (typeof window === "undefined" || !fp) return;
    try {
      window.localStorage.removeItem(NEST_SEEDS_STORAGE_PREFIX + fp);
    } catch {
      /* ignore */
    }
  }

  async function handleGenerateNest() {
    if (nestInFlightRef.current) return;

    if (!remnants.length) {
      setNestError("Add at least one sheet/remnant before nesting.");
      setNestErrorAdmin(null);
      return;
    }

    if (!parts.length) {
      setNestError("Add at least one part before nesting.");
      setNestErrorAdmin(null);
      return;
    }

    const selectedRemnants = remnants.filter(
      (r) => r.db_id && selectedSheetIds.includes(r.db_id),
    );
    const sheetsSource =
      selectedRemnants.length > 0
        ? selectedRemnants
        : [
            remnants.find((r) => r.status === "Available") ??
              remnants[0],
          ];

    const sheets: NestApiSheetPayload[] =
      sheetsSource.map(remnantToNestSheet);

    const nestPartsPayload = mapPartsToApiPayload(parts);

    const placementLane = selectNestPlacementLane(
      nestUiSettings.nestStrategy,
      parts,
      sheets,
    );

    if (
      placementLane.kind === "full" &&
      nestUiSettings.nestSearchPhase === "refine"
    ) {
      const idx = nestSelectedSeedIndex;
      const picked =
        idx != null && idx >= 0 && idx < nestTopSeeds.length
          ? nestTopSeeds[idx]
          : null;
      if (!picked?.chromosome) {
        setNestError(
          "Refine needs a seed with chromosome data. Run Explore, then select a seed below (NestNow must return chromosomes).",
        );
        setNestErrorAdmin(null);
        return;
      }
    }

    nestInFlightRef.current = true;
    const myVersion = ++nestRunVersionRef.current;
    setNestError(null);
    setNestErrorAdmin(null);
    setNestResult(null);
    setLastNestPayload(null);
    setNestCandidateIndex(0);
    setNestLiveBestSoFar(null);
    setNestRunPreviewGeometry(null);
    setNestLoading(true);
    setNestProgressLabel("Starting…");
    const nestLoadStartedAt = Date.now();

    const endpoints = nestNowEndpoints(nestUiSettings.directNestNowUrl);
    nestActiveEndpointsRef.current = endpoints;

    setNestRunPreviewGeometry({ sheets, parts: nestPartsPayload });

    const attempts = Math.min(
      NEST_UI_MAX_SEPARATE_ATTEMPTS,
      Math.max(1, Math.floor(nestUiSettings.attempts) || 1),
    );
    const apiConfig = buildApiNestConfig(nestUiSettings);
    const requestTimeoutSec = clampNestRequestTimeoutSec(
      nestUiSettings.requestTimeoutSec,
    );
    const requestTimeoutMs = requestTimeoutSec * 1000;

    let bestResult: NestResult | null = null;
    let bestPayloadBody: {
      sheets: NestApiSheetPayload[];
      parts: NestApiPartPayload[];
      config: typeof apiConfig;
      requestTimeoutMs: number;
      chromosome?: NestChromosome;
    } | null = null;
    let lastAttemptError: string | null = null;
    let lastAttemptAdmin: string | null = null;
    /** Which numbered attempt produced the layout kept in `bestResult` (for metadata). */
    let successfulAttempt: number | null = null;

    const progressTimer = window.setInterval(async () => {
      if (nestRunVersionRef.current !== myVersion) return;
      try {
        const pr = await fetch(endpoints.progress, {
          method: "GET",
          cache: "no-store",
        });
        if (!pr.ok) return;
        const j = (await pr.json()) as NestProgressApi;
        if (nestRunVersionRef.current !== myVersion) return;
        const label = formatNestProgressFromApi(j);
        if (label) setNestProgressLabel(label);
        const live = j.bestSoFar;
        if (
          live &&
          typeof live === "object" &&
          Array.isArray(live.placements) &&
          live.placements.length > 0
        ) {
          setNestLiveBestSoFar(live as NestResult);
        }
      } catch {
        /* ignore */
      }
    }, 500);

    try {
      if (placementLane.kind !== "full") {
        setNestProgressLabel("Nesting module…");
        const moduleConfig = {
          ...apiConfig,
          ...NEST_PRESET_MODULE_FIELDS,
        };
        const modulePartsPayload = mapPartsToApiPayload(
          partsUnitQuantities(parts),
        );
        const modulePayload = {
          sheets,
          parts: modulePartsPayload,
          config: moduleConfig,
          requestTimeoutMs,
        };

        if (nestRunVersionRef.current !== myVersion) {
          return;
        }

        const postStarted = performance.now();
        const res = await postNestWith503Retry(
          endpoints.nest,
          modulePayload,
          endpoints.stop,
        );
        const clientRequestDurationMs = Math.round(
          performance.now() - postStarted,
        );
        let raw: NestApiResponse = {} as NestApiResponse;
        let responseParseError: string | undefined;
        try {
          const parsed: unknown = await res.json();
          if (parsed && typeof parsed === "object") {
            raw = parsed as NestApiResponse;
          }
        } catch (pe) {
          responseParseError =
            pe instanceof Error ? pe.message : String(pe);
        }

        const failureCtx: NestFailureContext = {
          nestPath: endpoints.isDirect ? "direct" : "proxy",
          clientRequestDurationMs,
          responseParseError,
        };

        if (nestRunVersionRef.current !== myVersion) {
          return;
        }

        if (responseParseError) {
          const synthetic = {
            error: res.ok
              ? "Nesting returned a non-JSON response"
              : res.statusText || "Non-JSON error response",
          } as NestApiResponse;
          const { userMessage, adminDetail } = parseNestFailure(
            res,
            synthetic,
            failureCtx,
          );
          setNestError(userMessage);
          setNestErrorAdmin(adminDetail);
          return;
        }

        if (!res.ok) {
          const { userMessage, adminDetail } = parseNestFailure(
            res,
            raw,
            failureCtx,
          );
          setNestError(userMessage);
          setNestErrorAdmin(adminDetail);
          return;
        }

        const moduleData = stripNestApiDiagnostics(raw);
        setNestProgressLabel("Filling grid…");
        const expanded = expandModuleToGrid({
          moduleResult: moduleData,
          parts,
          sheet: sheets[0],
          spacing: Number(apiConfig.spacing) || 0,
          sheetKind: placementLane.sheetKind,
        });

        if ("error" in expanded) {
          setNestError(
            `${expanded.error} Try Tight (full) strategy or a smaller module.`,
          );
          setNestErrorAdmin(null);
          return;
        }

        const gridResult: NestResult = {
          ...expanded.result,
          nestStrategyMeta: expanded.meta,
        };
        const configSummary: Record<string, string | number | boolean> = {
          spacing: apiConfig.spacing,
          rotations: apiConfig.rotations,
          placementType: apiConfig.placementType,
          mergeLines: apiConfig.mergeLines,
          curveTolerance: apiConfig.curveTolerance,
          simplify: apiConfig.simplify,
          clipperScale: apiConfig.clipperScale,
          populationSize: moduleConfig.populationSize ?? apiConfig.populationSize,
          mutationRate: moduleConfig.mutationRate ?? apiConfig.mutationRate,
          gaGenerations:
            moduleConfig.gaGenerations ?? apiConfig.gaGenerations,
          timeRatio: apiConfig.timeRatio,
          scale: apiConfig.scale,
          attempts: 1,
          requestTimeoutSec,
          nestStrategy: nestUiSettings.nestStrategy,
          nestSearchPhase: nestUiSettings.nestSearchPhase,
          gridStampsPlaced: expanded.meta.stampsPlaced,
          gridCapacity: expanded.meta.gridCapacity,
          gridPitchX: expanded.meta.pitchX,
          gridPitchY: expanded.meta.pitchY,
        };
        setNestResult(gridResult);
        setLastNestPayload({
          sheets,
          parts: nestPartsPayload,
          config: configSummary,
          attemptsUsed: 1,
        });
        setPageLastUpdated(new Date());
        return;
      }

      for (let attempt = 1; attempt <= attempts; attempt++) {
        if (nestRunVersionRef.current !== myVersion) {
          return;
        }

        if (attempts > 1) {
          setNestProgressLabel(`Attempt ${attempt} / ${attempts}`);
        }

        const seedChromosomeForRun =
          placementLane.kind === "full" &&
          nestUiSettings.nestSearchPhase === "refine" &&
          nestSelectedSeedIndex != null
            ? nestTopSeeds[nestSelectedSeedIndex]?.chromosome
            : undefined;

        const payload = {
          sheets,
          parts: nestPartsPayload,
          config: apiConfig,
          requestTimeoutMs,
          ...(seedChromosomeForRun
            ? { chromosome: seedChromosomeForRun }
            : {}),
        };

        if (nestRunVersionRef.current !== myVersion) {
          return;
        }

        const postStarted = performance.now();
        const res = await postNestWith503Retry(
          endpoints.nest,
          payload,
          endpoints.stop,
        );
        const clientRequestDurationMs = Math.round(
          performance.now() - postStarted,
        );
        let raw: NestApiResponse = {} as NestApiResponse;
        let responseParseError: string | undefined;
        try {
          const parsed: unknown = await res.json();
          if (parsed && typeof parsed === "object") {
            raw = parsed as NestApiResponse;
          }
        } catch (pe) {
          responseParseError =
            pe instanceof Error ? pe.message : String(pe);
        }

        const failureCtx: NestFailureContext = {
          nestPath: endpoints.isDirect ? "direct" : "proxy",
          clientRequestDurationMs,
          responseParseError,
        };

        if (nestRunVersionRef.current !== myVersion) {
          return;
        }

        if (responseParseError) {
          const synthetic = {
            error: res.ok
              ? "Nesting returned a non-JSON response"
              : res.statusText || "Non-JSON error response",
          } as NestApiResponse;
          const { userMessage, adminDetail } = parseNestFailure(
            res,
            synthetic,
            failureCtx,
          );
          lastAttemptError = userMessage;
          lastAttemptAdmin = adminDetail;
          if (attempts === 1 || shouldAbortMultiAttemptNest(res.status)) {
            setNestError(lastAttemptError);
            setNestErrorAdmin(lastAttemptAdmin);
            return;
          }
          continue;
        }

        if (!res.ok) {
          const { userMessage, adminDetail } = parseNestFailure(
            res,
            raw,
            failureCtx,
          );
          lastAttemptError = userMessage;
          lastAttemptAdmin = adminDetail;
          if (
            attempts > 1 &&
            shouldRetryNestOnRecoverableFailure(
              res.status,
              raw,
              attempt,
              attempts,
            )
          ) {
            setNestProgressLabel(
              `No layout on attempt ${attempt} of ${attempts} — retrying…`,
            );
            const backoff =
              NEST_RETRY_BACKOFF_MIN_MS +
              Math.floor(Math.random() * NEST_RETRY_BACKOFF_EXTRA_MS);
            await new Promise((r) => window.setTimeout(r, backoff));
            continue;
          }
          if (attempts === 1 || shouldAbortMultiAttemptNest(res.status)) {
            setNestError(lastAttemptError);
            setNestErrorAdmin(lastAttemptAdmin);
            return;
          }
          continue;
        }

        const data = stripNestApiDiagnostics(raw);
        if (
          placementLane.kind === "full" &&
          (nestUiSettings.nestSearchPhase === "explore" ||
            nestUiSettings.nestSearchPhase === "refine")
        ) {
          const label =
            nestUiSettings.nestSearchPhase === "refine"
              ? attempts > 1
                ? `Refine · try ${attempt}`
                : "Refine"
              : attempts > 1
                ? `Attempt ${attempt}`
                : undefined;
          setNestTopSeeds((prev) => {
            const next = mergeTopNestSeeds(prev, data, label);
            const fp = nestJobCtxFingerprint.fingerprint;
            if (fp) saveNestSeedsToStorage(fp, next);
            return next;
          });
        }
        if (nestAttemptBetter(data, bestResult)) {
          bestResult = data;
          bestPayloadBody = payload;
          successfulAttempt = attempt;
        }
      }

      if (!bestResult && lastAttemptError) {
        setNestError(lastAttemptError);
        setNestErrorAdmin(lastAttemptAdmin);
      }

      if (bestResult && bestPayloadBody) {
        const configSummary: Record<string, string | number | boolean> = {
          spacing: apiConfig.spacing,
          rotations: apiConfig.rotations,
          placementType: apiConfig.placementType,
          mergeLines: apiConfig.mergeLines,
          curveTolerance: apiConfig.curveTolerance,
          simplify: apiConfig.simplify,
          clipperScale: apiConfig.clipperScale,
          populationSize: apiConfig.populationSize,
          mutationRate: apiConfig.mutationRate,
          gaGenerations: apiConfig.gaGenerations,
          timeRatio: apiConfig.timeRatio,
          scale: apiConfig.scale,
          attempts,
          requestTimeoutSec,
          nestStrategy: nestUiSettings.nestStrategy,
          nestSearchPhase: nestUiSettings.nestSearchPhase,
        };
        setNestResult(bestResult);
        setLastNestPayload({
          sheets: bestPayloadBody.sheets,
          parts: bestPayloadBody.parts,
          config: configSummary,
          attemptsUsed: successfulAttempt ?? attempts,
        });
        setPageLastUpdated(new Date());
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const looksNetwork =
        /network|fetch|failed|aborted|load failed|econnrefused|failed to fetch/i.test(
          msg,
        );
      const pathLine = endpoints.isDirect
        ? "Nest request path: direct (browser → NestNow; no Next.js proxy)"
        : "Nest request path: app proxy (browser → /api/nest → NestNow)";
      const quickIt = `--- IT quick read ---\n${pathLine}\nNote: client exception before a normal HTTP JSON body (e.g. fetch aborted or runtime error).\n---------------------`;
      setNestError(
        looksNetwork
          ? `Could not complete the nesting request. Check that NestNow is running (e.g. npm run start:server) and try again. (${msg})`
          : `Nesting request failed: ${msg}`,
      );
      setNestErrorAdmin(`${quickIt}\n\n${msg}`);
    } finally {
      window.clearInterval(progressTimer);
      nestInFlightRef.current = false;
      const elapsed = Date.now() - nestLoadStartedAt;
      const pad = Math.max(0, NEST_LOADING_MIN_VISIBLE_MS - elapsed);
      if (pad > 0 && nestRunVersionRef.current === myVersion) {
        await new Promise((r) => window.setTimeout(r, pad));
      }
      if (nestRunVersionRef.current === myVersion) {
        setNestLoading(false);
        setNestProgressLabel(null);
        setNestLiveBestSoFar(null);
        setNestRunPreviewGeometry(null);
      }
    }
  }

  async function handleStopNest() {
    if (!nestLoading) return;
    /** Last full-round snapshot from GET /progress; mid-round stop may omit the latest intra-round improvement. */
    const liveBest = nestLiveBestSoFarRef.current;
    const previewGeom = nestRunPreviewGeometryRef.current;
    const apiConfig = buildApiNestConfig(nestUiSettings);
    const requestTimeoutSec = clampNestRequestTimeoutSec(
      nestUiSettings.requestTimeoutSec,
    );
    const attempts = Math.min(
      NEST_UI_MAX_SEPARATE_ATTEMPTS,
      Math.max(1, Math.floor(nestUiSettings.attempts) || 1),
    );
    nestRunVersionRef.current += 1;
    try {
      await fetch(nestActiveEndpointsRef.current.stop, { method: "POST" });
    } finally {
      nestInFlightRef.current = false;
      setNestLoading(false);
      setNestProgressLabel(null);
      const canPromote =
        liveBest &&
        Array.isArray(liveBest.placements) &&
        liveBest.placements.length > 0 &&
        previewGeom?.parts?.length &&
        previewGeom.sheets?.length;
      if (canPromote) {
        setNestError(null);
        setNestErrorAdmin(null);
        setNestCandidateIndex(0);
        setNestResult(liveBest);
        setLastNestPayload({
          sheets: previewGeom.sheets,
          parts: previewGeom.parts,
          config: {
            spacing: apiConfig.spacing,
            rotations: apiConfig.rotations,
            placementType: apiConfig.placementType,
            mergeLines: apiConfig.mergeLines,
            curveTolerance: apiConfig.curveTolerance,
            simplify: apiConfig.simplify,
            clipperScale: apiConfig.clipperScale,
            populationSize: apiConfig.populationSize,
            mutationRate: apiConfig.mutationRate,
            gaGenerations: apiConfig.gaGenerations,
            timeRatio: apiConfig.timeRatio,
            scale: apiConfig.scale,
            attempts,
            requestTimeoutSec,
            nestStrategy: nestUiSettings.nestStrategy,
            stoppedWithPartialLayout: true,
          },
          attemptsUsed: 0,
        });
        setPageLastUpdated(new Date());
      }
      setNestLiveBestSoFar(null);
      setNestRunPreviewGeometry(null);
    }
  }

  useEffect(() => {
    fetchSheets();
    const channel = supabase
      .channel("sheet-stock-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sheet_stock" },
        fetchSheets,
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetchOpenQuotesCount();
  }, [status, fetchOpenQuotesCount]);

  const toggleSelectedSheet = (dbId?: string) => {
    if (!dbId) return;
    setSelectedSheetIds((prev) =>
      prev.includes(dbId) ? prev.filter((id) => id !== dbId) : [...prev, dbId],
    );
  };

  const resetSheetForm = () => {
    setSheetLengthIn("");
    setSheetWidthIn("");
    setSheetThicknessIn("");
    setSheetMaterial("");
    setSheetLabel("");
    setSheetNotes("");
    setSheetStatus("available");
    setAddSheetError(null);
    setAddSheetLoading(false);
    setEditingSheetId(null);
  };

  const handleOpenEditSheet = (remnant: Remnant) => {
    if (!remnant.db_id) return;
    setEditingSheetId(remnant.db_id);
    setAddStockMode("sheet");
    setSheetLengthIn(
      remnant.length_in !== undefined ? String(remnant.length_in) : "",
    );
    setSheetWidthIn(
      remnant.width_in !== undefined ? String(remnant.width_in) : "",
    );
    setSheetThicknessIn(
      remnant.thickness_in !== undefined ? String(remnant.thickness_in) : "",
    );
    setSheetMaterial(remnant.material ?? "");
    setSheetLabel(remnant.label ?? "");
    setSheetNotes(remnant.notes ?? "");
    setSheetStatus(
      remnant.status === "Allocated"
        ? "allocated"
        : remnant.status === "Consumed"
          ? "consumed"
          : remnant.status === "Scrap"
            ? "scrap"
            : "available",
    );
    setAddSheetError(null);
    setIsModalOpen(true);
  };

  const handleSaveSheet = async () => {
    if (addStockMode !== "sheet") return;
    setAddSheetError(null);
    const length = parseFloat(sheetLengthIn);
    const width = parseFloat(sheetWidthIn);
    const thickness = parseFloat(sheetThicknessIn);
    if (!Number.isFinite(length) || length <= 0) {
      setAddSheetError("Length must be a positive number.");
      return;
    }
    if (!Number.isFinite(width) || width <= 0) {
      setAddSheetError("Width must be a positive number.");
      return;
    }
    if (!Number.isFinite(thickness) || thickness <= 0) {
      setAddSheetError("Thickness must be a positive number.");
      return;
    }
    if (!sheetMaterial.trim()) {
      setAddSheetError("Material is required.");
      return;
    }
    setAddSheetLoading(true);

    // Shared payload for insert/update
    const basePayload: any = {
      length_in: length,
      width_in: width,
      thickness_in: thickness,
      material: sheetMaterial.trim(),
      status: sheetStatus || "available",
    };
    basePayload.label = sheetLabel.trim() || null;
    basePayload.notes = sheetNotes.trim() || null;

    let data;
    let error;

    if (editingSheetId) {
      // Update existing sheet_stock row
      ({ data, error } = await supabase
        .from("sheet_stock")
        .update(basePayload)
        .eq("id", editingSheetId)
        .select("*")
        .single());
    } else {
      // Create new sheet_stock row
      const insertPayload = { ...basePayload, kind: "sheet", is_archived: false };
      ({ data, error } = await supabase
        .from("sheet_stock")
        .insert([insertPayload])
        .select("*")
        .single());
    }

    if (error) {
      setAddSheetError(error.message ?? "Failed to save sheet.");
      setAddSheetLoading(false);
      return;
    }

    const remnantFromRow = mapRowToRemnant(data);
    setRemnants((prev) => {
      if (!editingSheetId) {
        return [remnantFromRow, ...prev];
      }
      return prev.map((r) =>
        r.db_id === editingSheetId ? remnantFromRow : r,
      );
    });

    setAddSheetLoading(false);
    resetSheetForm();
    setAddStockMode(null);
    setIsModalOpen(false);
  };

  const safePreviewSheetIndex = useMemo(() => {
    const n = displayedNestResult?.placements?.length ?? 0;
    if (n <= 0) return 0;
    return Math.min(Math.max(0, previewSheetIndex), n - 1);
  }, [displayedNestResult?.placements?.length, previewSheetIndex]);

  const liveSafePreviewSheetIndex = useMemo(() => {
    const n = nestLiveBestSoFar?.placements?.length ?? 0;
    if (n <= 0) return 0;
    return Math.min(Math.max(0, previewSheetIndex), n - 1);
  }, [nestLiveBestSoFar?.placements?.length, previewSheetIndex]);

  const liveNestPreviewWorld = useMemo(() => {
    if (
      !nestRunPreviewGeometry?.parts?.length ||
      !nestLiveBestSoFar?.placements?.length
    ) {
      return { worldW: 96, worldH: 48 };
    }
    const sheet = nestRunPreviewGeometry.sheets[liveSafePreviewSheetIndex];
    const dim = sheet
      ? nestSheetPreviewDimensions(sheet)
      : { width: 96, height: 48 };
    const sw = dim.width;
    const sh = dim.height;
    const sheetOutlineNest = sheet
      ? nestSheetPayloadToPreviewOutline(sheet)
      : undefined;
    const sheetplacements =
      nestLiveBestSoFar.placements[liveSafePreviewSheetIndex]
        ?.sheetplacements ?? [];
    return computeNestPreviewWorld(
      sw,
      sh,
      nestRunPreviewGeometry.parts as NestPreviewPart[],
      sheetplacements,
      sheetOutlineNest,
    );
  }, [
    nestRunPreviewGeometry,
    liveSafePreviewSheetIndex,
    nestLiveBestSoFar,
  ]);

  const completedNestPreviewWorld = useMemo(() => {
    if (
      !lastNestPayload?.parts?.length ||
      !displayedNestResult?.placements?.length
    ) {
      return { worldW: 96, worldH: 48 };
    }
    const sheet = lastNestPayload.sheets[safePreviewSheetIndex];
    const dim = sheet
      ? nestSheetPreviewDimensions(sheet)
      : { width: 96, height: 48 };
    const sw = dim.width;
    const sh = dim.height;
    const sheetOutlineNest = sheet
      ? nestSheetPayloadToPreviewOutline(sheet)
      : undefined;
    const sheetplacements =
      displayedNestResult.placements[safePreviewSheetIndex]
        ?.sheetplacements ?? [];
    return computeNestPreviewWorld(
      sw,
      sh,
      lastNestPayload.parts as NestPreviewPart[],
      sheetplacements,
      sheetOutlineNest,
    );
  }, [lastNestPayload, safePreviewSheetIndex, displayedNestResult]);

  const handleNestDxfExport = useCallback(async () => {
    setNestDxfExportError("");
    setNestDxfExporting(true);
    try {
      if (
        nestLoading ||
        !lastNestPayload?.parts?.length ||
        !displayedNestResult?.placements?.length
      ) {
        setNestDxfExportError(
          "Export is available only after nesting finishes.",
        );
        return;
      }
      const sheet = lastNestPayload.sheets[safePreviewSheetIndex];
      if (!sheet) {
        setNestDxfExportError("Sheet data missing for this preview.");
        return;
      }
      const placementsRow =
        displayedNestResult.placements[safePreviewSheetIndex];
      const sheetplacements = placementsRow?.sheetplacements ?? [];
      const th = parseFloat(nestDxfTextHeight.replace(",", "."));
      const textHeight = Number.isFinite(th) && th > 0 ? th : 1;
      const dxf = buildNestSheetDxf(
        sheet,
        lastNestPayload.parts,
        sheetplacements,
        {
          includePartNames: nestDxfIncludeLabels,
          includeSheetOutline: nestDxfIncludeSheetOutline,
          textHeight,
        },
      );
      const sheetNum = safePreviewSheetIndex + 1;
      if (nestDxfExportMethod === "download") {
        const filename = nestDxfFilename(sheetNum);
        const blob = new Blob([dxf], {
          type: "application/dxf;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert(`Downloaded: ${filename}`);
        setNestDxfModalOpen(false);
        return;
      }
      if (!nestDxfSelectedJob) {
        setNestDxfExportError("Please select a job.");
        return;
      }
      const selectedProject = nestDxfProjects.find(
        (p) => p.project_number === nestDxfSelectedJob,
      );
      if (!selectedProject) {
        setNestDxfExportError("Selected project not found.");
        return;
      }
      const freshSessionRes = await fetch("/api/auth/session");
      const freshSession = await freshSessionRes.json();
      const freshToken = freshSession?.accessToken;
      if (!freshToken) {
        setNestDxfExportError(
          "No access token. Please sign out and sign back in.",
        );
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const filename = `Nest_${nestDxfSelectedJob}_Sheet${sheetNum}_${stamp}.dxf`;
      const path = await uploadDxfToProjectCad(
        freshToken,
        selectedProject.customer,
        selectedProject.project_number,
        selectedProject.project_name,
        filename,
        dxf,
      );
      alert(`Uploaded to OneDrive: ${path}`);
      setNestDxfModalOpen(false);
      setNestDxfSelectedJob("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Export failed";
      setNestDxfExportError(message);
    } finally {
      setNestDxfExporting(false);
    }
  }, [
    nestLoading,
    lastNestPayload,
    displayedNestResult,
    safePreviewSheetIndex,
    nestDxfTextHeight,
    nestDxfIncludeLabels,
    nestDxfIncludeSheetOutline,
    nestDxfExportMethod,
    nestDxfSelectedJob,
    nestDxfProjects,
  ]);

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-white">
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center text-zinc-400">
        <p className="mb-6 text-lg text-zinc-300">Sign in to use Nest &amp; remnants.</p>
        <button
          type="button"
          onClick={() => signIn()}
          className="rounded-2xl bg-blue-600 px-8 py-3 text-sm font-medium text-white hover:bg-blue-700"
        >
          Sign in
        </button>
      </div>
    );
  }

  if (!canUseNest) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center text-zinc-400">
        <p className="mb-2 text-lg text-zinc-200">Nesting access required.</p>
        <p className="mb-6 text-sm text-zinc-500">
          Your role does not have permission to run nesting or manage sheet stock.
        </p>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="rounded-2xl border border-zinc-700 px-8 py-3 text-sm font-medium text-white hover:bg-zinc-900"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  const filterDropdownEl =
    filterOpen &&
    filterDropdownPosition &&
    createPortal(
      <div
        ref={filterDropdownRef}
        className="w-64 rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl p-4"
        style={{
          position: "fixed",
          top: filterDropdownPosition.top,
          left: filterDropdownPosition.left,
          zIndex: 9999,
        }}
      >
        <div className="space-y-3">
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Material
          </label>
          <select
            value={filterMaterial}
            onChange={(e) => setFilterMaterial(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="">All materials</option>
            {uniqueMaterials.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Thickness (in.)
          </label>
          <select
            value={filterThickness}
            onChange={(e) => setFilterThickness(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="">All thicknesses</option>
            {uniqueThicknesses.map((t) => (
              <option key={t} value={t}>
                {t}&quot;
              </option>
            ))}
          </select>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setFilterMaterial("");
                setFilterThickness("");
              }}
              className="flex-1 px-3 py-2 rounded-lg bg-zinc-700/50 hover:bg-zinc-600 text-zinc-300 text-sm font-medium"
            >
              Clear filters
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );

  const lastNestSheetsUsed = displayedNestResult?.placements?.length ?? 0;
  const lastUtilDisplay =
    displayedNestResult != null
      ? `${(displayedNestResult.utilisation ?? 0).toFixed(2)}%`
      : "—";

  const showCompletedNestPreview =
    !nestLoading &&
    !!nestResult &&
    !!lastNestPayload &&
    !!displayedNestResult?.placements?.length;
  const showLiveNestPreview =
    nestLoading &&
    !!nestLiveBestSoFar?.placements?.length &&
    !!nestRunPreviewGeometry;

  return (
    <>
      <div className="min-h-screen bg-zinc-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <DashboardHeader
            userName={session?.user?.name}
            lastUpdated={pageLastUpdated}
            onSignOut={() => signOut({ callbackUrl: "/" })}
            title="Nest & remnants"
            subtitle="Select sheet stock, add parts, and run nests — without leaving Keystone PMS."
          />

          <div className="mt-8">
            <QuickLinksBar
              openQuotesCount={openQuotesCount}
              activeHref="/nest-remnants"
              newProjectHref="/new-project?returnTo=%2Fnest-remnants"
              role={role}
            />
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-xl">
            <div className="flex gap-1 border-b border-zinc-800 bg-zinc-950/80 p-1.5">
              <button
                type="button"
                onClick={() => setActiveTab("nest")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${activeTab === "nest"
                  ? "bg-zinc-800 text-cyan-100 shadow-sm ring-1 ring-cyan-500/30"
                  : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
                  }`}
              >
                <Layers className="size-4 shrink-0" />
                Nest
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("remnants")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${activeTab === "remnants"
                  ? "bg-zinc-800 text-purple-100 shadow-sm ring-1 ring-purple-500/30"
                  : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
                  }`}
              >
                <Package className="size-4 shrink-0" />
                Sheets
                <span className="tabular-nums text-zinc-500">
                  (
                  {searchQuery.trim() || filterMaterial || filterThickness
                    ? `${filteredRemnants.length}/${remnants.length}`
                    : remnants.length}
                  )
                </span>
              </button>
            </div>

          {/* Remnants Tab */}
          {activeTab === "remnants" && (
            <div className="p-6 sm:p-8">
              <section
                ref={remnantsSectionRef}
                aria-label="Sheet stock"
                className="scroll-mt-24"
              >
              <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="relative max-w-md flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search remnants, materials, jobs..."
                      className="w-full pl-12 pr-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={() => setRemnantsCardView((v) => !v)}
                      className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                        remnantsCardView
                          ? "border-purple-500/50 bg-purple-500/15 text-purple-100"
                          : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-white  "
                      }`}
                    >
                      {remnantsCardView ? (
                        <Table2 className="size-4" aria-hidden />
                      ) : (
                        <LayoutGrid className="size-4" aria-hidden />
                      )}
                      {remnantsCardView ? "Table focus" : "Card view"}
                    </button>
                    <div className="relative" ref={filterPanelRef}>
                      <button
                        ref={filterButtonRef}
                        type="button"
                        onClick={() => setFilterOpen((o) => !o)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-colors ${
                          filterMaterial || filterThickness
                            ? "bg-purple-500/20 border-purple-500/50 text-purple-200"
                            : "bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:text-white hover:border-purple-500"
                        }`}
                      >
                        <Filter className="w-4 h-4" />
                        <span className="text-sm">Filter</span>
                        {(filterMaterial || filterThickness) && (
                          <span className="ml-1 size-2 rounded-full bg-purple-500" />
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAddStockMode(null);
                        setIsModalOpen(true);
                      }}
                      className="flex items-center gap-2 rounded-xl border border-purple-500/50 bg-gradient-to-r from-purple-600 to-cyan-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg transition-all hover:from-purple-500 hover:to-cyan-500"
                    >
                      <Plus className="size-5" />
                      Add Stock
                    </button>
                  </div>
                </div>
              </div>
              {remnantsLoading && (
                <div className="py-16 text-center text-zinc-400">
                  <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin" />
                  Loading sheets…
                </div>
              )}
              {!remnantsLoading && remnantsError && (
                <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-6 py-4 text-amber-200">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 mt-0.5 text-amber-300" />
                    <div>
                      <p className="font-semibold">Failed to load sheets.</p>
                      <p className="text-sm text-amber-200/80">{remnantsError}</p>
                    </div>
                  </div>
                </div>
              )}
              {!remnantsLoading && (
                <>
                  {filteredRemnants.length === 0 && remnants.length > 0 &&
                    (searchQuery.trim() !== "" || filterMaterial || filterThickness) ? (
                    <div className="mb-10 rounded-2xl border border-zinc-700 bg-zinc-800/30 p-8 text-center">
                      <p className="text-zinc-400 mb-3">
                        {searchQuery.trim()
                          ? `No matches for "${searchQuery.trim()}".`
                          : "No sheets match the current filters."}
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        {searchQuery.trim() && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="text-purple-400 hover:text-purple-300 font-medium"
                          >
                            Clear search
                          </button>
                        )}
                        {(filterMaterial || filterThickness) && (
                          <button
                            type="button"
                            onClick={() => {
                              setFilterMaterial("");
                              setFilterThickness("");
                            }}
                            className="text-purple-400 hover:text-purple-300 font-medium"
                          >
                            Clear filters
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                  <>
                  <div className="mb-6 bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-950 border-b border-zinc-800">
                        <tr>
                          <th className="px-4 py-3 text-center text-xs font-medium text-zinc-400 uppercase tracking-widest w-14">
                            Nest
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-widest">
                            Label / ID
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-widest">
                            Material
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-widest">
                            Thickness
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-widest">
                            Size
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-widest">
                            Kind
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-widest">
                            Status
                          </th>
                          <th className="px-6 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800">
                        {filteredRemnants.map((r) => (
                          <tr key={r.db_id ?? r.id} className="hover:bg-purple-800/30 transition-colors">
                            <td className="px-3 py-3 text-center">
                              <input
                                type="checkbox"
                                title="Use in nest"
                                className="rounded border-zinc-600 bg-zinc-900 text-purple-500 focus:ring-purple-500"
                                checked={
                                  !!r.db_id && selectedSheetIds.includes(r.db_id)
                                }
                                disabled={!r.db_id}
                                onChange={() => toggleSelectedSheet(r.db_id)}
                              />
                            </td>
                            <td className="px-6 py-3 font-mono text-white">
                              {r.id}
                            </td>
                            <td className="px-6 py-3 text-zinc-200">
                              {r.material}
                            </td>
                            <td className="px-6 py-3 text-zinc-200">
                              {r.thickness_in.toFixed(3)}"
                            </td>
                            <td className="px-6 py-3 text-zinc-200">
                              {r.length_in && r.width_in
                                ? `${r.length_in} x ${r.width_in}`
                                : r.dims}
                            </td>
                            <td className="px-6 py-3 text-zinc-300">
                              Sheet
                            </td>
                            <td className="px-6 py-3">
                              <span
                                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${
                                  r.status === "Available"
                                    ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30"
                                    : r.status === "Allocated"
                                      ? "bg-amber-500/10 text-amber-400 ring-amber-500/30"
                                      : r.status === "Consumed"
                                        ? "bg-zinc-500/10 text-zinc-300 ring-zinc-500/30"
                                        : r.status === "Scrap"
                                          ? "bg-red-500/10 text-red-300 ring-red-500/30"
                                          : "bg-zinc-500/10 text-zinc-300 ring-zinc-500/30"
                                }`}
                              >
                                {r.status}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  className="text-xs font-medium text-purple-300 hover:text-purple-200"
                                  onClick={() => handleOpenEditSheet(r)}
                                >
                                  View / Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRequestDeleteSheet(r)}
                                  className="rounded-lg p-2 text-zinc-500 transition-all duration-200 hover:bg-red-500/20 hover:text-red-300"
                                  title="Archive sheet"
                                >
                                  <Trash2 size={16} strokeWidth={2} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {filteredRemnants.length === 0 && (
                          <tr>
                            <td
                              colSpan={8}
                              className="px-6 py-10 text-center text-zinc-500"
                            >
                              {remnants.length === 0
                                ? "No sheets/remnants yet – add stock above."
                                : (
                                  <>
                                    {searchQuery.trim()
                                      ? `No matches for "${searchQuery.trim()}". `
                                      : "No sheets match the current filters. "}
                                    {searchQuery.trim() && (
                                      <button
                                        type="button"
                                        onClick={() => setSearchQuery("")}
                                        className="font-medium text-purple-400 hover:text-purple-300"
                                      >
                                        Clear search
                                      </button>
                                    )}
                                    {(filterMaterial || filterThickness) && (
                                      <>
                                        {searchQuery.trim() && " "}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setFilterMaterial("");
                                            setFilterThickness("");
                                          }}
                                          className="font-medium text-purple-400 hover:text-purple-300"
                                        >
                                          Clear filters
                                        </button>
                                      </>
                                    )}
                                    {" "}to see all sheets.
                                  </>
                                )}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {remnantsCardView && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-6 transition-all duration-200">
                    {filteredRemnants.map((remnant, i) => (
                      <div
                        key={remnant.db_id ?? i}
                        className="group relative bg-gradient-to-b from-zinc-800 to-zinc-900/50 border border-purple-800/50 rounded-2xl p-6 shadow-xl hover:shadow-2xl hover:shadow-purple-500/25 hover:-translate-y-2 hover:border-purple-600/70 transition-all duration-500 overflow-hidden will-change-transform"
                      >
                        <div className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-gradient-to-r from-purple-400/0 via-purple-400/30 to-purple-400/0 animate-spin-slow opacity-0 group-hover:opacity-100 transition-all duration-500" />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-purple-500/2 to-transparent opacity-50 group-hover:opacity-100" />
                        <div className="relative z-10">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div>
                              <h3 className="font-bold text-xl text-white mb-1 truncate">
                                {remnant.id}
                              </h3>
                              <SheetWireframe
                                lengthIn={remnant.length_in}
                                widthIn={remnant.width_in}
                                dims={remnant.dims}
                              />
                            </div>
                            <label className="inline-flex items-center gap-2 text-xs text-purple-200">
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-purple-500 focus:ring-purple-500"
                                checked={
                                  !!remnant.db_id &&
                                  selectedSheetIds.includes(remnant.db_id)
                                }
                                onChange={() => toggleSelectedSheet(remnant.db_id)}
                              />
                              Use in Nest
                            </label>
                          </div>
                          <p className="text-blue-200 font-mono text-xl mb-5">
                            {remnant.dims}
                          </p>
                          <div className="space-y-1 text-sm mb-4">
                            <div className="flex justify-between">
                              <span className="text-zinc-400">Material:</span>{" "}
                              <span className="font-mono">{remnant.material}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-zinc-400">Thickness:</span>{" "}
                              <span className="font-mono">
                                {remnant.thickness_in.toFixed(3)}"
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-zinc-400">Weight:</span>{" "}
                              <span className="font-bold text-emerald-400">
                                {remnant.est_weight_lbs} lbs
                              </span>
                            </div>
                          </div>
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold border ${
                              remnant.status === "Available"
                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                : remnant.status === "Allocated"
                                  ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                                  : remnant.status === "Consumed"
                                    ? "bg-zinc-500/15 text-zinc-300 border-zinc-500/30"
                                    : remnant.status === "Scrap"
                                      ? "bg-red-500/15 text-red-300 border-red-500/30"
                                      : "bg-zinc-500/15 text-zinc-300 border-zinc-500/30"
                            }`}
                          >
                            {remnant.status}
                          </span>
                          {remnant.notes?.trim() && (
                            <p
                              className="mt-4 text-lg text-zinc-400 line-clamp-2"
                              title={remnant.notes.trim()}
                            >
                              {remnant.notes.trim()}
                            </p>
                          )}
                          <div className="flex gap-2 mt-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <button
                              className="flex-1 p-1 bg-purple-600/30 hover:bg-purple-500/50 border border-purple-500/40 rounded-xl text-purple-200 text-sm font-medium transition-all hover:scale-105"
                              onClick={() => handleOpenEditSheet(remnant)}
                            >
                              <Edit className="w-4 h-4 mr-3" /> Edit
                            </button>
                            <button
                              className="flex-1 p-1 bg-zinc-700/50 hover:bg-zinc-600 border border-zinc-600 rounded-xl text-zinc-300 text-sm font-medium transition-all hover:scale-105"
                              onClick={() => handleRequestDeleteSheet(remnant)}
                            >
                              <Trash2 className="w-4 h-4 mr-3" /> Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  )}
                  </>
                  )}
                </>
              )}
              </section>
              {!remnantsLoading && remnants.length === 0 && (
                <div className="text-center py-20 text-zinc-500">
                  <Package className="w-20 h-20 mx-auto mb-4 text-zinc-600" />
                  <p>
                    No remnants yet.{" "}
                    <button
                      onClick={() => {
                        setAddStockMode(null);
                        setIsModalOpen(true);
                      }}
                      className="text-purple-400 hover:text-purple-300 font-medium"
                    >
                      Add your first stock
                    </button>
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Nest Tool Tab */}
          {activeTab === "nest" && (
            <div className="grid grid-cols-1 gap-6 p-6 sm:p-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:items-stretch">
              <div className="order-1 flex min-h-0 min-w-0 flex-col gap-4 xl:sticky xl:top-4 xl:h-full xl:max-h-[min(96dvh,1100px)] xl:overflow-y-auto xl:self-stretch">
                <div className="flex min-h-[min(280px,40dvh)] max-xl:h-[min(50dvh,600px)] max-xl:shrink-0 flex-col overflow-hidden rounded-2xl border-2 border-dashed border-cyan-700/50 bg-zinc-800/30 shadow-inner xl:min-h-[min(50dvh,600px)] xl:flex-1 xl:shrink-0">
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-cyan-800/40 bg-zinc-950/50 px-2 py-2 sm:px-3">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                      {showCompletedNestPreview || showLiveNestPreview ? (
                        <>
                          <h4 className="text-sm font-bold text-cyan-100 sm:text-base">
                            {showLiveNestPreview && !showCompletedNestPreview
                              ? "Nest preview (live)"
                              : "Nest preview"}
                          </h4>
                          <span className="text-[10px] text-zinc-500 sm:text-[11px]">
                            Scroll to zoom · drag to pan
                          </span>
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                nestPreviewRef.current?.zoomOut()
                              }
                              className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                              aria-label="Zoom out nest preview"
                            >
                              <ZoomOut className="size-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                nestPreviewRef.current?.zoomIn()
                              }
                              className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                              aria-label="Zoom in nest preview"
                            >
                              <ZoomIn className="size-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                nestPreviewRef.current?.resetView()
                              }
                              className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                              aria-label="Reset nest preview view"
                              title="Fit sheet"
                            >
                              <RotateCcw className="size-4" />
                            </button>
                          </div>
                        </>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={!showCompletedNestPreview}
                      title={
                        showCompletedNestPreview
                          ? "Export the sheet shown in the preview (DXF)"
                          : "Available when nesting has finished"
                      }
                      onClick={() => setNestDxfModalOpen(true)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-600/80 bg-zinc-800/80 px-2.5 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
                        showCompletedNestPreview
                          ? "text-zinc-200 hover:border-zinc-500 hover:bg-zinc-700 hover:text-white"
                          : "cursor-not-allowed text-zinc-500 opacity-50"
                      }`}
                    >
                      Export .DXF
                    </button>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  {nestLoading && (
                    <div
                      className="flex min-h-0 flex-1 flex-col items-center justify-start gap-3 overflow-y-auto p-6 text-cyan-400"
                      aria-live="polite"
                      aria-busy="true"
                    >
                      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                        <Loader2 className="mr-1 size-12 shrink-0 animate-spin sm:mr-3" />
                        <span className="text-center">
                          {nestProgressLabel ?? "Nesting…"}
                          <span className="text-zinc-500">
                            {" "}
                            · {nestElapsedSec}s
                          </span>
                        </span>
                      </div>
                      <p className="max-w-md text-center text-xs leading-relaxed text-zinc-500">
                        Each layout evaluation can run up to{" "}
                        <span className="text-zinc-400">
                          {formatNestMaxEvalTime(nestDisplayTimeoutSec)}
                        </span>
                        . It can try many layouts in one run.
                      </p>
                      <p className="max-w-sm text-center text-xs text-zinc-500">
                        Stop cancels any further full attempts.
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-500">
                        <NestFieldHelp
                          fieldId="loadingNoProgress"
                          disabled={nestLoading}
                          label="Why nesting can take a long time"
                        />
                      </div>
                      {showLiveNestPreview &&
                        nestLiveBestSoFar &&
                        nestRunPreviewGeometry && (
                          <div className="mt-2 flex w-full max-w-full min-w-0 flex-col gap-2 border-t border-cyan-900/40 pt-4">
                            <p className="text-center text-[11px] text-cyan-200/85">
                              Best layout so far — updates after each improvement
                              round completes
                            </p>
                            {nestLiveBestSoFar.placements.length > 1 ? (
                              <div
                                className="flex flex-wrap justify-center gap-1"
                                role="tablist"
                                aria-label="Live preview sheet"
                              >
                                {nestLiveBestSoFar.placements.map((_, idx) => {
                                  const on = liveSafePreviewSheetIndex === idx;
                                  return (
                                    <button
                                      key={idx}
                                      type="button"
                                      role="tab"
                                      aria-selected={on}
                                      onClick={() => setPreviewSheetIndex(idx)}
                                      className={`rounded-lg px-2 py-0.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${
                                        on
                                          ? "bg-cyan-600/35 text-cyan-100 ring-1 ring-cyan-500/40"
                                          : "bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700"
                                      }`}
                                    >
                                      Sheet {idx + 1}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : null}
                            <div className="mx-auto min-h-0 w-full min-w-0 max-w-3xl overflow-hidden rounded-xl border border-cyan-700/40 bg-zinc-900/40 p-1">
                              <div
                                className={NEST_PREVIEW_FRAME_CLASS}
                                style={{
                                  aspectRatio: `${liveNestPreviewWorld.worldW} / ${liveNestPreviewWorld.worldH}`,
                                }}
                              >
                                <div className="absolute inset-0 min-h-0 min-w-0">
                                  <NestPreviewZoomable
                                    key={`live-${liveSafePreviewSheetIndex}-${nestPreviewSheetView(nestRunPreviewGeometry.sheets[liveSafePreviewSheetIndex]).sheetWidth}-${nestPreviewSheetView(nestRunPreviewGeometry.sheets[liveSafePreviewSheetIndex]).sheetHeight}`}
                                    ref={nestPreviewRef}
                                    {...nestPreviewSheetView(
                                      nestRunPreviewGeometry.sheets[
                                        liveSafePreviewSheetIndex
                                      ],
                                    )}
                                    parts={nestRunPreviewGeometry.parts}
                                    sheetplacements={
                                      nestLiveBestSoFar.placements[
                                        liveSafePreviewSheetIndex
                                      ]?.sheetplacements ?? []
                                    }
                                  />
                                </div>
                              </div>
                            </div>
                            <p className="text-center text-[10px] text-zinc-600">
                              fitness{" "}
                              <span className="font-mono text-zinc-500">
                                {typeof nestLiveBestSoFar.fitness === "number"
                                  ? nestLiveBestSoFar.fitness.toFixed(2)
                                  : "—"}
                              </span>
                              {" · "}
                              util{" "}
                              {(nestLiveBestSoFar.utilisation ?? 0).toFixed(2)}%
                              {" · "}
                              parts{" "}
                              <span className="font-mono text-zinc-500">
                                {nestLiveBestSoFar.placements.reduce(
                                  (n, p) =>
                                    n + (p.sheetplacements?.length ?? 0),
                                  0,
                                )}
                              </span>
                            </p>
                          </div>
                        )}
                    </div>
                  )}
                  {!nestLoading && nestError && (
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-6 text-amber-400">
                      <AlertCircle className="mb-3 size-12" />
                      <p className="mb-1 text-lg font-medium">Nesting failed</p>
                      <p className="max-w-md text-center text-sm text-zinc-400">
                        {nestError}
                      </p>
                      {nestErrorAdmin && (
                        <details className="mt-3 max-w-lg text-left">
                          <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-400">
                            Details for IT
                          </summary>
                          <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-zinc-950/80 p-3 font-mono text-[10px] leading-relaxed text-zinc-500">
                            {nestErrorAdmin}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                  {!nestLoading && nestResult && (
                    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-5">
                      {lastNestPayload &&
                        displayedNestResult?.placements &&
                        displayedNestResult.placements.length > 0 && (
                          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
                            {nestCandidateOptions.length > 1 ? (
                              <div
                                className="flex flex-wrap gap-1"
                                role="tablist"
                                aria-label="Layout candidates"
                              >
                                {nestCandidateOptions.map((opt, idx) => {
                                  const on = nestCandidateIndex === idx;
                                  return (
                                    <button
                                      key={idx}
                                      type="button"
                                      role="tab"
                                      aria-selected={on}
                                      onClick={() => setNestCandidateIndex(idx)}
                                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${
                                        on
                                          ? "bg-violet-600/35 text-violet-100 ring-1 ring-violet-500/40"
                                          : "bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                                      }`}
                                    >
                                      {idx === 0
                                        ? "Best"
                                        : `Alt ${idx + 1}`}{" "}
                                      <span className="font-mono text-[10px] opacity-80">
                                        {(opt.utilisation ?? 0).toFixed(2)}%
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : null}
                            {displayedNestResult.placements.length > 1 ? (
                              <div
                                className="flex flex-wrap gap-1"
                                role="tablist"
                                aria-label="Preview sheet"
                              >
                                {displayedNestResult.placements.map((_, idx) => {
                                  const on = safePreviewSheetIndex === idx;
                                  return (
                                    <button
                                      key={idx}
                                      type="button"
                                      role="tab"
                                      aria-selected={on}
                                      onClick={() => setPreviewSheetIndex(idx)}
                                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${
                                        on
                                          ? "bg-cyan-600/35 text-cyan-100 ring-1 ring-cyan-500/40"
                                          : "bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                                      }`}
                                    >
                                      Sheet {idx + 1}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : null}
                            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-cyan-700/50 bg-zinc-800/30 p-1">
                              <div
                                className={NEST_PREVIEW_FRAME_CLASS}
                                style={{
                                  aspectRatio: `${completedNestPreviewWorld.worldW} / ${completedNestPreviewWorld.worldH}`,
                                }}
                              >
                                <div className="absolute inset-0 min-h-0 min-w-0">
                                  <NestPreviewZoomable
                                    key={`${nestCandidateIndex}-${safePreviewSheetIndex}-${nestPreviewSheetView(lastNestPayload.sheets[safePreviewSheetIndex]).sheetWidth}-${nestPreviewSheetView(lastNestPayload.sheets[safePreviewSheetIndex]).sheetHeight}`}
                                    ref={nestPreviewRef}
                                    {...nestPreviewSheetView(
                                      lastNestPayload.sheets[
                                        safePreviewSheetIndex
                                      ],
                                    )}
                                    parts={lastNestPayload.parts}
                                    sheetplacements={
                                      displayedNestResult.placements[
                                        safePreviewSheetIndex
                                      ]?.sheetplacements ?? []
                                    }
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2">
                        <div className="rounded-lg border border-cyan-700/30 bg-zinc-800/50 px-2 py-1.5 sm:px-2.5 sm:py-2">
                          <div className="text-lg font-bold leading-none text-cyan-400 sm:text-xl">
                            {(displayedNestResult?.utilisation ?? 0).toFixed(2)}%
                          </div>
                          <div className="mt-0.5 text-[10px] leading-tight text-zinc-500 sm:text-[11px]">
                            Utilisation
                          </div>
                        </div>
                        <div className="rounded-lg border border-cyan-700/30 bg-zinc-800/50 px-2 py-1.5 sm:px-2.5 sm:py-2">
                          <div className="text-lg font-bold leading-none text-white sm:text-xl">
                            {(displayedNestResult?.placements ?? []).length}
                          </div>
                          <div className="mt-0.5 text-[10px] leading-tight text-zinc-500 sm:text-[11px]">
                            Sheets used
                          </div>
                        </div>
                        <div className="rounded-lg border border-cyan-700/30 bg-zinc-800/50 px-2 py-1.5 sm:px-2.5 sm:py-2">
                          <div className="text-lg font-bold leading-none text-white sm:text-xl">
                            {(displayedNestResult?.placements ?? []).reduce(
                              (n, p) =>
                                n + (p.sheetplacements?.length ?? 0),
                              0,
                            )}
                          </div>
                          <div className="mt-0.5 text-[10px] leading-tight text-zinc-500 sm:text-[11px]">
                            Parts placed
                          </div>
                        </div>
                      </div>
                      {lastNestPayload && (
                        <div className="space-y-1 rounded-xl border border-zinc-700/80 bg-zinc-900/40 px-3 py-2.5 text-[11px] text-zinc-400 sm:text-xs">
                          <div className="font-semibold text-zinc-300">
                            Last run parameters
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            <span title="Minimum clearance part-to-part and to sheet edge (DeepNest spacing).">
                              part/sheet gap{" "}
                              {String(lastNestPayload.config.spacing)}″
                            </span>
                            <span>
                              rotations {lastNestPayload.config.rotations}
                            </span>
                            <span>
                              placement{" "}
                              {String(lastNestPayload.config.placementType)}
                            </span>
                            {typeof lastNestPayload.config.nestStrategy ===
                              "string" && (
                              <span>
                                strategy{" "}
                                {String(lastNestPayload.config.nestStrategy)}
                              </span>
                            )}
                            {typeof lastNestPayload.config.gridStampsPlaced ===
                              "number" && (
                              <span title="Production grid: module copies placed.">
                                grid stamps{" "}
                                {String(lastNestPayload.config.gridStampsPlaced)}
                                /
                                {String(lastNestPayload.config.gridCapacity ?? "—")}
                              </span>
                            )}
                            <span>
                              merge{" "}
                              {lastNestPayload.config.mergeLines ? "on" : "off"}
                            </span>
                            <span>
                              attempts{" "}
                              {lastNestPayload.config.stoppedWithPartialLayout
                                ? "— (stopped early)"
                                : lastNestPayload.attemptsUsed}
                            </span>
                            {typeof lastNestPayload.config.requestTimeoutSec ===
                              "number" && (
                              <span
                                title="NestNow per-evaluation cap (not total time for the whole layout search)."
                              >
                                per-eval cap{" "}
                                {String(lastNestPayload.config.requestTimeoutSec)}
                                s
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-zinc-500">
                            <span>
                              curve tol{" "}
                              {String(lastNestPayload.config.curveTolerance)}
                            </span>
                            <span>
                              simplify{" "}
                              {lastNestPayload.config.simplify ? "on" : "off"}
                            </span>
                            <span>
                              clipper{" "}
                              {String(lastNestPayload.config.clipperScale)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {!nestLoading && !nestError && !nestResult && (
                    <div className="flex min-h-[220px] flex-1 flex-col items-center justify-center p-6">
                      <div className="text-center text-zinc-500">
                        <Zap className="mx-auto mb-4 size-16 animate-pulse text-cyan-500/50" />
                        <p className="mb-2 text-lg">Ready for nesting</p>
                        <p className="text-sm">
                          Click Generate Nest to run a demo nest.
                        </p>
                      </div>
                    </div>
                  )}
                  </div>
                </div>

              <div className="w-full shrink-0 bg-gradient-to-r from-purple-600/20 to-purple-700/20 border border-purple-500/30 rounded-3xl p-6 shadow-xl">
                <div className="flex w-full flex-col gap-6">
                  <div className="w-full min-w-0">
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h4 className="text-xl font-bold text-purple-100">
                        Selected for Nesting
                      </h4>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab("remnants");
                          window.requestAnimationFrame(() => {
                            remnantsSectionRef.current?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                          });
                        }}
                        className="shrink-0 rounded-xl border border-purple-500/40 bg-purple-950/50 px-4 py-2 text-sm font-medium text-purple-100 transition-colors hover:border-purple-400/60 hover:bg-purple-900/50"
                      >
                        Manage sheets
                      </button>
                    </div>
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {selectedForNest.length > 0 ? (
                        selectedForNest.map((r) => (
                          <div
                            key={r.db_id}
                            className="flex w-full items-center gap-3 rounded-xl border border-purple-500/30 bg-purple-500/20 p-3 text-sm text-purple-200"
                          >
                            <div className="flex-shrink-0">
                              <SheetWireframe
                                lengthIn={r.length_in}
                                widthIn={r.width_in}
                                dims={r.dims}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{r.id}</p>
                              <p className="text-xs text-purple-200/80">
                                {r.material} {r.thickness_in.toFixed(3)}" ·{" "}
                                {r.dims ?? "—"}
                              </p>
                              {typeof r.est_weight_lbs === "number" && (
                                <p className="mt-0.5 text-xs text-emerald-400/90">
                                  {r.est_weight_lbs} lbs
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleSelectedSheet(r.db_id)}
                              className="flex-shrink-0 text-xs text-purple-200/80 hover:text-red-300"
                            >
                              Remove from nest
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="py-2 text-sm text-purple-200/70">
                          No sheets selected. Use the{" "}
                          <span className="font-semibold">Quick sheet list</span>{" "}
                          on the right, or open the{" "}
                          <span className="font-semibold">Sheets</span> tab for
                          filters and bulk view.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="w-full min-w-0">
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h4 className="text-xl font-bold text-purple-100">
                        Parts in this Nest
                      </h4>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            alert("DXF/Parts upload coming soon. Shapes from DXF will be added to the same Parts list and used in nests alongside UI-created shapes.");
                          }}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-cyan-800/60 bg-cyan-950/40 px-3 py-2 text-sm font-medium text-cyan-100 transition-colors hover:border-cyan-600/60 hover:bg-cyan-900/45 sm:px-4"
                        >
                          <Upload className="size-4 shrink-0" aria-hidden />
                          Upload DXF
                        </button>
                        <button
                          type="button"
                          onClick={openAddShapeModal}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-purple-500/40 bg-purple-950/50 px-3 py-2 text-sm font-medium text-purple-100 transition-colors hover:border-purple-400/60 hover:bg-purple-900/50 sm:px-4"
                        >
                          <Plus className="size-4 shrink-0" aria-hidden />
                          + Add Shape
                        </button>
                      </div>
                    </div>
                    {parts.length === 0 ? (
                      <p className="text-sm text-purple-200/70">
                        No parts yet. Use <span className="font-semibold">Upload DXF</span> or <span className="font-semibold">+ Add Shape</span> above.
                      </p>
                    ) : (
                      <div className="w-full max-h-64 overflow-x-auto overflow-y-auto rounded-2xl border border-purple-500/40 bg-purple-950/30">
                        <table className="w-full text-sm">
                          <thead className="bg-purple-950/60 text-purple-200/80">
                            <tr>
                              <th className="px-3 py-2 text-left">Name</th>
                              <th className="px-3 py-2 text-left hidden sm:table-cell">
                                Type
                              </th>
                              <th className="px-3 py-2 text-left hidden sm:table-cell">
                                Dims
                              </th>
                              <th className="px-3 py-2 text-center">Rotate</th>
                              <th className="px-3 py-2 text-right">Qty</th>
                              <th className="px-3 py-2 text-right"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {parts.map((p) => (
                              <tr
                                key={p.id}
                                className="border-t border-purple-500/30 text-purple-50"
                              >
                                <td className="px-3 py-2 font-medium">
                                  {p.name}
                                </td>
                                <td className="px-3 py-2 text-xs text-purple-200/80 hidden sm:table-cell">
                                  {p.kind === "rect"
                                    ? "Rectangle"
                                    : p.kind === "round"
                                      ? "Round"
                                      : p.kind === "round_hole"
                                        ? "Round w/ hole"
                                        : "Polygon"}
                                </td>
                                <td className="px-3 py-2 text-xs text-purple-200/80 hidden sm:table-cell">
                                  {(() => {
                                    if (p.kind === "round" && p.meta?.source === "ui") {
                                      const params = p.meta.originalParams as
                                        | { od_in?: number }
                                        | undefined;
                                      const od = params?.od_in;
                                      if (typeof od === "number" && od > 0) {
                                        return `${od.toFixed(2)}" OD`;
                                      }
                                    }
                                    if (p.kind === "round_hole" && p.meta?.source === "ui") {
                                      const params = p.meta.originalParams as
                                        | { od_in?: number; id_in?: number }
                                        | undefined;
                                      const od = params?.od_in;
                                      const id = params?.id_in;
                                      if (
                                        typeof od === "number" &&
                                        od > 0 &&
                                        typeof id === "number" &&
                                        id > 0
                                      ) {
                                        return `${od.toFixed(2)}" OD x ${id.toFixed(2)}" ID`;
                                      }
                                    }
                                    return formatPartDims(getPartDims(p));
                                  })()}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    title="Allow rotation when nesting"
                                    checked={p.canRotate !== false}
                                    onChange={(e) =>
                                      setParts((prev) =>
                                        prev.map((row) =>
                                          row.id === p.id
                                            ? {
                                                ...row,
                                                canRotate: e.target.checked,
                                              }
                                            : row,
                                        ),
                                      )
                                    }
                                    className="rounded border-purple-500 text-purple-500"
                                  />
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <div className="inline-flex items-center gap-1 justify-end">
                                    <button
                                      type="button"
                                      aria-label="Decrease quantity"
                                      onClick={() =>
                                        setParts((prev) =>
                                          prev.map((row) =>
                                            row.id === p.id
                                              ? {
                                                  ...row,
                                                  quantity: Math.max(
                                                    1,
                                                    row.quantity - 1,
                                                  ),
                                                }
                                              : row,
                                          ),
                                        )
                                      }
                                      className="p-1 rounded border border-purple-500/40 text-purple-200 hover:bg-purple-500/20"
                                    >
                                      <Minus className="w-3.5 h-3.5" />
                                    </button>
                                    <span className="font-mono w-8 text-center inline-block">
                                      {p.quantity}
                                    </span>
                                    <button
                                      type="button"
                                      aria-label="Increase quantity"
                                      onClick={() =>
                                        setParts((prev) =>
                                          prev.map((row) =>
                                            row.id === p.id
                                              ? {
                                                  ...row,
                                                  quantity: row.quantity + 1,
                                                }
                                              : row,
                                          ),
                                        )
                                      }
                                      className="p-1 rounded border border-purple-500/40 text-purple-200 hover:bg-purple-500/20"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setParts((prev) =>
                                        prev.filter((existing) => existing.id !== p.id),
                                      )
                                    }
                                    className="text-xs text-purple-200/80 hover:text-red-300"
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {!nestLoading && nestResult && (
                <div className="w-full min-w-0 shrink-0 rounded-2xl border border-cyan-800/50 bg-zinc-900/50 p-4 sm:p-5">
                  <h4 className="mb-2 font-bold text-cyan-100">Placements</h4>
                  <div className="max-h-[min(40dvh,22rem)] overflow-x-auto overflow-y-auto rounded-xl border border-zinc-700">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-[1] bg-zinc-800/95 backdrop-blur-sm">
                        <tr className="text-left text-zinc-400">
                          <th className="px-4 py-2">Sheet</th>
                          <th className="px-4 py-2">Part</th>
                          <th className="px-4 py-2">X</th>
                          <th className="px-4 py-2">Y</th>
                          <th className="px-4 py-2">Rotation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(displayedNestResult?.placements ?? []).flatMap(
                          (s, si) =>
                            (s.sheetplacements ?? [])
                              .filter((p): p is SheetPlacement => Boolean(p))
                              .map((p, idx) => {
                                if (!p) return null;
                                const x = typeof p.x === "number" ? p.x : 0;
                                const y = typeof p.y === "number" ? p.y : 0;
                                const rotation =
                                  typeof p.rotation === "number"
                                    ? p.rotation
                                    : 0;
                                const keyId =
                                  typeof p.id === "number" ? p.id : idx;
                                return (
                                  <tr
                                    key={`${si}-${keyId}`}
                                    className="border-t border-zinc-700 text-zinc-300"
                                  >
                                    <td className="px-4 py-2">
                                      {(s.sheet ?? si) + 1}
                                    </td>
                                    <td className="px-4 py-2">
                                      {p.filename ?? `Part ${p.source ?? ""}`}
                                    </td>
                                    <td className="px-4 py-2 font-mono">
                                      {x.toFixed(1)}
                                    </td>
                                    <td className="px-4 py-2 font-mono">
                                      {y.toFixed(1)}
                                    </td>
                                    <td className="px-4 py-2">{rotation}°</td>
                                  </tr>
                                );
                              }),
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              </div>

              <div className="order-2 flex min-w-0 flex-col gap-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                    Quick sheet list
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("remnants");
                      window.requestAnimationFrame(() => {
                        remnantsSectionRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      });
                    }}
                    className="text-left text-xs font-medium text-purple-300 hover:text-purple-200 sm:text-right"
                  >
                    Advanced search, filters &amp; add stock → Sheets tab
                  </button>
                </div>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={nestSheetQuickFilter}
                    onChange={(e) => setNestSheetQuickFilter(e.target.value)}
                    placeholder="Filter by label, material, size…"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 py-2.5 pl-10 pr-3 text-sm text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                    aria-label="Filter sheets for nest"
                  />
                </div>
                {remnantsLoading && (
                  <p className="py-4 text-center text-sm text-zinc-500">
                    <Loader2 className="mr-2 inline size-4 animate-spin" />
                    Loading sheets…
                  </p>
                )}
                {!remnantsLoading && remnantsError && (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                    {remnantsError}
                  </p>
                )}
                {!remnantsLoading && !remnantsError && (
                  <div className="max-h-[10.5rem] overflow-y-auto rounded-lg border border-zinc-800">
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 text-[10px] font-medium uppercase tracking-wider text-zinc-500 backdrop-blur-sm sm:text-xs">
                        <tr>
                          <th className="w-10 px-2 py-2 text-center">Nest</th>
                          <th className="px-2 py-2">Label</th>
                          <th className="hidden px-2 py-2 sm:table-cell">Size</th>
                          <th className="hidden px-2 py-2 md:table-cell">
                            Mat / thick
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/80">
                        {nestQuickFilteredRemnants.map((r) => (
                          <tr
                            key={r.db_id ?? r.id}
                            className="hover:bg-zinc-800/40"
                          >
                            <td className="px-2 py-2 text-center">
                              <input
                                type="checkbox"
                                title="Use in nest"
                                className="rounded border-zinc-600 bg-zinc-900 text-purple-500 focus:ring-purple-500"
                                checked={
                                  !!r.db_id && selectedSheetIds.includes(r.db_id)
                                }
                                disabled={!r.db_id}
                                onChange={() => toggleSelectedSheet(r.db_id)}
                                aria-label={`Use ${r.id} in nest`}
                              />
                            </td>
                            <td className="max-w-[8rem] truncate px-2 py-2 font-mono text-zinc-100 sm:max-w-none">
                              {r.id}
                            </td>
                            <td className="hidden px-2 py-2 text-zinc-300 sm:table-cell">
                              {r.length_in && r.width_in
                                ? `${r.length_in}×${r.width_in}`
                                : (r.dims ?? "—")}
                            </td>
                            <td className="hidden px-2 py-2 text-zinc-400 md:table-cell">
                              <span className="line-clamp-2">
                                {r.material}{" "}
                                {r.thickness_in != null
                                  ? `${r.thickness_in.toFixed(3)}"`
                                  : ""}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {nestQuickFilteredRemnants.length === 0 && (
                          <tr>
                            <td
                              colSpan={4}
                              className="px-3 py-6 text-center text-zinc-500"
                            >
                              {remnants.length === 0
                                ? "No stock yet — use Sheets tab to add stock."
                                : nestSheetQuickFilter.trim()
                                  ? "No matches — try another filter or open the Sheets tab."
                                  : "No sheets to show."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex w-full min-w-0 flex-col rounded-3xl border-2 border-cyan-800/50 bg-gradient-to-br from-zinc-900/70 to-zinc-950/50 p-6 shadow-xl shadow-cyan-500/10 backdrop-blur-sm sm:p-8">
                <div className="mb-4 space-y-3 border-b border-zinc-800/90 pb-3">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-cyan-800/60 bg-cyan-950/40 text-cyan-300">
                        <Layers className="size-5" aria-hidden />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-cyan-100 sm:text-xl">
                          Nesting
                        </h3>
                        <p className="text-[11px] text-zinc-500 sm:text-xs">
                          Add parts, pick stock, then run the nest.
                        </p>
                      </div>
                    </div>

                    <div className="grid min-w-0 grid-cols-[2fr_1fr] gap-2 sm:gap-3">
                      <button
                        type="button"
                        onClick={handleGenerateNest}
                        disabled={nestLoading}
                        className="flex min-h-[3rem] min-w-0 items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-3 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-900/35 ring-1 ring-emerald-400/50 transition hover:from-emerald-400 hover:to-teal-500 hover:shadow-emerald-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:pointer-events-none disabled:opacity-55 sm:px-4"
                      >
                        {nestLoading ? (
                          <Loader2 className="size-5 shrink-0 animate-spin" />
                        ) : (
                          <Zap className="size-5 shrink-0" aria-hidden />
                        )}
                        <span className="truncate">
                          {nestLoading ? "Nesting…" : "Generate Nest"}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={handleStopNest}
                        disabled={!nestLoading}
                        className="flex min-h-[3rem] min-w-0 items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-950/30 px-2 py-3.5 text-sm font-semibold text-red-100 shadow-md shadow-red-950/20 transition hover:border-red-400/55 hover:bg-red-950/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:pointer-events-none disabled:border-zinc-700 disabled:bg-zinc-900/50 disabled:text-zinc-500 disabled:shadow-none sm:text-base"
                      >
                        <X className="size-5 shrink-0" aria-hidden />
                        <span className="truncate">Stop</span>
                      </button>
                    </div>

                    <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                      <span className="text-xs font-medium text-zinc-400">
                        <NestLabelWithHelp
                          fieldId="nestStrategy"
                          disabled={nestLoading}
                        >
                          Strategy
                        </NestLabelWithHelp>
                      </span>
                      <select
                        value={nestUiSettings.nestStrategy}
                        disabled={nestLoading}
                        onChange={(e) =>
                          setNestUiSettings((s) => ({
                            ...s,
                            nestStrategy: e.target.value as
                              | "auto"
                              | "production_batch"
                              | "tight",
                          }))
                        }
                        className="w-full min-w-0 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 sm:max-w-xs"
                        aria-label="Nesting strategy"
                      >
                        <option value="auto">Auto</option>
                        <option value="production_batch">
                          Production (grid)
                        </option>
                        <option value="tight">Tight (full search)</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 border-t border-zinc-800/80 pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-medium text-zinc-500">
                        Presets
                      </span>
                      <button
                        type="button"
                        disabled={nestLoading}
                        onClick={() =>
                          setNestUiSettings((s) => ({
                            ...s,
                            ...NEST_PRESET_PREVIEW_FIELDS,
                          }))
                        }
                        className="rounded-lg border border-amber-700/50 bg-amber-950/40 px-2.5 py-1 text-[11px] font-medium text-amber-100/90 hover:bg-amber-900/50 disabled:opacity-50"
                      >
                        Preview (fast)
                      </button>
                      <button
                        type="button"
                        disabled={nestLoading}
                        onClick={() =>
                          setNestUiSettings((s) => ({
                            ...s,
                            ...NEST_PRESET_FINAL_FIELDS,
                          }))
                        }
                        className="rounded-lg border border-cyan-800/60 bg-cyan-950/30 px-2.5 py-1 text-[11px] font-medium text-cyan-100/90 hover:bg-cyan-900/40 disabled:opacity-50"
                      >
                        Final (quality)
                      </button>
                      <button
                        type="button"
                        disabled={nestLoading}
                        onClick={() =>
                          setNestUiSettings((s) => ({
                            ...s,
                            ...NEST_PRESET_EXPLORE_FIELDS,
                          }))
                        }
                        className="rounded-lg border border-violet-700/50 bg-violet-950/35 px-2.5 py-1 text-[11px] font-medium text-violet-100/90 hover:bg-violet-900/45 disabled:opacity-50"
                      >
                        Explore (phase 1)
                      </button>
                      <button
                        type="button"
                        disabled={nestLoading}
                        onClick={() =>
                          setNestUiSettings((s) => ({
                            ...s,
                            ...NEST_PRESET_REFINE_FIELDS,
                          }))
                        }
                        className="rounded-lg border border-fuchsia-800/50 bg-fuchsia-950/30 px-2.5 py-1 text-[11px] font-medium text-fuchsia-100/90 hover:bg-fuchsia-900/40 disabled:opacity-50"
                      >
                        Refine (phase 2)
                      </button>
                      <NestFieldHelp fieldId="nestExploreRefine" />
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      Search phase:{" "}
                      <span className="font-medium text-zinc-300">
                        {nestUiSettings.nestSearchPhase === "refine"
                          ? "Refine — pick a seed below, then Generate"
                          : "Explore — seeds accumulate for Refine"}
                      </span>
                    </p>
                    {nestTopSeeds.length > 0 && (
                      <div className="rounded-xl border border-zinc-700/80 bg-zinc-950/40 p-3">
                        <div className="mb-2 flex w-full min-w-0 flex-wrap items-center gap-2">
                          <span className="text-[11px] font-medium text-zinc-300">
                            Top seeds (job)
                          </span>
                          <NestFieldHelp fieldId="nestSeeds" />
                          <button
                            type="button"
                            disabled={nestLoading}
                            onClick={clearNestTopSeedsForJob}
                            className="ml-auto shrink-0 rounded-md border border-zinc-600 bg-zinc-900/80 px-2 py-1 text-[10px] font-medium text-zinc-300 hover:bg-zinc-800/80 disabled:pointer-events-none disabled:opacity-50"
                          >
                            Clear seeds
                          </button>
                        </div>
                        <ul className="grid gap-2 sm:grid-cols-3">
                          {nestTopSeeds.map((seed, i) => {
                            const selected = nestSelectedSeedIndex === i;
                            return (
                              <li
                                key={`${seed.fitness}-${i}`}
                                className={`flex min-w-0 flex-col gap-1.5 rounded-lg border p-2.5 text-[11px] ${
                                  selected
                                    ? "border-fuchsia-500/60 bg-fuchsia-950/25"
                                    : "border-zinc-700/70 bg-zinc-900/40"
                                }`}
                              >
                                <div className="font-semibold tabular-nums text-zinc-200">
                                  #{i + 1} · fitness {seed.fitness.toFixed(4)}{" "}
                                  · util{" "}
                                  {(seed.utilisation ?? 0).toFixed(1)}%
                                </div>
                                {seed.attemptLabel ? (
                                  <div className="truncate text-zinc-500">
                                    {seed.attemptLabel}
                                  </div>
                                ) : null}
                                {!seed.chromosome ? (
                                  <div className="text-amber-200/85">
                                    No chromosome — update NestNow to enable
                                    Refine seeding.
                                  </div>
                                ) : null}
                                <div className="mt-auto flex flex-wrap gap-1.5">
                                  <button
                                    type="button"
                                    disabled={nestLoading}
                                    onClick={() => applyNestSeedPreview(seed)}
                                    className="rounded-md border border-zinc-600 bg-zinc-800/80 px-2 py-1 text-[10px] font-medium text-zinc-200 hover:bg-zinc-700/80 disabled:opacity-50"
                                  >
                                    Preview
                                  </button>
                                  <button
                                    type="button"
                                    disabled={nestLoading || !seed.chromosome}
                                    onClick={() => setNestSelectedSeedIndex(i)}
                                    className="rounded-md border border-fuchsia-700/50 bg-fuchsia-950/40 px-2 py-1 text-[10px] font-medium text-fuchsia-100 hover:bg-fuchsia-900/50 disabled:opacity-50"
                                  >
                                    Use for Refine
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                    <div className="flex flex-wrap items-start gap-2 text-[11px] leading-snug text-zinc-400">
                      <p className="min-w-0 flex-1">
                        <span className="font-medium tabular-nums text-zinc-300">
                          {nestPartStats.rowCount}
                        </span>{" "}
                        part row
                        {nestPartStats.rowCount === 1 ? "" : "s"} ·{" "}
                        <span className="font-medium tabular-nums text-zinc-300">
                          {nestPartStats.expanded}
                        </span>{" "}
                        pieces · ~{" "}
                        <span className="tabular-nums">
                          {nestPartStats.vertexTotal}
                        </span>{" "}
                        outline vertices · ~{" "}
                        <span className="tabular-nums">
                          {nestPartStats.approxPairs}
                        </span>{" "}
                        part pairs
                      </p>
                      <NestFieldHelp fieldId="partStatsHeavy" />
                    </div>
                    {(nestPartStats.expanded >= 40 ||
                      nestPartStats.vertexTotal >= 6000) && (
                      <p className="text-[11px] leading-snug text-amber-200/90">
                        Heavy nest — expect long runs. Start with Preview and
                        Geometry → simplify, or ask IT about single-pass mode on
                        the nesting server.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-end gap-4 text-sm">
                    <label className="flex min-w-[10rem] max-w-[14rem] flex-col gap-1 text-zinc-400">
                      <NestLabelWithHelp fieldId="spacing" disabled={nestLoading}>
                        <span>Part &amp; sheet edge gap (in)</span>
                      </NestLabelWithHelp>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={nestUiSettings.spacing}
                        onChange={(e) =>
                          setNestUiSettings((s) => ({
                            ...s,
                            spacing: Math.max(
                              0,
                              parseFloat(e.target.value) || 0,
                            ),
                          }))
                        }
                        disabled={nestLoading}
                        className="rounded-lg border border-cyan-900/50 bg-zinc-900 px-3 py-2 text-cyan-100 disabled:opacity-50"
                      />
                    </label>
                    <label className="flex min-w-[10rem] flex-col gap-1 text-zinc-400">
                      <NestLabelWithHelp fieldId="rotations" disabled={nestLoading}>
                        <span>Rotations to try</span>
                      </NestLabelWithHelp>
                      <select
                        value={nestUiSettings.rotations}
                        onChange={(e) =>
                          setNestUiSettings((s) => ({
                            ...s,
                            rotations: Number(e.target.value) || 4,
                          }))
                        }
                        disabled={nestLoading}
                        className="rounded-lg border border-cyan-900/50 bg-zinc-900 px-3 py-2 text-cyan-100 disabled:opacity-50"
                      >
                        {NEST_ROTATION_OPTIONS.map((n) => (
                          <option key={n} value={n}>
                            {n} orientations (every {(360 / n).toFixed(1)}°)
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="mb-4 rounded-2xl border border-cyan-800/40 bg-zinc-950/50 p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-zinc-300">
                      Layout goal
                    </span>
                    <NestFieldHelp
                      fieldId="layoutGoalIntro"
                      disabled={nestLoading}
                    />
                  </div>
                  <PlacementTypeVisuals
                    active={nestUiSettings.placementType}
                    disabled={nestLoading}
                    onSelect={(placementType) =>
                      setNestUiSettings((s) => ({ ...s, placementType }))
                    }
                  />
                </div>

                <div className="mb-4 rounded-2xl border border-cyan-800/40 bg-zinc-950/50 p-4">
                  <button
                    type="button"
                    onClick={() => setNestAdvancedOpen((o) => !o)}
                    className="flex items-center gap-1 text-xs font-medium text-cyan-300/90 hover:text-cyan-200"
                  >
                    {nestAdvancedOpen ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                    Advanced: search tuning &amp; geometry
                  </button>
                  {nestAdvancedOpen && (
                    <div className="mt-3 space-y-4 text-sm">
                      <p className="flex flex-wrap items-center gap-1 text-[11px] leading-snug text-zinc-500">
                        <span>
                          Defaults work for most jobs. Open{" "}
                          <span className="text-zinc-400">?</span> next to a field
                          for full detail.
                        </span>
                        <NestFieldHelp
                          fieldId="advancedDefaults"
                          disabled={nestLoading}
                          label="Default values for advanced nest settings"
                        />
                      </p>

                      <div className="space-y-3 rounded-xl border border-zinc-800/70 bg-zinc-900/20 px-3 py-2.5">
                        <span className="block text-[11px] font-medium text-zinc-400">
                          More tuning
                        </span>
                        <label className="flex max-w-md flex-col gap-1 text-zinc-400">
                          <span className="inline-flex items-center gap-1">
                            Separate full attempts
                            <NestFieldHelp
                              fieldId="attempts"
                              disabled={nestLoading}
                            />
                          </span>
                          <input
                            type="number"
                            min={1}
                            max={NEST_UI_MAX_SEPARATE_ATTEMPTS}
                            step={1}
                            value={nestUiSettings.attempts}
                            onChange={(e) =>
                              setNestUiSettings((s) => ({
                                ...s,
                                attempts: Math.min(
                                  NEST_UI_MAX_SEPARATE_ATTEMPTS,
                                  Math.max(
                                    1,
                                    parseInt(e.target.value, 10) || 1,
                                  ),
                                ),
                              }))
                            }
                            disabled={nestLoading}
                            className="rounded-lg border border-cyan-900/50 bg-zinc-900 px-3 py-2 text-cyan-100 disabled:opacity-50"
                          />
                          <span className="text-[10px] text-zinc-600">
                            With 2+, automatically retries when NestNow returns no
                            layout or placement failed (new roll of the genetic
                            search each time).
                          </span>
                        </label>
                        <label className="flex max-w-md flex-col gap-1 text-zinc-400">
                          <span className="inline-flex flex-wrap items-center gap-1">
                            Max time per layout try (seconds)
                            <NestFieldHelp
                              fieldId="requestTimeout"
                              disabled={nestLoading}
                            />
                          </span>
                          <input
                            type="number"
                            min={NEST_REQUEST_TIMEOUT_SEC_MIN}
                            max={NEST_REQUEST_TIMEOUT_SEC_MAX}
                            step={30}
                            value={nestUiSettings.requestTimeoutSec}
                            onChange={(e) =>
                              setNestUiSettings((s) => ({
                                ...s,
                                requestTimeoutSec: clampNestRequestTimeoutSec(
                                  parseInt(e.target.value, 10),
                                ),
                              }))
                            }
                            disabled={nestLoading}
                            className="rounded-lg border border-cyan-900/50 bg-zinc-900 px-3 py-2 text-cyan-100 disabled:opacity-50"
                          />
                          <span className="text-[10px] text-zinc-600">
                            Allowed range {NEST_REQUEST_TIMEOUT_SEC_MIN}–
                            {NEST_REQUEST_TIMEOUT_SEC_MAX}s per evaluation.
                          </span>
                        </label>
                      </div>

                      <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/20 px-3 py-2.5">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-medium text-zinc-400">
                            Automatic layout search
                          </span>
                          <NestFieldHelp
                            fieldId="layoutSearchIntro"
                            disabled={nestLoading}
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <label className="flex flex-col gap-1 text-zinc-400">
                            <span className="inline-flex items-center gap-1">
                              Improvement rounds
                              <NestFieldHelp
                                fieldId="gaGenerations"
                                disabled={nestLoading}
                              />
                            </span>
                            <input
                              type="number"
                              min={1}
                              max={NEST_UI_MAX_GA_GENERATIONS}
                              step={1}
                              value={nestUiSettings.gaGenerations}
                              onChange={(e) =>
                                setNestUiSettings((s) => ({
                                  ...s,
                                  gaGenerations: Math.min(
                                    NEST_UI_MAX_GA_GENERATIONS,
                                    Math.max(
                                      1,
                                      parseInt(e.target.value, 10) || 3,
                                    ),
                                  ),
                                }))
                              }
                              disabled={nestLoading}
                              className="rounded-lg border border-cyan-900/50 bg-zinc-900 px-3 py-2 text-cyan-100 disabled:opacity-50"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-zinc-400">
                            <span className="inline-flex items-center gap-1">
                              Search randomness
                              <NestFieldHelp
                                fieldId="mutationRate"
                                disabled={nestLoading}
                              />
                            </span>
                            <input
                              type="number"
                              min={0}
                              max={NEST_UI_MAX_MUTATION_RATE}
                              step={1}
                              value={nestUiSettings.mutationRate}
                              onChange={(e) =>
                                setNestUiSettings((s) => ({
                                  ...s,
                                  mutationRate: Math.min(
                                    NEST_UI_MAX_MUTATION_RATE,
                                    Math.max(
                                      0,
                                      parseInt(e.target.value, 10) || 10,
                                    ),
                                  ),
                                }))
                              }
                              disabled={nestLoading}
                              className="rounded-lg border border-cyan-900/50 bg-zinc-900 px-3 py-2 text-cyan-100 disabled:opacity-50"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-zinc-400">
                            <span className="inline-flex items-center gap-1">
                              Layouts tried at once
                              <NestFieldHelp
                                fieldId="populationSize"
                                disabled={nestLoading}
                              />
                            </span>
                            <input
                              type="number"
                              min={1}
                              max={NEST_UI_MAX_POPULATION_SIZE}
                              step={1}
                              value={nestUiSettings.populationSize}
                              onChange={(e) =>
                                setNestUiSettings((s) => ({
                                  ...s,
                                  populationSize: Math.min(
                                    NEST_UI_MAX_POPULATION_SIZE,
                                    Math.max(
                                      1,
                                      parseInt(e.target.value, 10) || 10,
                                    ),
                                  ),
                                }))
                              }
                              disabled={nestLoading}
                              className="rounded-lg border border-cyan-900/50 bg-zinc-900 px-3 py-2 text-cyan-100 disabled:opacity-50"
                            />
                          </label>
                          <label
                            className={`flex flex-col gap-1 text-zinc-400 transition-[opacity,color] ${
                              !nestUiSettings.mergeLines
                                ? "opacity-45 text-zinc-500"
                                : ""
                            }`}
                          >
                            <span className="flex min-h-[2.75rem] items-start gap-1">
                              Shared cuts vs material
                              <NestFieldHelp
                                fieldId="timeRatio"
                                disabled={nestLoading}
                              />
                            </span>
                            <input
                              type="number"
                              min={0}
                              max={2}
                              step={0.05}
                              value={nestUiSettings.timeRatio}
                              onChange={(e) =>
                                setNestUiSettings((s) => ({
                                  ...s,
                                  timeRatio: Math.max(
                                    0,
                                    parseFloat(e.target.value) || 0,
                                  ),
                                }))
                              }
                              disabled={
                                nestLoading || !nestUiSettings.mergeLines
                              }
                              className="rounded-lg border border-cyan-900/50 bg-zinc-900 px-3 py-2 text-cyan-100 disabled:opacity-50"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-zinc-400">
                            <span className="flex min-h-[2.75rem] items-start gap-1">
                              Drawing scale (edge detection)
                              <NestFieldHelp
                                fieldId="scale"
                                disabled={nestLoading}
                              />
                            </span>
                            <input
                              type="number"
                              min={1}
                              max={200}
                              step={1}
                              value={nestUiSettings.scale}
                              onChange={(e) =>
                                setNestUiSettings((s) => ({
                                  ...s,
                                  scale: Math.max(
                                    1,
                                    parseFloat(e.target.value) || 72,
                                  ),
                                }))
                              }
                              disabled={nestLoading}
                              className="rounded-lg border border-cyan-900/50 bg-zinc-900 px-3 py-2 text-cyan-100 disabled:opacity-50"
                            />
                          </label>
                        </div>
                        {nestAdminVisible && (
                          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-800/60 pt-2 text-[10px] text-zinc-500">
                            <span className="font-medium text-zinc-400">
                              NestNow host env
                            </span>
                            <NestFieldHelp
                              fieldId="serverEnvGa"
                              disabled={nestLoading}
                              label="NestNow server environment variables"
                            />
                          </div>
                        )}
                      </div>

                      <label className="flex cursor-pointer select-none items-center gap-2 text-zinc-300">
                        <input
                          type="checkbox"
                          checked={nestUiSettings.mergeLines}
                          onChange={(e) =>
                            setNestUiSettings((s) => ({
                              ...s,
                              mergeLines: e.target.checked,
                            }))
                          }
                          disabled={nestLoading}
                          className="rounded border-cyan-700 text-cyan-500"
                        />
                        <span className="inline-flex items-center gap-1">
                          Reward lining up edges (shared cuts)
                          <NestFieldHelp
                            fieldId="mergeLines"
                            disabled={nestLoading}
                          />
                        </span>
                      </label>

                      <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/15">
                        <button
                          type="button"
                          onClick={() => setNestGeometryOpen((o) => !o)}
                          className="flex w-full items-center gap-1 px-3 py-2 text-left text-xs font-medium text-zinc-400 hover:text-zinc-300"
                        >
                          {nestGeometryOpen ? (
                            <ChevronDown className="size-4 shrink-0" />
                          ) : (
                            <ChevronRight className="size-4 shrink-0" />
                          )}
                          Geometry &amp; precision
                        </button>
                        {nestGeometryOpen && (
                          <div className="grid grid-cols-1 gap-3 border-t border-zinc-800/60 px-3 pb-3 pt-3 sm:grid-cols-3">
                            <label className="flex flex-col gap-1 text-zinc-400">
                              <span className="inline-flex items-center gap-1">
                                Curve smoothing
                                <NestFieldHelp
                                  fieldId="curveTolerance"
                                  disabled={nestLoading}
                                />
                              </span>
                              <input
                                type="number"
                                min={0}
                                step={0.001}
                                value={nestUiSettings.curveTolerance}
                                onChange={(e) =>
                                  setNestUiSettings((s) => ({
                                    ...s,
                                    curveTolerance: Math.max(
                                      0,
                                      parseFloat(e.target.value) || 0,
                                    ),
                                  }))
                                }
                                disabled={nestLoading}
                                className="rounded-lg border border-cyan-900/50 bg-zinc-900 px-3 py-2 text-cyan-100 disabled:opacity-50"
                              />
                            </label>
                            <label className="flex cursor-pointer select-none items-start gap-2 pt-1 text-zinc-300 sm:pt-7">
                              <input
                                type="checkbox"
                                checked={nestUiSettings.simplify}
                                onChange={(e) =>
                                  setNestUiSettings((s) => ({
                                    ...s,
                                    simplify: e.target.checked,
                                  }))
                                }
                                disabled={nestLoading}
                                className="mt-0.5 rounded border-cyan-700 text-cyan-500"
                              />
                              <span>
                                <span className="inline-flex items-center gap-1">
                                  Rough outline shapes
                                  <NestFieldHelp
                                    fieldId="simplify"
                                    disabled={nestLoading}
                                  />
                                </span>
                              </span>
                            </label>
                            <label className="flex flex-col gap-1 text-zinc-400">
                              <span className="inline-flex items-center gap-1">
                                Shape math precision
                                <NestFieldHelp
                                  fieldId="clipperScale"
                                  disabled={nestLoading}
                                />
                              </span>
                              <input
                                type="number"
                                min={1000}
                                step={1000000}
                                value={nestUiSettings.clipperScale}
                                onChange={(e) =>
                                  setNestUiSettings((s) => ({
                                    ...s,
                                    clipperScale: Math.max(
                                      1000,
                                      parseInt(e.target.value, 10) ||
                                        s.clipperScale,
                                    ),
                                  }))
                                }
                                disabled={nestLoading}
                                className="rounded-lg border border-cyan-900/50 bg-zinc-900 px-3 py-2 text-cyan-100 disabled:opacity-50"
                              />
                            </label>
                          </div>
                        )}
                      </div>

                      {nestAdminVisible && (
                        <div className="space-y-2 rounded-xl border border-amber-900/35 bg-amber-950/20 px-3 py-2.5">
                          <span className="block text-[11px] font-medium text-amber-200/90">
                            Connection (admin / dev)
                          </span>
                          <p className="text-[10px] leading-snug text-zinc-500">
                            For local debugging only. Production users should use
                            the app proxy; set{" "}
                            <code className="text-zinc-400">NESTNOW_URL</code> on
                            the Keystone server. On a first visit from localhost,
                            this field defaults to{" "}
                            <code className="text-zinc-400">
                              http://127.0.0.1:3001
                            </code>{" "}
                            (clear it to force /api/nest).
                          </p>
                          <label className="flex max-w-xl flex-col gap-1 text-zinc-400">
                            <span className="inline-flex items-center gap-1">
                              Direct NestNow base (localhost HTTP only)
                              <NestFieldHelp
                                fieldId="directNestNow"
                                disabled={nestLoading}
                              />
                            </span>
                            <input
                              type="url"
                              inputMode="url"
                              autoComplete="off"
                              placeholder="http://127.0.0.1:3001"
                              value={nestUiSettings.directNestNowUrl}
                              onChange={(e) =>
                                setNestUiSettings((s) => ({
                                  ...s,
                                  directNestNowUrl: e.target.value,
                                }))
                              }
                              disabled={nestLoading}
                              className="rounded-lg border border-cyan-900/50 bg-zinc-900 px-3 py-2 text-cyan-100 placeholder:text-zinc-600 disabled:opacity-50"
                            />
                            <span className="text-[10px] text-zinc-500">
                              {sanitizeDirectNestNowUrl(
                                nestUiSettings.directNestNowUrl,
                              ) ? (
                                <>
                                  Active: browser →{" "}
                                  <code className="text-zinc-400">
                                    {sanitizeDirectNestNowUrl(
                                      nestUiSettings.directNestNowUrl,
                                    )}
                                  </code>
                                </>
                              ) : (
                                <>
                                  Active: browser →{" "}
                                  <code className="text-zinc-400">
                                    /api/nest
                                  </code>{" "}
                                  on this app
                                </>
                              )}
                            </span>
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              </div>
            </div>
          )}
        </div>

          <section
            aria-label="Sheet and nest snapshot"
            className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <KpiCard
              label="Sheets in stock"
              value={remnants.length}
              hint={`${availableSheetCount} available`}
              icon={Package}
            />
            <KpiCard
              label="Available sheets"
              value={availableSheetCount}
              hint="Status: Available"
              icon={Layers}
            />
            <KpiCard
              label="Selected for nest"
              value={selectedForNest.length}
              hint={
                selectedForNest.length > 0
                  ? `~${selectedNestWeightLbs.toFixed(1)} lbs est.`
                  : "Use quick sheet list on Nest tab or Sheets tab"
              }
              icon={Package}
            />
            <KpiCard
              label="Last nest utilisation"
              value={lastUtilDisplay}
              hint={
                nestResult
                  ? `${lastNestSheetsUsed} sheet(s), ${(displayedNestResult?.placements ?? []).reduce((n, p) => n + (p.sheetplacements?.length ?? 0), 0)} parts`
                  : "Run Generate Nest to see results"
              }
              icon={Percent}
            />
          </section>
        </div>
      </div>

      {/* Add Stock modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => {
            setIsModalOpen(false);
            setAddStockMode(null);
          }}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-zinc-700">
              <h3 className="text-xl font-bold text-white">
                {editingSheetId ? "Edit Sheet" : "Add Stock"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setAddStockMode(null);
                  resetSheetForm();
                }}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAddStockMode("sheet")}
                  className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
                    addStockMode === "sheet"
                      ? "bg-cyan-600 text-white border border-cyan-500 shadow-lg"
                      : "bg-zinc-800 text-zinc-400 border border-zinc-600 hover:border-cyan-600 hover:text-cyan-200"
                  }`}
                >
                  Sheet
                </button>
                <button
                  type="button"
                  onClick={() => setAddStockMode("remnant")}
                  className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
                    addStockMode === "remnant"
                      ? "bg-purple-600 text-white border border-purple-500 shadow-lg"
                      : "bg-zinc-800 text-zinc-400 border border-zinc-600 hover:border-purple-600 hover:text-purple-200"
                  }`}
                >
                  Remnant
                </button>
              </div>

              {addStockMode === "remnant" && (
                <div className="rounded-xl bg-zinc-800/50 border border-zinc-700 p-4 text-center text-zinc-500 text-sm">
                  Remnant entry coming soon.
                </div>
              )}

              <div
                className={`rounded-xl border p-4 space-y-4 transition-all ${
                  addStockMode === "sheet"
                    ? "border-cyan-700/50 bg-zinc-800/30"
                    : "border-zinc-700 bg-zinc-800/50 opacity-50 pointer-events-none"
                }`}
              >
                <label className="block text-sm font-medium text-zinc-300">
                  Length
                </label>
                <p className="text-[11px] text-zinc-500 -mt-1 mb-1">
                  Longest side; runs left-to-right in nest preview (NestNow x).
                </p>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  placeholder="e.g. 96"
                  disabled={addStockMode !== "sheet"}
                  value={sheetLengthIn}
                  onChange={(e) => setSheetLengthIn(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-600 text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:opacity-70"
                />
                <label className="block text-sm font-medium text-zinc-300">
                  Width
                </label>
                <p className="text-[11px] text-zinc-500 -mt-1 mb-1">
                  Shorter side; vertical in nest preview (NestNow y).
                </p>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  placeholder="e.g. 48"
                  disabled={addStockMode !== "sheet"}
                  value={sheetWidthIn}
                  onChange={(e) => setSheetWidthIn(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-600 text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:opacity-70"
                />
                <label className="block text-sm font-medium text-zinc-300">
                  Thickness
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.001}
                  placeholder="e.g. 0.25"
                  disabled={addStockMode !== "sheet"}
                  value={sheetThicknessIn}
                  onChange={(e) => setSheetThicknessIn(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-600 text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:opacity-70"
                />
                <label className="block text-sm font-medium text-zinc-300">
                  Material Type
                </label>
                <select
                  disabled={addStockMode !== "sheet"}
                  value={sheetMaterial}
                  onChange={(e) => setSheetMaterial(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-600 text-white focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:opacity-70"
                >
                  <option value="" disabled>
                    Select material
                  </option>
                  {MATERIAL_NAMES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <label className="block text-sm font-medium text-zinc-300">
                  Label (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. #SHT-001"
                  disabled={addStockMode !== "sheet"}
                  value={sheetLabel}
                  onChange={(e) => setSheetLabel(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-600 text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:opacity-70"
                />
                <label className="block text-sm font-medium text-zinc-300">
                  Notes (optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Source, PO, job, etc."
                  disabled={addStockMode !== "sheet"}
                  value={sheetNotes}
                  onChange={(e) => setSheetNotes(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-600 text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:opacity-70 resize-none"
                />
                <label className="block text-sm font-medium text-zinc-300">
                  Status
                </label>
                <select
                  disabled={addStockMode !== "sheet"}
                  value={sheetStatus}
                  onChange={(e) => setSheetStatus(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-600 text-white focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:opacity-70"
                >
                  <option value="available">Available</option>
                  <option value="allocated">Allocated</option>
                  <option value="consumed">Consumed</option>
                  <option value="scrap">Scrap</option>
                </select>
                {addSheetError && (
                  <p className="text-sm text-amber-400">{addSheetError}</p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setAddStockMode(null);
                    resetSheetForm();
                  }}
                  className="px-4 py-2 rounded-xl font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveSheet}
                  disabled={
                    addStockMode !== "sheet" ||
                    addSheetLoading
                  }
                  className="px-4 py-2 rounded-xl font-medium text-white bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 border border-purple-500/50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {addSheetLoading
                    ? "Saving…"
                    : editingSheetId
                      ? "Save Changes"
                      : "Save Sheet"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {pendingDeleteRemnant && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/60"
          onClick={handleCancelDeleteSheet}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-zinc-700">
              <h3 className="text-lg font-bold text-white">
                Archive sheet?
              </h3>
              <button
                type="button"
                onClick={handleCancelDeleteSheet}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                aria-label="Close"
                disabled={deleteLoading}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm text-zinc-300">
              <p>
                This will remove{" "}
                <span className="font-mono text-purple-200">
                  {pendingDeleteRemnant.id}
                </span>{" "}
                from available sheets/remnants. The record will be marked as
                archived in inventory, not permanently deleted.
              </p>
              <p className="text-xs text-zinc-500">
                You can still see it in Supabase as a row with{" "}
                <span className="font-mono">
                  is_archived = true
                </span>
                .
              </p>
              {archiveError && (
                <p className="text-sm text-amber-300">
                  {archiveError}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 pb-5">
              <button
                type="button"
                onClick={handleCancelDeleteSheet}
                className="px-4 py-2 rounded-xl font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 transition-colors disabled:opacity-60"
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSheet}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-xl font-medium text-white bg-red-600 hover:bg-red-500 border border-red-500/70 disabled:opacity-60 flex items-center gap-2"
              >
                {deleteLoading && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Shape modal (UI-only) */}
      {isAddShapeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={closeAddShapeModal}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-zinc-700">
              <h3 className="text-xl font-bold text-white">Add Shape</h3>
              <button
                type="button"
                onClick={closeAddShapeModal}
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAddShapeError(null);
                    setShapeType("rect");
                  }}
                  className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
                    shapeType === "rect"
                      ? "bg-cyan-600 text-white border border-cyan-500 shadow-lg"
                      : "bg-zinc-800 text-zinc-400 border border-zinc-600 hover:border-cyan-600 hover:text-cyan-200"
                  }`}
                >
                  Rectangle / Square
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddShapeError(null);
                    setShapeType("round");
                  }}
                  className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
                    shapeType === "round"
                      ? "bg-emerald-600 text-white border border-emerald-500 shadow-lg"
                      : "bg-zinc-800 text-zinc-400 border border-zinc-600 hover:border-emerald-600 hover:text-emerald-200"
                  }`}
                >
                  Round
                </button>
              </div>

              {shapeType === "rect" && (
                <div className="rounded-xl border border-cyan-700/50 bg-zinc-800/30 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-zinc-200">Rectangle dimensions (in)</p>
                      <p className="text-xs text-zinc-500">
                        Part outline: width and height in inches (local to the part).
                      </p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs text-cyan-200">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-cyan-500 focus:ring-cyan-500"
                        checked={rectSquareLocked}
                        onChange={(e) => {
                          const next = e.target.checked;
                          setRectSquareLocked(next);
                          if (next && rectW) setRectH(rectW);
                        }}
                      />
                      Square
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-zinc-300">Width (in)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder="e.g. 10"
                        value={rectW}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRectW(v);
                          if (rectSquareLocked) setRectH(v);
                        }}
                        className="mt-1 w-full px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-600 text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300">Height (in)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder="e.g. 10"
                        value={rectH}
                        disabled={rectSquareLocked}
                        onChange={(e) => setRectH(e.target.value)}
                        className="mt-1 w-full px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-600 text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:opacity-70"
                      />
                    </div>
                  </div>
                </div>
              )}

              {shapeType === "round" && (
                <div className="rounded-xl border border-emerald-700/50 bg-zinc-800/30 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-zinc-200">Round (in)</p>
                      <p className="text-xs text-zinc-500">Enter OD in inches, and optionally an ID if this part has a hole.</p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs text-emerald-200">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
                        checked={roundHasHole}
                        onChange={(e) => setRoundHasHole(e.target.checked)}
                      />
                      With hole
                    </label>
                  </div>

                  <div className={`grid gap-3 ${roundHasHole ? "grid-cols-2" : "grid-cols-1"}`}>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300">OD (in)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder="e.g. 6"
                        value={roundOD}
                        onChange={(e) => setRoundOD(e.target.value)}
                        className="mt-1 w-full px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-600 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                      />
                    </div>
                    {roundHasHole && (
                      <div>
                        <label className="block text-sm font-medium text-zinc-300">ID (in)</label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          placeholder="e.g. 2"
                          value={roundID}
                          onChange={(e) => setRoundID(e.target.value)}
                          className="mt-1 w-full px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-600 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-zinc-700 bg-zinc-800/30 p-4 space-y-3">
                <label className="block text-sm font-medium text-zinc-300">Quantity</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={shapeQty}
                  onChange={(e) => setShapeQty(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-600 text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                />
                {addShapeError && (
                  <p className="text-sm text-amber-400">{addShapeError}</p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeAddShapeModal}
                  className="px-4 py-2 rounded-xl font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitAddShape}
                  className="px-4 py-2 rounded-xl font-medium text-white bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 border border-purple-500/50 transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {nestDxfModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="mx-auto w-full max-w-md rounded-2xl border border-zinc-800/80 bg-zinc-900/95 p-6 shadow-2xl">
            <h3 className="mb-1 text-lg font-semibold text-white">
              Export nest as DXF
            </h3>
            <p className="mb-4 text-xs leading-relaxed text-zinc-500">
              Exports the{" "}
              <span className="text-zinc-400">
                sheet {safePreviewSheetIndex + 1}
              </span>{" "}
              shown in the preview. Optional layers: SHEET (stock outline),
              PARTS (cut paths), TEXT (part names). Turn off sheet and text to
              export only nested part outlines. Coordinates match the nest
              (inches, y-up).
            </p>
            <div className="mb-4 space-y-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  className="size-4 rounded border-zinc-600 bg-zinc-900 text-cyan-500 focus:ring-cyan-500/40"
                  checked={nestDxfIncludeSheetOutline}
                  onChange={(e) =>
                    setNestDxfIncludeSheetOutline(e.target.checked)
                  }
                />
                Include sheet outline (SHEET layer)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  className="size-4 rounded border-zinc-600 bg-zinc-900 text-cyan-500 focus:ring-cyan-500/40"
                  checked={nestDxfIncludeLabels}
                  onChange={(e) => setNestDxfIncludeLabels(e.target.checked)}
                />
                Include part names (TEXT layer, wrapped)
              </label>
              <div>
                <label
                  htmlFor="nest-dxf-text-height"
                  className="mb-1 block text-xs font-medium text-zinc-400"
                >
                  Label height (in)
                </label>
                <input
                  id="nest-dxf-text-height"
                  type="number"
                  min={0.125}
                  step={0.125}
                  value={nestDxfTextHeight}
                  onChange={(e) => setNestDxfTextHeight(e.target.value)}
                  disabled={!nestDxfIncludeLabels}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950/50 px-3 py-2 font-mono text-sm text-white focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:opacity-40"
                />
              </div>
            </div>
            <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-1">
              <button
                type="button"
                onClick={() => setNestDxfExportMethod("download")}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  nestDxfExportMethod === "download"
                    ? "bg-cyan-600 text-white shadow-sm ring-1 ring-cyan-500/30"
                    : "text-zinc-400 hover:bg-zinc-800/80 hover:text-white"
                }`}
              >
                <HardDriveDownload className="size-4 shrink-0" aria-hidden />
                Download
              </button>
              <button
                type="button"
                onClick={() => setNestDxfExportMethod("onedrive")}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  nestDxfExportMethod === "onedrive"
                    ? "bg-cyan-600 text-white shadow-sm ring-1 ring-cyan-500/30"
                    : "text-zinc-400 hover:bg-zinc-800/80 hover:text-white"
                }`}
              >
                <CloudUpload className="size-4 shrink-0" aria-hidden />
                Job / OneDrive
              </button>
            </div>
            {nestDxfExportMethod === "onedrive" ? (
              <div className="mb-6">
                <label className="mb-3 block font-medium text-zinc-300">
                  Select job
                </label>
                <select
                  value={nestDxfSelectedJob}
                  onChange={(e) => setNestDxfSelectedJob(e.target.value)}
                  disabled={nestDxfProjectsLoading}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950/50 px-4 py-3 text-base text-white focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                >
                  {nestDxfProjectsLoading ? (
                    <option>Loading projects…</option>
                  ) : nestDxfProjects.length === 0 ? (
                    <option>No active projects</option>
                  ) : (
                    nestDxfProjects.map((project) => (
                      <option
                        key={project.project_number}
                        value={project.project_number}
                      >
                        {project.project_number} — {project.project_name} (
                        {project.customer})
                      </option>
                    ))
                  )}
                </select>
                <p className="mt-2 text-xs text-zinc-500">
                  Files go to the job&apos;s{" "}
                  <span className="text-zinc-400">{`{project}_CAD`}</span>{" "}
                  folder.
                </p>
              </div>
            ) : (
              <p className="mb-6 text-sm text-zinc-400">
                Saves a .dxf for the current preview sheet only.
              </p>
            )}
            {nestDxfExportError ? (
              <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                {nestDxfExportError}
              </p>
            ) : null}
            <div className="flex gap-3">
              <button
                type="button"
                className="flex-1 rounded-xl border border-zinc-600 bg-zinc-800/80 px-4 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
                onClick={() => {
                  setNestDxfModalOpen(false);
                  setNestDxfSelectedJob("");
                  setNestDxfExportError("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  nestDxfExporting ||
                  (nestDxfExportMethod === "onedrive" &&
                    (!nestDxfSelectedJob || nestDxfProjects.length === 0))
                }
                className="flex-1 rounded-xl border border-cyan-500/40 bg-cyan-600/90 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-45"
                onClick={() => void handleNestDxfExport()}
              >
                {nestDxfExporting
                  ? "Exporting…"
                  : nestDxfExportMethod === "download"
                    ? "Download"
                    : "Upload to OneDrive"}
              </button>
            </div>
          </div>
        </div>
      )}
      {filterDropdownEl}
    </>
  );
}
