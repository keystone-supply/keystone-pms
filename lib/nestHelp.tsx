"use client";

import { type ReactNode } from "react";
import { Popover } from "radix-ui";
import { CircleHelp } from "lucide-react";

import { DEFAULT_NEST_UI_SETTINGS } from "@/lib/nestPayload";

/** Keys for centralized nest field / section help copy. */
export type NestHelpFieldId =
  | "spacing"
  | "rotations"
  | "layoutGoalIntro"
  | "attempts"
  | "requestTimeout"
  | "layoutSearchIntro"
  | "populationSize"
  | "mutationRate"
  | "gaGenerations"
  | "timeRatio"
  | "scale"
  | "serverEnvGa"
  | "directNestNow"
  | "mergeLines"
  | "curveTolerance"
  | "simplify"
  | "clipperScale"
  | "partStatsHeavy"
  | "loadingNoProgress"
  | "advancedDefaults"
  | "nestStrategy"
  | "nestExploreRefine"
  | "nestSeeds";

const nestAdvancedDefaultsHelp: ReactNode = (() => {
  const d = DEFAULT_NEST_UI_SETTINGS;
  const curve =
    d.curveTolerance % 1 === 0
      ? String(d.curveTolerance)
      : d.curveTolerance.toFixed(4).replace(/\.?0+$/, "");
  return (
    <>
      <p className="mb-2 text-zinc-300">
        App defaults for{" "}
        <strong className="text-zinc-200">
          Advanced: search tuning &amp; geometry
        </strong>{" "}
        (new installs or cleared storage). Saved settings in this browser may
        differ.
      </p>
      <ul className="list-disc space-y-1.5 pl-4 text-zinc-400">
        <li>
          <span className="text-zinc-300">Separate full attempts:</span>{" "}
          {d.attempts}
        </li>
        <li>
          <span className="text-zinc-300">Max time per layout try:</span>{" "}
          {d.requestTimeoutSec}s
        </li>
        <li>
          <span className="text-zinc-300">Improvement rounds:</span>{" "}
          {d.gaGenerations}
        </li>
        <li>
          <span className="text-zinc-300">Search randomness:</span>{" "}
          {d.mutationRate}
        </li>
        <li>
          <span className="text-zinc-300">Layouts tried at once:</span>{" "}
          {d.populationSize}
        </li>
        <li>
          <span className="text-zinc-300">Shared cuts vs material:</span>{" "}
          {d.timeRatio}
        </li>
        <li>
          <span className="text-zinc-300">Drawing scale (edge detection):</span>{" "}
          {d.scale}
        </li>
        <li>
          <span className="text-zinc-300">Reward lining up edges:</span>{" "}
          {d.mergeLines ? "on" : "off"}
        </li>
        <li>
          <span className="text-zinc-300">Curve smoothing:</span> {curve}
        </li>
        <li>
          <span className="text-zinc-300">Rough outline shapes:</span>{" "}
          {d.simplify ? "on" : "off"}
        </li>
        <li>
          <span className="text-zinc-300">Shape math precision:</span>{" "}
          {d.clipperScale.toLocaleString()}
        </li>
      </ul>
    </>
  );
})();

