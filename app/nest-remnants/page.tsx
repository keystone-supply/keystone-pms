"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Users,
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
} from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import {
  type Remnant,
  type PartShape,
  genMockSVG,
  parseRemnantDims,
  placeOutline,
  calcWeight,
  rectOutline,
  circleOutline,
  ringOutline,
} from "@/lib/utils";

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

type LastNestPayload = {
  sheets: { width: number; height: number }[];
  parts: { outline: { x: number; y: number }[]; filename?: string; quantity?: number }[];
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

function NestPreviewSVG({
  sheetWidth,
  sheetHeight,
  parts,
  sheetplacements,
}: {
  sheetWidth: number;
  sheetHeight: number;
  parts: { outline: { x: number; y: number }[]; filename?: string }[];
  sheetplacements: SheetPlacement[];
}) {
  const vbW = sheetWidth + 2 * VIEW_PADDING;
  const vbH = sheetHeight + 2 * VIEW_PADDING;
  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      className="w-full h-full min-h-0"
      preserveAspectRatio="xMidYMid meet"
      style={{ overflow: "visible" }}
    >
      <g transform={`translate(${VIEW_PADDING}, ${VIEW_PADDING}) scale(1, -1) translate(0, -${sheetHeight})`}>
        <rect
          x={0}
          y={0}
          width={sheetWidth}
          height={sheetHeight}
          fill="none"
          stroke={SHEET_STROKE}
          strokeWidth={SHEET_STROKE_WIDTH}
        />
        {sheetplacements.map((p, idx) => {
          if (!p) return null;
          const part = parts[p.source];
          const outline = part?.outline;
          if (!outline || !Array.isArray(outline) || outline.length < 3) return null;
          const points = placeOutline(outline, p.rotation ?? 0, p.x ?? 0, p.y ?? 0);
          const pointsStr = points.map((pt) => `${pt.x},${pt.y}`).join(" ");
          const fill = PART_FILLS[idx % PART_FILLS.length];
          const stroke = PART_STROKES[idx % PART_STROKES.length];
          return (
            <polygon
              key={`${p.source}-${p.id}`}
              points={pointsStr}
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
        className="w-24 h-14 text-zinc-500"
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
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<"remnants" | "nest">("nest");

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
  const [lastNestPayload, setLastNestPayload] = useState<LastNestPayload | null>(null);
  const nestInFlightRef = useRef(false);
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

      const { outer } = ringOutline(od, idVal);
      if (!outer.length) {
        setAddShapeError("Failed to create ring outline.");
        return;
      }

      const newPart: PartShape = {
        id: `ring-${parts.length + 1}-${Date.now()}`,
        name: `Round w/ Hole ${parts.length + 1}`,
        kind: "round_hole",
        outline: outer,
        quantity: qty,
        canRotate: true,
        meta: { source: "ui", originalParams: { od_in: od, id_in: idVal } },
      };
      setParts((prev) => [...prev, newPart]);
      closeAddShapeModal();
      return;
    }
  };

  async function handleGenerateNest() {
    if (nestInFlightRef.current) return;
    nestInFlightRef.current = true;
    setNestError(null);
    setNestResult(null);
    setLastNestPayload(null);
    setNestLoading(true);

    if (!remnants.length) {
      setNestError("Add at least one sheet/remnant before nesting.");
      nestInFlightRef.current = false;
      setNestLoading(false);
      return;
    }

    if (!parts.length) {
      setNestError("Add at least one part before nesting.");
      nestInFlightRef.current = false;
      setNestLoading(false);
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

    const sheets = sheetsSource.map((r) => {
      if (r.width_in && r.length_in) {
        return { width: r.width_in, height: r.length_in };
      }
      const parsed = parseRemnantDims(r.dims);
      return { width: parsed.width, height: parsed.height };
    });

    const payload = {
      sheets,
      parts: parts.map((p, index) => ({
        outline: p.outline,
        quantity: p.quantity,
        filename: p.name || `part-${index + 1}`,
      })),
    };
    try {
      const res = await fetch("/api/nest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setNestError(data?.error ?? res.statusText ?? "Nesting failed");
        return;
      }
      setNestResult(data as NestResult);
      setLastNestPayload({ sheets: payload.sheets, parts: payload.parts });
    } catch (e) {
      setNestError(e instanceof Error ? e.message : "Request failed");
    } finally {
      nestInFlightRef.current = false;
      setNestLoading(false);
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
    // notes are not currently on Remnant; they will be preserved via DB on save
    setSheetNotes("");
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

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center gap-2 group relative bg-zinc-900/95 backdrop-blur-sm hover:bg-zinc-900 border border-blue-900/50 rounded-2xl px-6 py-3 font-medium text-white shadow-[0_20px_40px_-10px_rgba(30,58,138,0.3)] shadow-blue-950/60 hover:shadow-[0_30px_50px_-12px_rgba(30,58,138,0.4)] hover:shadow-blue-900/80 hover:-translate-y-1 hover:scale-[1.05] hover:border-blue-800/70 transition-all duration-500 ease-out overflow-hidden"
            >
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
              Dashboard
            </Link>
            <Image
              src="/logo.png"
              alt="Keystone Supply"
              width={250}
              height={123}
              priority
              className="opacity-85 hover:opacity-95 backdrop-blur-sm max-h-28 rounded-3xl shadow-[0_10px_20px_-6px_rgba(30,58,138,0.3)] shadow-blue-950/60 hover:shadow-[0_15px_25px_-8px_rgba(30,58,138,0.4)] hover:shadow-blue-900/80 hover:-translate-y-0.5 transition-all duration-500 ease-out"
            />
            <div className="flex flex-col items-center gap-2">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent tracking-tight mb-3">
                NestNow
              </h1>
              <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-2xl text-sm font-medium min-w-0">
                <Users size={18} />
                <span className="truncate max-w-48">
                  {session?.user?.name ?? "User"}
                </span>
              </div>
              <p className="text-zinc-600 text-lg text-center">
                Track remnants • Optimize nesting • Minimize waste
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden mb-8">
          <div className="flex border-b border-zinc-700">
            <button
              onClick={() => setActiveTab("nest")}
              className={`flex-1 py-6 px-8 min-h-[4rem] border-b border-transparent font-bold text-lg transition-all ${activeTab === "nest"
                ? "bg-gradient-to-r from-cyan-500/20 to-cyan-600/20 border-cyan-400 text-cyan-100 shadow-lg"
                : "text-zinc-400 hover:text-cyan-300 hover:bg-cyan-500/10 hover:border-b-2 hover:border-cyan-400"
                }`}
            >
              <Layers className="inline w-6 h-6 mr-2" />
              Nest Tool
            </button>
            <button
              onClick={() => setActiveTab("remnants")}
              className={`flex-1 py-6 px-8 min-h-[4rem] border-b border-transparent font-bold text-lg transition-all ${activeTab === "remnants"
                ? "bg-gradient-to-r from-purple-500/20 to-purple-600/20 border-purple-400 text-purple-100 shadow-lg"
                : "text-zinc-400 hover:text-purple-300 hover:bg-purple-500/10 hover:border-b-2 hover:border-purple-400"
                }`}
            >
              <Package className="inline w-6 h-6 mr-2" />
              Sheets/Remnants ({remnants.length})
            </button>
          </div>

          {/* Remnants Tab */}
          {activeTab === "remnants" && (
            <div className="p-8">
              <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-2xl p-6 mb-8 shadow-xl">
                <div className="flex flex-col lg:flex-row gap-4 items-center lg:items-end justify-between">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
                    <input
                      type="text"
                      placeholder="Search remnants, materials, jobs..."
                      className="w-full pl-12 pr-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all"
                    />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex items-center gap-2 px-4 py-2 bg-zinc-800/50 border border-zinc-700 rounded-xl text-zinc-400 hover:text-white hover:border-purple-500 transition-colors">
                      <Filter className="w-4 h-4" />
                      <span className="text-sm">Filter</span>
                    </div>
                    <button
                      onClick={() => {
                        setAddStockMode(null);
                        setIsModalOpen(true);
                      }}
                      className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 border border-purple-500/50 rounded-xl font-medium text-white shadow-lg hover:shadow-purple-500/25 hover:-translate-y-0.5 transition-all duration-300"
                    >
                      <Plus className="w-4 h-4" />
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
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-10">
                    {remnants.map((remnant, i) => (
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
                          <p className="text-purple-400 font-mono text-sm mb-3">
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
                          <div className="flex gap-2 mt-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <button
                              className="flex-1 p-2 bg-purple-600/30 hover:bg-purple-500/50 border border-purple-500/40 rounded-xl text-purple-200 text-sm font-medium transition-all hover:scale-105"
                              onClick={() => handleOpenEditSheet(remnant)}
                            >
                              <Edit className="w-4 h-4 mr-1" /> Edit
                            </button>
                            <button
                              className="flex-1 p-2 bg-zinc-700/50 hover:bg-zinc-600 border border-zinc-600 rounded-xl text-zinc-300 text-sm font-medium transition-all hover:scale-105"
                              onClick={() => handleRequestDeleteSheet(remnant)}
                            >
                              <Trash2 className="w-4 h-4 mr-1" /> Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Compact table view similar to projects */}
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-950 border-b border-zinc-800">
                        <tr>
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
                        {remnants.map((r) => (
                          <tr key={r.db_id ?? r.id} className="hover:bg-purple-800/30 transition-colors">
                            <td className="px-6 py-3 text-white font-mono">
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
                                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ring-1 ring-inset ${
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
                                  className="text-purple-300 hover:text-purple-200 text-xs font-medium"
                                  onClick={() => handleOpenEditSheet(r)}
                                >
                                  View / Edit
                                </button>
                                <button
                                  onClick={() => handleRequestDeleteSheet(r)}
                                  className="p-2 rounded-lg text-zinc-500 hover:text-red-300 hover:bg-red-500/20 transition-all duration-200"
                                  title="Archive sheet"
                                >
                                  <Trash2 size={16} strokeWidth={2} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {remnants.length === 0 && (
                          <tr>
                            <td
                              colSpan={7}
                              className="px-6 py-10 text-center text-zinc-500"
                            >
                              No sheets/remnants yet – add stock above.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
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
            <div className="p-8 flex flex-col gap-8">
              {/* Canvas Area - full width across top */}
              <div className="w-full bg-gradient-to-br from-zinc-900/70 to-zinc-950/50 backdrop-blur-sm border-2 border-cyan-800/50 rounded-3xl p-8 shadow-2xl flex flex-col shadow-cyan-500/10 hover:shadow-cyan-500/20 transition-all hover:border-cyan-600/70">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <h3 className="text-2xl font-bold text-cyan-100 flex items-center gap-3">
                    <Layers className="w-8 h-8" />
                    Nesting Canvas
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={openAddShapeModal}
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-purple-600/25 hover:bg-purple-500/45 border border-purple-500/40 text-purple-100 text-sm font-medium transition-all hover:shadow-purple-500/25"
                    >
                      <Plus className="w-4 h-4" /> Add Shape
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        // Placeholder: future DXF upload will parse files into PartShape[]
                        // and append them to parts state. For now this keeps the UX wired
                        // conceptually to the same parts pipeline.
                        alert("DXF/Parts upload coming soon. Shapes from DXF will be added to the same Parts list and used in nests alongside UI-created shapes.");
                      }}
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-600/30 hover:bg-cyan-500/50 border border-cyan-500/40 text-cyan-200 text-sm font-medium transition-all hover:shadow-cyan-500/25"
                    >
                      <Upload className="w-4 h-4" /> Upload DXF/Parts
                    </button>
                    <button
                      onClick={handleGenerateNest}
                      disabled={nestLoading}
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-emerald-600/30 to-emerald-500/50 border border-emerald-500/40 text-emerald-200 text-sm font-medium transition-all hover:shadow-emerald-500/25 disabled:opacity-60 disabled:pointer-events-none"
                    >
                      {nestLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Zap className="w-4 h-4" />
                      )}
                      {nestLoading ? "Nesting…" : "Generate Nest"}
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-700/50 hover:bg-zinc-600 border border-zinc-600 text-zinc-300 text-sm font-medium transition-all">
                      Export Cuts (.DXF)
                    </button>
                  </div>
                </div>
                <div className="flex-1 bg-zinc-800/30 border-2 border-dashed border-cyan-700/50 rounded-2xl flex flex-col overflow-auto shadow-inner min-h-[200px]">
                  {nestLoading && (
                    <div className="flex-1 flex items-center justify-center text-cyan-400">
                      <Loader2 className="w-12 h-12 animate-spin mr-3" />
                      <span>Nesting…</span>
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
                        <div className="bg-zinc-800/50 rounded-xl p-3 border border-cyan-700/30">
                          <div className="text-lg font-bold text-zinc-300">{nestResult.fitness ?? "—"}</div>
                          <div className="text-xs text-zinc-500">Fitness</div>
                        </div>
                      </div>
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

              {/* Parts list + Available Remnants - full width below canvas */}
              <div className="w-full bg-gradient-to-r from-purple-600/20 to-purple-700/20 border border-purple-500/30 rounded-3xl p-6 shadow-xl">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-bold text-xl text-purple-100 mb-3">
                      Parts in this nest
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
                                <td className="px-3 py-2 text-right font-mono">
                                  {p.quantity}
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
                      Available Remnants
                    </h4>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {remnants.slice(0, 3).map((r, i) => (
                        <button
                          key={i}
                          className="w-full flex items-center gap-3 p-3 bg-purple-500/20 hover:bg-purple-400/30 border border-purple-500/30 rounded-xl text-purple-200 text-sm font-medium transition-all hover:scale-[1.02]"
                        >
                          <div className="w-12 h-12 bg-gradient-to-br from-purple-500/30 to-purple-600/30 rounded-lg flex items-center justify-center shadow-md">
                            {r.dims ? `${r.dims.split("x")[0]}x${r.dims.split("x")[1]}` : "N/A"}
                          </div>
                          <span className="truncate">
                            {r.material} {r.thickness_in.toFixed(3)}"
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Stats Footer */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl">
            <div className="text-3xl font-bold text-emerald-400">245 lbs</div>
            <div className="text-zinc-500 mt-1">Total Remnants</div>
          </div>
          <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl">
            <div className="text-3xl font-bold text-purple-400">$1,240</div>
            <div className="text-zinc-500 mt-1">Est. Value</div>
          </div>
          <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl">
            <div className="text-3xl font-bold text-cyan-400">92%</div>
            <div className="text-zinc-500 mt-1">Avg Utilization</div>
          </div>
          <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl">
            <div className="text-3xl font-bold text-amber-400">4.2%</div>
            <div className="text-zinc-500 mt-1">Waste Saved</div>
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
                <input
                  type="text"
                  placeholder="e.g. A36 Steel, 304 SS"
                  disabled={addStockMode !== "sheet"}
                  value={sheetMaterial}
                  onChange={(e) => setSheetMaterial(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-600 text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:opacity-70"
                />
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
    </div>
  );
}
