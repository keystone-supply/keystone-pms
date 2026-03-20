"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
  type ReactNode,
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
import {
  type Remnant,
  type PartShape,
  genMockSVG,
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
  NEST_REQUEST_TIMEOUT_SEC_MAX,
  NEST_REQUEST_TIMEOUT_SEC_MIN,
  NEST_ROTATION_OPTIONS,
} from "@/lib/nestPayload";

type SheetPlacement = {
  filename?: string;
  id?: number;
  rotation?: number;
  source?: number;
  x?: number;
  y?: number;
};
type NestResult = {
  fitness: number;
  area: number;
  totalarea: number;
  mergedLength: number;
  utilisation: number;
  placements: { sheet: number; sheetid: unknown; sheetplacements: SheetPlacement[] }[];
};

type NestApiPartPayload = {
  outline: { x: number; y: number }[];
  holes?: { x: number; y: number }[][];
  filename?: string;
  quantity?: number;
  canRotate?: boolean;
};

type LastNestPayload = {
  sheets: { width: number; height: number }[];
  parts: NestApiPartPayload[];
  config: Record<string, string | number | boolean>;
  attemptsUsed: number;
};

// Semi-transparent fills and distinct strokes so parts are visible and distinguishable (plan: cyan/purple/amber by index)
const PART_FILLS = [
  "rgba(34, 211, 238, 0.35)",
  "rgba(168, 85, 247, 0.35)",
  "rgba(245, 158, 11, 0.35)",
  "rgba(34, 197, 94, 0.35)",
  "rgba(239, 68, 68, 0.35)",
];
const PART_STROKES = ["rgb(34, 211, 238)", "rgb(168, 85, 247)", "rgb(245, 158, 11)", "rgb(34, 197, 94)", "rgb(239, 68, 68)"];

// Subdued sheet border so nested parts stand out; thin stroke, muted color
const SHEET_STROKE = "rgb(255, 255, 255)"; // zinc-500
const SHEET_STROKE_WIDTH = 0.03;
const VIEW_PADDING = 3; // space between viewBox edge and remnant

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

  const partFill = "rgba(34, 211, 238, 0.35)";
  const partStroke = "rgb(34, 211, 238)";
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

function NestPreviewSVG({
  sheetWidth,
  sheetHeight,
  parts,
  sheetplacements,
}: {
  sheetWidth: number;
  sheetHeight: number;
  parts: { outline: { x: number; y: number }[]; holes?: { x: number; y: number }[][]; filename?: string }[];
  sheetplacements: SheetPlacement[];
}) {
  /** Display-only: show stock length (nest Y / payload height) left–right; nesting math unchanged. */
  const previewW = sheetHeight + 2 * VIEW_PADDING;
  const previewH = sheetWidth + 2 * VIEW_PADDING;
  const innerTf = `translate(${VIEW_PADDING}, ${VIEW_PADDING}) scale(1, -1) translate(0, -${sheetWidth})`;
  const mapPt = (x: number, y: number) => `${y},${x}`;
  return (
    <svg
      viewBox={`0 0 ${previewW} ${previewH}`}
      className="w-full h-full min-h-0"
      preserveAspectRatio="xMidYMid meet"
      style={{ overflow: "visible" }}
    >
      <g transform={innerTf}>
        <rect
          x={0}
          y={0}
          width={sheetHeight}
          height={sheetWidth}
          fill="none"
          stroke={SHEET_STROKE}
          strokeWidth={SHEET_STROKE_WIDTH}
        />
        {sheetplacements.map((p, idx) => {
          if (!p || typeof p.source !== "number") return null;
          const part = parts[p.source];
          const outline = part?.outline;
          if (!outline || !Array.isArray(outline) || outline.length < 3) return null;
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
              strokeWidth={0.07}
            />
          );
        })}
      </g>
    </svg>
  );
}