export const NEST_FIELD_HELP: Record<NestHelpFieldId, ReactNode> = {
  spacing: (
    <>
      Same as DeepNest &ldquo;space between parts&rdquo;: minimum clearance
      between parts and from nested geometry to the sheet edge.
    </>
  ),
  rotations: (
    <>
      How many orientations each part can use (evenly spaced around 360°). More
      orientations can improve packing but increases search time.
    </>
  ),
  layoutGoalIntro: (
    <>
      Click a card to set what &ldquo;a good nest&rdquo; optimizes for (same
      idea as DeepNest&rsquo;s optimization type).
    </>
  ),
  attempts: (
    <>
      Run the whole search more than once and keep the best layout. Turn this
      up if you want another roll of the dice (each run takes about as long as
      the first).
      <br />
      <br />
      With 2 or more, Keystone automatically starts another full run when NestNow
      returns &ldquo;no layout&rdquo; or &ldquo;placement failed&rdquo; (same as
      clicking Generate again), up to this limit.
    </>
  ),
  requestTimeout: (
    <>
      Max time for <strong className="text-zinc-200">one</strong> layout
      evaluation (one trial), not the entire automatic search. With layout
      search on, many evaluations run per click, so total wall time adds up.
      <br />
      <br />
      Range matches the server clamp (typically 60s–1h per evaluation). On the
      NestNow host,{" "}
      <code className="text-cyan-400/90">NESTNOW_REQUEST_TIMEOUT_MS</code> only
      applies when a request omits this value (NestNow defaults to 10 minutes to
      match this app when unset).
    </>
  ),
  layoutSearchIntro: (
    <>
      The engine tries many orderings and rotations and keeps the best fit.
      Each trial is capped by{" "}
      <strong className="text-zinc-200">Max time per layout try</strong> above;
      total time per run is roughly (trials × that cap) until the search
      finishes. Your hosting may also limit how long{" "}
      <code className="text-cyan-400/90">/api/nest</code> can run.
      <br />
      <br />
      Larger values below usually mean better results and longer waits. Use at
      least <strong className="text-zinc-200">2</strong> layouts-at-once for
      this search to run; <strong className="text-zinc-200">1</strong> runs a
      single quick pass.
    </>
  ),
  populationSize: (
    <>
      More parallel layout ideas per round — often improves quality, always
      costs more time.
    </>
  ),
  mutationRate: (
    <>
      Higher values mean more random swaps and rotations between rounds
      (explores farther, less predictable).
    </>
  ),
  gaGenerations: (
    <>
      Each round refines the best layouts from the last one. More rounds mean
      longer runs and sometimes nicer nests.
    </>
  ),
  timeRatio: (
    <>
      Only matters when &ldquo;Reward lining up edges&rdquo; is on. Turn this up
      to favor one long shared cut; turn it down to care mostly about using less
      sheet.
    </>
  ),
  scale: (
    <>
      Should match typical SVG / drawing units. Leave at 72 unless you know
      your files use a different base scale.
    </>
  ),
  serverEnvGa: (
    <>
      <code className="text-cyan-400/90">NESTNOW_DISABLE_GA=1</code> forces one
      fast layout instead of multi-layout search.{" "}
      <code className="text-cyan-400/90">NESTNOW_GA_MAX_EVALS</code> (default
      500) caps genetic evaluations per request.{" "}
      <code className="text-cyan-400/90">NESTNOW_TOP_K</code> (default 3, max 20)
      controls how many alternate layouts are returned in{" "}
      <code className="text-cyan-400/90">candidates</code> on a successful nest.
      Set these on the NestNow process / container, not in the browser.
    </>
  ),
  directNestNow: (
    <>
      For development or same-machine use only. When set to a valid{" "}
      <code className="text-cyan-400/90">http://127.0.0.1</code> or{" "}
      <code className="text-cyan-400/90">http://localhost</code> base URL, the
      browser POSTs directly to NestNow (CORS), skipping the Next.js proxy.
      <br />
      <br />
      Leave empty for normal use: requests go to{" "}
      <code className="text-cyan-400/90">/api/nest</code> and the server uses{" "}
      <code className="text-cyan-400/90">NESTNOW_URL</code> to reach NestNow.
      Invalid URLs are ignored.
      <br />
      <br />
      <strong className="text-zinc-200">Details for IT</strong> always lists
      whether you are on direct or app-proxy path, and{" "}
      <code className="text-cyan-400/90">clientRequestDurationMs</code> (browser
      timing). <code className="text-cyan-400/90">proxyDurationMs</code> appears
      only when using the Next.js <code className="text-cyan-400/90">/api/nest</code>{" "}
      proxy.
    </>
  ),
  mergeLines: (
    <>
      When on, the solver can prefer arrangements where two parts share one cut
      line, which often saves machine time.
    </>
  ),
  curveTolerance: (
    <>
      Larger values allow more simplification of curved edges (can run faster,
      less exact).
    </>
  ),
  simplify: (
    <>
      Good for speed; outlines may not match every bend in the original
      drawing.
    </>
  ),
  clipperScale: (
    <>
      Internal multiplier for coordinates. Leave the default unless support
      asks you to change it.
    </>
  ),
  partStatsHeavy: (
    <>
      NFP preparation scales with part pairs (order of{" "}
      <em className="not-italic">n²</em> for <em className="not-italic">n</em>{" "}
      pieces). For large jobs, use Preview, turn on simplify under Geometry
      &amp; precision, and fewer rotations.
      <br />
      <br />
      For very heavy nests, expect long runs; try Preview first, or on the
      NestNow server set{" "}
      <code className="text-cyan-400/90">NESTNOW_DISABLE_GA=1</code> for a
      single placement pass (admin).
      <br />
      <br />
      For hundreds of parts, watch JSON payload size and consider splitting
      batches. Run <code className="text-cyan-400/90">npm run nest:estimate-payload</code>{" "}
      and read <strong className="text-zinc-200">docs/nesting-scale-and-timeouts.md</strong>{" "}
      in this repo.
    </>
  ),
  loadingNoProgress: (
    <>
      Large search settings can take a long time (many evaluations ×
      per-evaluation time cap). If nesting fails, open{" "}
      <strong className="text-zinc-200">Details for IT</strong>: the
      &ldquo;IT quick read&rdquo; lists nest path (direct vs app proxy),{" "}
      <code className="text-cyan-400/90">clientRequestDurationMs</code>,{" "}
      <code className="text-cyan-400/90">proxyDurationMs</code> (proxy only),{" "}
      <code className="text-cyan-400/90">nestNowDurationMs</code> and{" "}
      <code className="text-cyan-400/90">failureKind</code> from NestNow when
      present, and timing buckets (instant / ~60s / mid / very long). Instant
      failures usually mean NestNow unreachable, a busy worker (503), or a bad
      payload — not the long per-eval timeout. If errors cluster around ~60s,
      your reverse proxy or host may be cutting off{" "}
      <code className="text-cyan-400/90">/api/nest</code>. On the NestNow
      machine, watch for &ldquo;Nest request timed out&rdquo; in logs. For true
      eval timeouts, raise{" "}
      <strong className="text-zinc-200">Max time per layout try</strong> under
      More tuning, or set{" "}
      <code className="text-cyan-400/90">NESTNOW_REQUEST_TIMEOUT_MS</code> on
      NestNow when the client omits a timeout.
    </>
  ),
  advancedDefaults: nestAdvancedDefaultsHelp,
  nestStrategy: (
    <>
      <strong className="text-zinc-200">Auto</strong> uses a fast{" "}
      <em>module + grid</em> path when you have many total copies, only a few
      unique parts, and a rectangular sheet; irregular sheet outlines still use
      the full NestNow search.
      <br />
      <br />
      <strong className="text-zinc-200">Production (grid)</strong> always tries
      module + grid on rectangular sheets, or grid with containment checks on
      polygon sheets when possible.
      <br />
      <br />
      <strong className="text-zinc-200">Tight (full search)</strong> sends all
      part quantities through the full genetic / NFP nest (best for organic
      shapes and dense packing).
    </>
  ),
  nestExploreRefine: (
    <>
      <strong className="text-zinc-200">Explore</strong> runs several cheaper
      searches (more attempts, smaller population, higher mutation) and keeps
      up to three distinct good layouts as <strong className="text-zinc-200">seeds</strong>{" "}
      for the next step. <strong className="text-zinc-200">Refine</strong> runs
      one heavy search seeded from the layout you select with{" "}
      <em className="not-italic">Use for Refine</em> — the NestNow server must
      return <code className="text-cyan-400/90">chromosome</code> on results
      (recent NestNow).
    </>
  ),
  nestSeeds: (
    <>
      Seeds <strong className="text-zinc-200">accumulate</strong> across Explore
      runs on the same sheet/part mix (merged by fitness; very similar scores
      dedupe, so a new run may not replace the list until you clear).{" "}
      <strong className="text-zinc-200">Clear seeds</strong> empties the pool
      and saved storage so the next Explore builds a fresh top three.
      <br />
      <br />
      <strong className="text-zinc-200"> Preview</strong> shows the layout in
      the viewer without re-running the server.{" "}
      <strong className="text-zinc-200">Use for Refine</strong> picks which GA
      individual seeds a <strong className="text-zinc-200">Refine</strong> run.
      Seeds persist in this browser for the same job fingerprint.
    </>
  ),
};

export function NestFieldHelp({
  fieldId,
  disabled,
  label = "Help",
}: {
  fieldId: NestHelpFieldId;
  disabled?: boolean;
  /** Accessible name; defaults to "Help". */
  label?: string;
}) {
  const content = NEST_FIELD_HELP[fieldId];
  if (!content) return null;

  return (
    <Popover.Root>
      <Popover.Trigger
        type="button"
        disabled={disabled}
        aria-label={label}
        className="inline-flex shrink-0 rounded p-0.5 text-zinc-500 transition-colors hover:text-cyan-400/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 disabled:pointer-events-none disabled:opacity-40"
      >
        <CircleHelp className="size-3.5" aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-[300] w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-zinc-600 bg-zinc-950/98 p-3 text-[11px] leading-relaxed text-zinc-300 shadow-xl backdrop-blur-sm"
        >
          <div className="max-h-[min(50vh,20rem)] overflow-y-auto">{content}</div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Inline label + optional help icon on one row. */
export function NestLabelWithHelp({
  children,
  fieldId,
  disabled,
}: {
  children: ReactNode;
  fieldId: NestHelpFieldId;
  disabled?: boolean;
}) {
  return (
    <span className="flex items-center gap-1">
      {children}
      <NestFieldHelp fieldId={fieldId} disabled={disabled} />
    </span>
  );
}