function SheetWireframe({
  lengthIn,
  widthIn,
  dims,
}: {
  lengthIn?: number;
  widthIn?: number;
  dims?: string;
}) {
  let w = widthIn;
  let h = lengthIn;
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
  const [nestError, setNestError] = useState<string | null>(null);
  const [nestLoading, setNestLoading] = useState(false);
  const [nestProgressLabel, setNestProgressLabel] = useState<string | null>(null);
  const [lastNestPayload, setLastNestPayload] = useState<LastNestPayload | null>(null);
  const nestInFlightRef = useRef(false);
  const nestRunVersionRef = useRef(0);
  const [nestUiSettings, setNestUiSettings] = useState<NestUiSettings>(() =>
    loadNestUiSettings(),
  );
  const [nestAdvancedOpen, setNestAdvancedOpen] = useState(false);
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

  const fetchOpenQuotesCount = useCallback(async () => {
    const { data, error } = await supabase
      .from("projects")
      .select(PROJECT_SELECT);
    if (error || !data) return;
    setOpenQuotesCount(
      aggregateDashboardMetrics(data as DashboardProjectRow[]).openQuotes,
    );
  }, []);

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

    return {
      id: label || shortId,
      db_id: dbId,
      label,
      svg_path: length_in && width_in ? genMockSVG(length_in, width_in) : undefined,
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

  async function handleGenerateNest() {
    if (nestInFlightRef.current) return;

    if (!remnants.length) {
      setNestError("Add at least one sheet/remnant before nesting.");
      return;
    }

    if (!parts.length) {
      setNestError("Add at least one part before nesting.");
      return;
    }

    nestInFlightRef.current = true;
    const myVersion = ++nestRunVersionRef.current;
    setNestError(null);
    setNestResult(null);
    setLastNestPayload(null);
    setNestLoading(true);
    setNestProgressLabel(null);

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

    const sheets = sheetsSource.map((r) => {
      if (r.width_in && r.length_in) {
        return { width: r.width_in, height: r.length_in };
      }
      const parsed = parseRemnantDims(r.dims);
      return { width: parsed.width, height: parsed.height };
    });

    const attempts = Math.min(
      10,
      Math.max(1, Math.floor(nestUiSettings.attempts) || 1),
    );
    const apiConfig = buildApiNestConfig(nestUiSettings);
    const requestTimeoutSec = clampNestRequestTimeoutSec(
      nestUiSettings.requestTimeoutSec,
    );
    const requestTimeoutMs = requestTimeoutSec * 1000;

    let bestResult: NestResult | null = null;
    let bestPayloadBody: {
      sheets: typeof sheets;
      parts: NestApiPartPayload[];
      config: typeof apiConfig;
      requestTimeoutMs: number;
    } | null = null;
    let lastAttemptError: string | null = null;

    try {
      for (let attempt = 1; attempt <= attempts; attempt++) {
        if (nestRunVersionRef.current !== myVersion) {
          return;
        }

        if (attempts > 1) {
          setNestProgressLabel(`Attempt ${attempt} / ${attempts}`);
        }

        const payload = {
          sheets,
          parts: mapPartsToApiPayload(parts),
          config: apiConfig,
          requestTimeoutMs,
        };

        try {
          await fetch("/api/nest/stop", { method: "POST" });
        } catch {}

        if (nestRunVersionRef.current !== myVersion) {
          return;
        }

        const res = await fetch("/api/nest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as NestResult & { error?: string };

        if (nestRunVersionRef.current !== myVersion) {
          return;
        }

        if (!res.ok) {
          lastAttemptError =
            typeof data?.error === "string"
              ? data.error
              : res.statusText ?? "Nesting failed";
          if (attempts === 1) {
            setNestError(lastAttemptError);
            return;
          }
          continue;
        }

        if (nestAttemptBetter(data, bestResult)) {
          bestResult = data;
          bestPayloadBody = payload;
        }
      }

      if (!bestResult && lastAttemptError) {
        setNestError(lastAttemptError);
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
        };
        setNestResult(bestResult);
        setLastNestPayload({
          sheets: bestPayloadBody.sheets,
          parts: bestPayloadBody.parts,
          config: configSummary,
          attemptsUsed: attempts,
        });
        setPageLastUpdated(new Date());
      }
    } catch (e) {
      setNestError(e instanceof Error ? e.message : "Request failed");
    } finally {
      nestInFlightRef.current = false;
      setNestLoading(false);
      setNestProgressLabel(null);
    }
  }

  async function handleStopNest() {
    if (!nestLoading) return;
    nestRunVersionRef.current += 1;
    try {
      await fetch("/api/nest/stop", { method: "POST" });
    } finally {
      nestInFlightRef.current = false;
      setNestLoading(false);
      setNestProgressLabel(null);
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
          onClick={() => signIn("azure-ad")}
          className="rounded-2xl bg-blue-600 px-8 py-3 text-sm font-medium text-white hover:bg-blue-700"
        >
          Sign in with Microsoft
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

  const lastNestSheetsUsed = nestResult?.placements?.length ?? 0;
  const lastUtilDisplay =
    nestResult != null
      ? `${(nestResult.utilisation ?? 0).toFixed(1)}%`
      : "—";

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
            />
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
                  : "Choose sheets on Sheets tab"
              }
              icon={Package}
            />
            <KpiCard
              label="Last nest utilisation"
              value={lastUtilDisplay}
              hint={
                nestResult
                  ? `${lastNestSheetsUsed} sheet(s), ${(nestResult.placements ?? []).reduce((n, p) => n + (p.sheetplacements?.length ?? 0), 0)} parts`
                  : "Run Generate Nest to see results"
              }
              icon={Percent}
            />
          </section>

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
            <div className="flex flex-col gap-4 p-6 sm:p-8">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Sheets for this nest
                    </p>
                    <p className="text-sm text-white">
                      <span className="font-semibold tabular-nums">
                        {selectedForNest.length}
                      </span>{" "}
                      selected
                      {selectedForNest.length > 0 ? (
                        <>
                          {" "}
                          · ~
                          <span className="tabular-nums">
                            {selectedNestWeightLbs.toFixed(1)}
                          </span>{" "}
                          lbs est.
                        </>
                      ) : null}
                    </p>
                    {selectedForNest.length > 0 ? (
                      <div className="flex max-w-full flex-wrap gap-1.5 pt-1">
                        {selectedForNest.slice(0, 6).map((r) => (
                          <span
                            key={r.db_id}
                            className="inline-flex max-w-[10rem] items-center gap-1 truncate rounded-lg border border-zinc-700 bg-zinc-950/80 pl-2 pr-1 text-xs text-zinc-200"
                            title={r.id}
                          >
                            <span className="truncate">{r.id}</span>
                            <button
                              type="button"
                              className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-300"
                              aria-label={`Remove ${r.id} from nest`}
                              onClick={() => toggleSelectedSheet(r.db_id)}
                            >
                              <X className="size-3.5" />
                            </button>
                          </span>
                        ))}
                        {selectedForNest.length > 6 ? (
                          <span className="self-center text-xs text-zinc-500">
                            +{selectedForNest.length - 6} more
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
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
                    className="shrink-0 rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-purple-500/50 hover:text-white"
                  >
                    Manage sheets
                  </button>
                </div>
              </div>

              <div className="flex w-full flex-col rounded-3xl border-2 border-cyan-800/50 bg-gradient-to-br from-zinc-900/70 to-zinc-950/50 p-6 shadow-xl shadow-cyan-500/10 backdrop-blur-sm sm:p-8">
                <div className="sticky top-0 z-20 -mx-6 mb-4 space-y-3 border-b border-zinc-800/90 bg-zinc-950/95 px-6 pb-3 backdrop-blur-md sm:-mx-8 sm:px-8">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 text-lg font-bold text-cyan-100 sm:text-xl">
                      <Layers className="size-7 shrink-0 sm:size-8" />
                      Nesting
                    </h3>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={openAddShapeModal}
                        className="flex items-center gap-2 rounded-full border border-purple-500/40 bg-purple-600/25 px-3 py-2 text-xs font-medium text-purple-100 transition-all hover:bg-purple-500/45 sm:text-sm"
                      >
                        <Plus className="size-4" /> Add Shape
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          alert("DXF/Parts upload coming soon. Shapes from DXF will be added to the same Parts list and used in nests alongside UI-created shapes.");
                        }}
                        className="flex items-center gap-2 rounded-full border border-cyan-500/40 bg-cyan-600/30 px-3 py-2 text-xs font-medium text-cyan-200 transition-all hover:bg-cyan-500/50 sm:text-sm"
                      >
                        <Upload className="size-4" /> Upload DXF
                      </button>
                      <button
                        type="button"
                        onClick={handleGenerateNest}
                        disabled={nestLoading}
                        className="flex items-center gap-2 rounded-full border border-emerald-500/40 bg-gradient-to-r from-emerald-600/30 to-emerald-500/50 px-3 py-2 text-xs font-medium text-emerald-200 transition-all disabled:pointer-events-none disabled:opacity-60 sm:text-sm"
                      >
                        {nestLoading ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Zap className="size-4" />
                        )}
                        {nestLoading ? "Nesting…" : "Generate Nest"}
                      </button>
                      <button
                        type="button"
                        onClick={handleStopNest}
                        disabled={!nestLoading}
                        className="flex items-center gap-2 rounded-full border border-red-500/40 bg-red-600/20 px-3 py-2 text-xs font-medium text-red-200 transition-all disabled:pointer-events-none disabled:opacity-60 sm:text-sm"
                      >
                        <X className="size-4" /> Stop
                      </button>
                      <button
                        type="button"
                        className="flex items-center gap-2 rounded-full border border-zinc-600 bg-zinc-700/50 px-3 py-2 text-xs font-medium text-zinc-300 sm:text-sm"
                      >
                        Export .DXF
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-end gap-4 text-sm">
                    <label className="flex min-w-[10rem] max-w-[14rem] flex-col gap-1 text-zinc-400">
                      <span>Part &amp; sheet edge gap (in)</span>
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
                      <span className="text-[10px] leading-tight text-zinc-500">
                        Same as DeepNest &ldquo;space between parts&rdquo;: minimum
                        clearance between parts and from nested geometry to the sheet
                        edge.
                      </span>
                    </label>
                    <label className="flex min-w-[10rem] flex-col gap-1 text-zinc-400">
                      <span>How many rotations to try</span>
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
                    Advanced nest options
                  </button>
                  {nestAdvancedOpen && (
                    <div className="mt-3 space-y-4 text-sm">
                      <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/20 px-3 py-2.5">
                        <span className="mb-1.5 block text-[11px] font-medium text-zinc-400">
                          What should “a good nest” optimize for?
                        </span>
                        <p className="mb-2 text-[10px] leading-tight text-zinc-500">
                          Click a card to set the layout goal (same as DeepNest
                          optimization type).
                        </p>
                        <PlacementTypeVisuals
                          active={nestUiSettings.placementType}
                          disabled={nestLoading}
                          onSelect={(placementType) =>
                            setNestUiSettings((s) => ({ ...s, placementType }))
                          }
                        />
                      </div>
                      <label className="flex max-w-md flex-col gap-1 text-zinc-400">
                        <span>Separate full attempts</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          step={1}
                          value={nestUiSettings.attempts}
                          onChange={(e) =>
                            setNestUiSettings((s) => ({
                              ...s,
                              attempts: Math.min(
                                10,
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
                        <span className="text-[10px] leading-tight text-zinc-500">
                          Run the whole search more than once and keep the best
                          layout. Turn this up if you want another roll of the
                          dice (each run takes the same time as the first).
                        </span>
                      </label>
                      <label className="flex max-w-md flex-col gap-1 text-zinc-400">
                        <span>Max time per attempt (seconds)</span>
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
                        <span className="text-[10px] leading-tight text-zinc-500">
                          NestNow stops one attempt after this limit — raise it when
                          nesting many parts. Range {NEST_REQUEST_TIMEOUT_SEC_MIN}–
                          {NEST_REQUEST_TIMEOUT_SEC_MAX}s (NestNow max 1 hr). Env{" "}
                          <code className="text-zinc-400">NESTNOW_REQUEST_TIMEOUT_MS</code>{" "}
                          applies only if a request omits this field.
                        </span>
                      </label>
                      <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/20 px-3 py-2.5">
                        <span className="mb-2 block text-[11px] font-medium text-zinc-400">
                          Automatic layout search (NestNow)
                        </span>
                        <p className="mb-2 text-[10px] leading-tight text-zinc-500">
                          NestNow tries many orderings and rotations, keeps the
                          best fit. Larger numbers below usually mean better
                          results and longer waits. Use at least{" "}
                          <strong className="text-zinc-400 font-medium">2</strong>{" "}
                          layouts-at-once for this search to run;{" "}
                          <strong className="text-zinc-400 font-medium">1</strong>{" "}
                          runs a single quick pass.
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <label className="flex flex-col gap-1 text-zinc-400">
                            <span>Layouts tried at once</span>
                            <input
                              type="number"
                              min={1}
                              max={50}
                              step={1}
                              value={nestUiSettings.populationSize}
                              onChange={(e) =>
                                setNestUiSettings((s) => ({
                                  ...s,
                                  populationSize: Math.min(
                                    50,
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
                            <span className="text-[10px] leading-tight text-zinc-500">
                              More parallel ideas per round — often improves
                              quality, always costs more time.
                            </span>
                          </label>
                          <label className="flex flex-col gap-1 text-zinc-400">
                            <span>How experimental each round is</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              value={nestUiSettings.mutationRate}
                              onChange={(e) =>
                                setNestUiSettings((s) => ({
                                  ...s,
                                  mutationRate: Math.min(
                                    100,
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
                            <span className="text-[10px] leading-tight text-zinc-500">
                              Higher = more random swaps and rotations between
                              rounds (explores farther, less predictable).
                            </span>
                          </label>
                          <label className="flex flex-col gap-1 text-zinc-400">
                            <span>How many improvement rounds</span>
                            <input
                              type="number"
                              min={1}
                              max={20}
                              step={1}
                              value={nestUiSettings.gaGenerations}
                              onChange={(e) =>
                                setNestUiSettings((s) => ({
                                  ...s,
                                  gaGenerations: Math.min(
                                    20,
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
                            <span className="text-[10px] leading-tight text-zinc-500">
                              Each round refines the best layouts from the last
                              one. More rounds → longer runs, sometimes nicer nests.
                            </span>
                          </label>
                          <label className="flex flex-col gap-1 text-zinc-400">
                            <span>Shared cuts vs saving material</span>
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
                              disabled={nestLoading}
                              className="rounded-lg border border-cyan-900/50 bg-zinc-900 px-3 py-2 text-cyan-100 disabled:opacity-50"
                            />
                            <span className="text-[10px] leading-tight text-zinc-500">
                              Only matters when “Reward lining up edges” is on.
                              Turn this up to favor one long shared cut; turn it
                              down to care mostly about using less sheet.
                            </span>
                          </label>
                          <label className="flex flex-col gap-1 text-zinc-400">
                            <span>Drawing scale for edge detection</span>
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
                            <span className="text-[10px] leading-tight text-zinc-500">
                              Should match typical SVG / drawing units. Leave at
                              72 unless you know your files use a different base
                              scale.
                            </span>
                          </label>
                        </div>
                        <p className="mt-2 text-[10px] leading-tight text-zinc-500">
                          <span className="text-zinc-400">Server / IT:</span>{" "}
                          <code className="text-zinc-400">NESTNOW_DISABLE_GA=1</code>{" "}
                          forces one fast layout instead of multi-layout search.{" "}
                          <code className="text-zinc-400">NESTNOW_GA_MAX_EVALS</code>{" "}
                          limits total tries so runs cannot run forever.
                        </p>
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
                        Reward lining up edges (shared cuts)
                      </label>
                      <p className="text-[10px] leading-tight text-zinc-500 pl-6 -mt-2">
                        When on, the solver can prefer arrangements where two
                        parts share one cut line, which often saves machine time.
                      </p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <label className="flex flex-col gap-1 text-zinc-400">
                          <span>Curve smoothing</span>
                          <input
                            type="number"
                            min={0}
                            step={0.05}
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
                          <span className="text-[10px] leading-tight text-zinc-500">
                            Larger values allow more simplification of curved
                            edges (can run faster, less exact).
                          </span>
                        </label>
                        <label className="flex cursor-pointer select-none items-start gap-2 pt-1 text-zinc-300">
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
                            className="rounded border-cyan-700 text-cyan-500 mt-0.5"
                          />
                          <span>
                            <span className="block">Use rough outline shapes</span>
                            <span className="block text-[10px] font-normal text-zinc-500 mt-0.5">
                              Good for speed; outlines may not match every bend
                              in the original drawing.
                            </span>
                          </span>
                        </label>
                        <label className="flex flex-col gap-1 text-zinc-400">
                          <span>Shape math precision</span>
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
                                  parseInt(e.target.value, 10) || s.clipperScale,
                                ),
                              }))
                            }
                            disabled={nestLoading}
                            className="rounded-lg border border-cyan-900/50 bg-zinc-900 px-3 py-2 text-cyan-100 disabled:opacity-50"
                          />
                          <span className="text-[10px] leading-tight text-zinc-500">
                            Internal multiplier for coordinates. Leave the
                            default unless NestNow support asks you to change it.
                          </span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex min-h-[200px] flex-1 flex-col overflow-auto rounded-2xl border-2 border-dashed border-cyan-700/50 bg-zinc-800/30 shadow-inner">
                  {nestLoading && (
                    <div className="flex-1 flex flex-col items-center justify-center text-cyan-400 gap-2">
                      <div className="flex items-center">
                        <Loader2 className="w-12 h-12 animate-spin mr-3" />
                        <span>{nestProgressLabel ?? "Nesting…"}</span>
                      </div>
                      {nestProgressLabel ? (
                        <p className="text-xs text-zinc-500">
                          Stop cancels any further full attempts. Each attempt
                          may try many layouts inside NestNow before it returns.
                        </p>
                      ) : (
                        <p className="text-xs text-zinc-500">
                          Big search settings can take several minutes. Raise{" "}
                          <strong className="font-medium text-zinc-400">
                            Max time per attempt
                          </strong>{" "}
                          under Advanced nest options, or set{" "}
                          <code className="text-zinc-400">
                            NESTNOW_REQUEST_TIMEOUT_MS
                          </code>{" "}
                          on NestNow for non-Keystone clients.
                        </p>
                      )}
                    </div>
                  )}
                  {!nestLoading && nestError && (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-amber-400">
                      <AlertCircle className="w-12 h-12 mb-3" />
                      <p className="text-lg font-medium mb-1">Nesting failed</p>
                      <p className="text-sm text-zinc-400 text-center">{nestError}</p>
                      <p className="text-xs text-zinc-500 mt-2">Ensure NestNow is running (npm run start:server in NestNow).</p>
                    </div>
                  )}
                  {!nestLoading && nestResult && (
                    <div className="p-6 space-y-4 flex flex-col min-h-0">
                      {lastNestPayload && nestResult.placements?.length > 0 && (
                        <div className="flex flex-col flex-1 min-h-[240px] space-y-2">
                          <h4 className="font-bold text-cyan-100">Nest preview</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {nestResult.placements.map((placement, sheetIndex) => (
                              <div
                                key={sheetIndex}
                                className="min-h-[200px] rounded-xl border border-cyan-700/50 bg-zinc-800/30 flex flex-col p-1 overflow-hidden"
                              >
                                <div className="px-3 pt-2 pb-1 text-xs text-cyan-200/80">
                                  Sheet {sheetIndex + 1}
                                </div>
                                <div className="flex-1 min-h-0">
                                  <NestPreviewSVG
                                    sheetWidth={lastNestPayload.sheets[sheetIndex]?.width ?? 96}
                                    sheetHeight={lastNestPayload.sheets[sheetIndex]?.height ?? 48}
                                    parts={lastNestPayload.parts}
                                    sheetplacements={placement.sheetplacements ?? []}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-zinc-800/50 rounded-xl p-3 border border-cyan-700/30">
                          <div className="text-2xl font-bold text-cyan-400">{(nestResult.utilisation ?? 0).toFixed(1)}%</div>
                          <div className="text-xs text-zinc-500">Utilisation</div>
                        </div>
                        <div className="bg-zinc-800/50 rounded-xl p-3 border border-cyan-700/30">
                          <div className="text-2xl font-bold text-white">{(nestResult.placements ?? []).length}</div>
                          <div className="text-xs text-zinc-500">Sheets used</div>
                        </div>
                        <div className="bg-zinc-800/50 rounded-xl p-3 border border-cyan-700/30">
                          <div className="text-2xl font-bold text-white">{(nestResult.placements ?? []).reduce((n, p) => n + (p.sheetplacements?.length ?? 0), 0)}</div>
                          <div className="text-xs text-zinc-500">Parts placed</div>
                        </div>
                        <div
                          className="bg-zinc-800/50 rounded-xl p-3 border border-cyan-700/30"
                          title="Lower is better. Combined cost from NestNow’s search: sheet use, your layout goal, unplaced penalties, and merge-line bonuses when enabled."
                        >
                          <div className="text-lg font-bold text-zinc-300 tabular-nums">
                            {typeof nestResult.fitness === "number"
                              ? nestResult.fitness.toFixed(4)
                              : "—"}
                          </div>
                          <div className="text-xs text-zinc-500">
                            Search cost (fitness)
                          </div>
                          <div className="mt-1 text-[10px] leading-tight text-zinc-600">
                            Lower is better
                          </div>
                        </div>
                      </div>
                      {lastNestPayload && (
                        <div className="rounded-xl border border-zinc-700/80 bg-zinc-900/40 px-4 py-3 text-xs text-zinc-400 space-y-1">
                          <div className="font-semibold text-zinc-300">
                            Last run parameters
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            <span title="Minimum clearance part-to-part and to sheet edge (DeepNest spacing).">
                              part/sheet gap {String(lastNestPayload.config.spacing)}
                              ″
                            </span>
                            <span>
                              rotations {lastNestPayload.config.rotations}
                            </span>
                            <span>
                              placement{" "}
                              {String(lastNestPayload.config.placementType)}
                            </span>
                            <span>
                              merge{" "}
                              {lastNestPayload.config.mergeLines ? "on" : "off"}
                            </span>
                            <span>
                              attempts {lastNestPayload.attemptsUsed}
                            </span>
                            {typeof lastNestPayload.config.requestTimeoutSec ===
                              "number" && (
                              <span>
                                timeout{" "}
                                {String(lastNestPayload.config.requestTimeoutSec)}s
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-zinc-500">
                            <span>
                              curve tol{" "}
                              {String(lastNestPayload.config.curveTolerance)}
                            </span>
                            <span>
                              simplify{" "}
                              {lastNestPayload.config.simplify ? "on" : "off"}
                            </span>
                            <span>
                              clipper {String(lastNestPayload.config.clipperScale)}
                            </span>
                          </div>
                        </div>
                      )}
                      <div>
                        <h4 className="font-bold text-cyan-100 mb-2">Placements</h4>
                        <div className="overflow-x-auto rounded-xl border border-zinc-700">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-zinc-800/80 text-zinc-400 text-left">
                                <th className="px-4 py-2">Sheet</th>
                                <th className="px-4 py-2">Part</th>
                                <th className="px-4 py-2">X</th>
                                <th className="px-4 py-2">Y</th>
                                <th className="px-4 py-2">Rotation</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(nestResult.placements ?? []).flatMap((s, si) =>
                                (s.sheetplacements ?? [])
                                  .filter((p): p is SheetPlacement => Boolean(p))
                                  .map((p, idx) => {
                                    if (!p) return null;
                                    const x = typeof p.x === "number" ? p.x : 0;
                                    const y = typeof p.y === "number" ? p.y : 0;
                                    const rotation = typeof p.rotation === "number" ? p.rotation : 0;
                                    const keyId = typeof p.id === "number" ? p.id : idx;
                                    return (
                                      <tr key={`${si}-${keyId}`} className="border-t border-zinc-700 text-zinc-300">
                                        <td className="px-4 py-2">{(s.sheet ?? si) + 1}</td>
                                        <td className="px-4 py-2">{p.filename ?? `Part ${p.source ?? ""}`}</td>
                                        <td className="px-4 py-2 font-mono">{x.toFixed(1)}</td>
                                        <td className="px-4 py-2 font-mono">{y.toFixed(1)}</td>
                                        <td className="px-4 py-2">{rotation}°</td>
                                      </tr>
                                    );
                                  }),
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                  {!nestLoading && !nestError && !nestResult && (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="text-center text-zinc-500">
                        <Zap className="w-16 h-16 mx-auto mb-4 text-cyan-500/50 animate-pulse" />
                        <p className="text-lg mb-2">Ready for nesting</p>
                        <p className="text-sm">Click Generate Nest to run a demo nest.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Parts list + Selected for Nesting - full width below canvas */}
              <div className="w-full bg-gradient-to-r from-purple-600/20 to-purple-700/20 border border-purple-500/30 rounded-3xl p-6 shadow-xl">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-bold text-xl text-purple-100 mb-3">
                      Parts in this Nest
                    </h4>
                    {parts.length === 0 ? (
                      <p className="text-sm text-purple-200/70">
                        No parts yet. Use <span className="font-semibold">Add Shape</span> or upload DXF/parts to add parts to this nest.
                      </p>
                    ) : (
                      <div className="max-h-64 overflow-y-auto rounded-2xl border border-purple-500/40 bg-purple-950/30">
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
                                    // Prefer explicit OD/ID labels for round shapes created via UI
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
                                    // Fallback: generic bounding-box based dims (for polygons / DXF, or if params missing)
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
                  <div>
                    <h4 className="font-bold text-xl text-purple-100 mb-3">
                      Selected for Nesting
                    </h4>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {selectedForNest.length > 0 ? (
                        selectedForNest.map((r) => (
                          <div
                            key={r.db_id}
                            className="w-full flex items-center gap-3 p-3 bg-purple-500/20 border border-purple-500/30 rounded-xl text-purple-200 text-sm"
                          >
                            <div className="flex-shrink-0">
                              <SheetWireframe
                                lengthIn={r.length_in}
                                widthIn={r.width_in}
                                dims={r.dims}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{r.id}</p>
                              <p className="text-xs text-purple-200/80">
                                {r.material} {r.thickness_in.toFixed(3)}" · {r.dims ?? "—"}
                              </p>
                              {typeof r.est_weight_lbs === "number" && (
                                <p className="text-xs text-emerald-400/90 mt-0.5">
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
                        <p className="text-sm text-purple-200/70 py-2">
                          No sheets selected. Open the <span className="font-semibold">Sheets</span> tab and use the <span className="font-semibold">Nest</span> column or <span className="font-semibold">Manage sheets</span> above.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
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
                      <p className="text-xs text-zinc-500">Enter width and height in inches.</p>
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
      {filterDropdownEl}
    </>
  );
}
