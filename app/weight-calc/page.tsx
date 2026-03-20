/** Material weight/cost calculator; tape line items; export to file or OneDrive project _DOCS. */
"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import {
  ArrowDown,
  ClipboardList,
  CloudUpload,
  DollarSign,
  Download,
  HardDriveDownload,
  ListOrdered,
  Ruler,
  Scale,
  Trash2,
  Weight,
} from "lucide-react";
import { uploadTapeToDocs } from "@/lib/onedrive";
import { useState, useCallback, useMemo, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { QuickLinksBar } from "@/components/dashboard/quick-links-bar";
import { supabase } from "@/lib/supabaseClient";
import {
  aggregateDashboardMetrics,
  type DashboardProjectRow,
} from "@/lib/dashboardMetrics";
import { PROJECT_SELECT } from "@/lib/projectQueries";

type MaterialKey = "al" | "cs" | "ar500" | "viking" | "304ss" | "hiace";

type ShapeValue = "round" | "square" | "tube";

type CostKey = "mild" | "ar500" | "viking" | "aluminum" | "304ss" | "hiace";

interface MaterialInfo {
  name: string;
  density: number;
}

interface Shape {
  value: ShapeValue;
  label: string;
  dimLabel1: string;
  dimLabel2: string | null;
  hasDim2: boolean;
}

interface TapeItem {
  id: string;
  notes: string;
  material: MaterialKey;
  materialName: string;
  density: number;
  shape: ShapeValue;
  lengthIn: number;
  dim1: number;
  dim2: number;
  thickness: number;
  costPerLb: number;
  sellPerLb?: number;
  quantity: number;
}

export default function WeightCalcPage() {
  const { data: session, status } = useSession();

  const [openQuotesCount, setOpenQuotesCount] = useState(0);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const [projects, setProjects] = useState<
    { project_number: string; project_name: string; customer: string }[]
  >([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const [exportMethod, setExportMethod] = useState<"download" | "onedrive">(
    "download",
  );

  const materialDensities: Record<MaterialKey, MaterialInfo> = {
    al: { name: "Aluminum 6061", density: 0.098 },
    cs: { name: "Mild A36", density: 0.284 },
    ar500: { name: "AR500", density: 0.295 },
    viking: { name: "Viking", density: 0.303 },
    "304ss": { name: "304 SS", density: 0.295 },
    hiace: { name: "HiAce", density: 0.295 },
  };

  const shapes: Shape[] = [
    {
      value: "square",
      label: "Rectangle / Plate",
      dimLabel1: "Width (in)",
      dimLabel2: "Thickness (in)",
      hasDim2: true,
    },
    {
      value: "round",
      label: "Solid Round",
      dimLabel1: "Diameter (in)",
      dimLabel2: null,
      hasDim2: false,
    },
    {
      value: "tube",
      label: "Hollow Tube",
      dimLabel1: "OD (in)",
      dimLabel2: "Wall Thickness (in)",
      hasDim2: true,
    },
  ];

  const costs: Record<CostKey, number> = {
    mild: 0.65,
    ar500: 1.75,
    viking: 3.03,
    aluminum: 6.0,
    "304ss": 3.5,
    hiace: 2.1,
  };

  const VIKING_SELL_PER_LB = 6;
  const HIACE_SELL_PER_LB = 3.25;
  const STANDARD_SELL_MULTIPLIER = 1.3;

  const materialOrder: Record<MaterialKey, number> = {
    cs: 0,
    ar500: 1,
    viking: 2,
    hiace: 3,
    "304ss": 4,
    al: 5,
  };

  const materialCostOptions: {
    costKey: CostKey;
    materialKey: MaterialKey;
    label: string;
  }[] = [
      { costKey: "mild", materialKey: "cs", label: "Mild A36" },
      { costKey: "ar500", materialKey: "ar500", label: "AR500" },
      { costKey: "viking", materialKey: "viking", label: "Viking" },
      { costKey: "hiace", materialKey: "hiace", label: "HiAce" },
      { costKey: "aluminum", materialKey: "al", label: "Aluminum 6061" },
      { costKey: "304ss", materialKey: "304ss", label: "304 SS" },
    ];

  const [materialCostOption, setMaterialCostOption] = useState<CostKey>("mild");
  const [shape, setShape] = useState<ShapeValue>("square");
  const [lengthIn, setLengthIn] = useState<number>(96);
  const [dim1, setDim1] = useState(1);
  const [dim2, setDim2] = useState(0.25);
  const [quantity, setQuantity] = useState<number>(1);

  const [tapeItems, setTapeItems] = useState<TapeItem[]>([]);

  const selectedMaterialCost = useMemo(
    () =>
      materialCostOptions.find((o) => o.costKey === materialCostOption) ??
      materialCostOptions[0],
    [materialCostOption],
  );
  const material = selectedMaterialCost.materialKey;
  const cost = selectedMaterialCost.costKey;

  const currentShape = shapes.find((s) => s.value === shape);

  const computeArea = useCallback(
    (shapeVal: ShapeValue, d1: number, d2: number): number => {
      let a = 0;
      if (shapeVal === "round") {
        const radius = d1 / 2;
        a = Math.PI * radius * radius;
      } else if (shapeVal === "square") {
        a = d1 * d2;
      } else if (shapeVal === "tube") {
        const odRadius = d1 / 2;
        const wallThickness = d2;
        const innerDia = d1 - 2 * wallThickness;
        if (innerDia > 0) {
          const idRadius = innerDia / 2;
          a = Math.PI * (odRadius * odRadius - idRadius * idRadius);
        }
      }
      return a;
    },
    [],
  );

  const area = computeArea(shape, dim1, currentShape?.hasDim2 ? dim2 : 0);
  const density = materialDensities[material]?.density || 0.284;
  const previewWeight = density * area * lengthIn * quantity;
  const previewWeightKg = previewWeight * 0.453592;

  const computeUnitWeight = useCallback(
    (item: TapeItem): number => {
      const a = computeArea(item.shape, item.dim1, item.dim2);
      return item.density * a * item.lengthIn;
    },
    [computeArea],
  );

  const costPerLb = costs[cost] || 0.65;
  const previewTotalCost = previewWeight * costPerLb;

  const getItemTotals = useCallback(
    (item: TapeItem) => {
      const unitWeight = computeUnitWeight(item);
      const unitCost = unitWeight * item.costPerLb;
      const totalWeight = unitWeight * item.quantity;
      const totalCost = unitCost * item.quantity;
      const sellPerLb =
        item.sellPerLb ??
        (item.costPerLb === costs.viking
          ? VIKING_SELL_PER_LB
          : item.costPerLb === costs.hiace
            ? HIACE_SELL_PER_LB
            : item.costPerLb * STANDARD_SELL_MULTIPLIER);
      const estSell = totalWeight * sellPerLb;
      return { unitWeight, unitCost, totalWeight, totalCost, estSell };
    },
    [computeUnitWeight],
  );

  const formattedWeight = (
    isNaN(previewWeight) || previewWeight === 0 ? 0 : previewWeight
  ).toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const formattedWeightKg = (
    isNaN(previewWeightKg) ? 0 : previewWeightKg
  ).toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const formattedCost = (
    isNaN(previewTotalCost) || previewTotalCost === 0 ? 0 : previewTotalCost
  ).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  const estSell =
    cost === "viking"
      ? previewWeight * VIKING_SELL_PER_LB
      : cost === "hiace"
        ? previewWeight * HIACE_SELL_PER_LB
        : previewTotalCost * STANDARD_SELL_MULTIPLIER;
  const formattedEstSell = (
    isNaN(estSell) || estSell === 0 ? 0 : estSell
  ).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  const margin = estSell - previewTotalCost;
  const formattedMargin = (
    isNaN(margin) || margin === 0 ? 0 : margin
  ).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  const saveToTape = useCallback(() => {
    const id = crypto.randomUUID();
    const opt = selectedMaterialCost;
    const mat = materialDensities[opt.materialKey];
    const sellPerLb =
      opt.costKey === "viking"
        ? VIKING_SELL_PER_LB
        : opt.costKey === "hiace"
          ? HIACE_SELL_PER_LB
          : costs[opt.costKey] * STANDARD_SELL_MULTIPLIER;
    const newItem: TapeItem = {
      id,
      notes: "",
      material: opt.materialKey,
      materialName: opt.label,
      density: mat.density,
      shape,
      lengthIn,
      dim1,
      dim2,
      thickness: dim2,
      costPerLb: costs[opt.costKey],
      sellPerLb,
      quantity,
    };
    setTapeItems((prev) => [...prev, newItem]);
  }, [selectedMaterialCost, shape, lengthIn, dim1, dim2, quantity]);

  const getItemMaterialCostKey = useCallback(
    (item: TapeItem): CostKey => {
      const match = materialCostOptions.find(
        (o) =>
          o.materialKey === item.material &&
          Math.abs(costs[o.costKey] - item.costPerLb) < 0.01,
      );
      return match?.costKey ?? "mild";
    },
    [],
  );

  const updateItemMaterialCost = useCallback(
    (id: string, costKey: CostKey) => {
      const opt = materialCostOptions.find((o) => o.costKey === costKey);
      if (!opt) return;
      const mat = materialDensities[opt.materialKey];
      setTapeItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          const sellPerLb =
            opt.costKey === "viking"
              ? VIKING_SELL_PER_LB
              : opt.costKey === "hiace"
                ? HIACE_SELL_PER_LB
                : costs[opt.costKey] * STANDARD_SELL_MULTIPLIER;
          return {
            ...item,
            material: opt.materialKey,
            materialName: opt.label,
            density: mat.density,
            costPerLb: costs[opt.costKey],
            sellPerLb,
          };
        }),
      );
    },
    [],
  );

  const removeFromTape = useCallback((id: string) => {
    setTapeItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const fetchProjects = useCallback(async () => {
    setProjectsLoading(true);

    const { data, error } = await supabase
      .from("projects")
      .select("project_number, project_name, customer, project_status, customer_approval")
      .eq("project_complete", false)
      .or("customer_approval.is.null,customer_approval.neq.CANCELLED")
      .or("project_status.is.null,project_status.neq.cancelled")
      .order("project_number", { ascending: false });

    if (error) {
      console.error("Error fetching projects:", error);
    }

    setProjects(data || []);
    setProjectsLoading(false);
  }, []);

  const fetchOpenQuotesCount = useCallback(async () => {
    const { data, error } = await supabase
      .from("projects")
      .select(PROJECT_SELECT);
    if (error || !data) return;
    setOpenQuotesCount(
      aggregateDashboardMetrics(data as DashboardProjectRow[]).openQuotes,
    );
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetchOpenQuotesCount();
  }, [status, fetchOpenQuotesCount]);

  const updateItem = useCallback(
    (id: string, field: keyof TapeItem, value: any) => {
      setTapeItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          const updated = { ...item, [field]: value };
          if (field === "material") {
            const mat = materialDensities[value as MaterialKey];
            updated.materialName = mat.name;
            updated.density = mat.density;
          }
          if (field === "dim2") {
            updated.thickness = value;
          }
          return updated;
        }),
      );
    },
    [],
  );

  const sortedTapeItems = useMemo(() => {
    return [...tapeItems].sort((a, b) => {
      const orderA = materialOrder[a.material] ?? 999;
      const orderB = materialOrder[b.material] ?? 999;
      return orderA - orderB;
    });
  }, [tapeItems]);

  const grandTotalWeight = useMemo(() => {
    return sortedTapeItems.reduce((sum, item) => {
      const totals = getItemTotals(item);
      return sum + totals.totalWeight;
    }, 0);
  }, [sortedTapeItems, getItemTotals]);

  const grandTotalCost = useMemo(() => {
    return sortedTapeItems.reduce((sum, item) => {
      const totals = getItemTotals(item);
      return sum + totals.totalCost;
    }, 0);
  }, [sortedTapeItems, getItemTotals]);

  const grandTotalEstSell = useMemo(() => {
    return sortedTapeItems.reduce((sum, item) => {
      const totals = getItemTotals(item);
      return sum + totals.estSell;
    }, 0);
  }, [sortedTapeItems, getItemTotals]);
  const formattedGrandEstSell = useMemo(() => {
    const value =
      isNaN(grandTotalEstSell) || grandTotalEstSell === 0
        ? 0
        : grandTotalEstSell;
    return value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
  }, [grandTotalEstSell]);

  const formattedGrandWeight = (
    isNaN(grandTotalWeight) || grandTotalWeight === 0 ? "0.0" : grandTotalWeight
  ).toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const formattedGrandCost = (
    isNaN(grandTotalCost) || grandTotalCost === 0 ? "$0.00" : grandTotalCost
  ).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  const grandTotalMargin = grandTotalEstSell - grandTotalCost;
  const formattedGrandMargin = (
    isNaN(grandTotalMargin) || grandTotalMargin === 0 ? 0 : grandTotalMargin
  ).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  const generateTapeContent = useCallback(() => {
    // Define columns: [label, width]
    const columns = [
      { label: "Notes", width: 25 },
      { label: "Material", width: 45 },
      { label: "Shape", width: 15 },
      { label: "Length (in)", width: 12 },
      { label: "Dim1 (in)", width: 10 },
      { label: "Dim2 (in)", width: 10 },
      { label: "Qty", width: 6 },
      { label: "Cost/lb", width: 10 },
      { label: "Sell/lb", width: 10 },
      { label: "Weight (lbs)", width: 12 },
      { label: "Total Cost", width: 15 },
      { label: "Est. Sell", width: 15 },
      { label: "Margin", width: 15 },
    ];

    const colWidths = columns.map((col) => col.width);

    // New wrapText (lines 243-260ish in file):
    const wrapText = (text: string, width: number): string[] => {
      if (!text || text.length <= width) return [text];
      const lines: string[] = [];
      let i = 0;
      while (i < text.length) {
        let chunk = text.slice(i, i + width);
        // Prefer word-break: shrink if possible to avoid mid-word
        while (
          chunk.length > 0 &&
          chunk.includes(" ") &&
          chunk.lastIndexOf(" ") > width / 2
        ) {
          chunk = chunk.slice(0, chunk.lastIndexOf(" "));
        }
        lines.push(chunk);
        i += chunk.length;
      }
      return lines;
    };

    // Headers
    const headerLine = columns
      .map((col) => col.label.padEnd(col.width, " ").slice(0, col.width))
      .join("\t");
    const underlineLine = columns
      .map((col) => "-".repeat(col.width))
      .join("\t");
    let content = headerLine + "\n" + underlineLine + "\n" + "\n";

    // Rows: for each item, generate multi-line if needed
    sortedTapeItems.forEach((item) => {
      const shapeLabel =
        shapes.find((s) => s.value === item.shape)?.label || "Unknown";
      const hasDim2 =
        shapes.find((s) => s.value === item.shape)?.hasDim2 ?? false;
      const materialOpt = materialCostOptions.find(
        (o) =>
          o.materialKey === item.material &&
          Math.abs(costs[o.costKey] - item.costPerLb) < 0.01,
      );
      const materialFullName = materialOpt
        ? `${materialOpt.label} — $${costs[materialOpt.costKey].toFixed(2)}/lb — ${materialDensities[materialOpt.materialKey].density.toFixed(3)} lb/in³`
        : item.materialName;
      const totals = getItemTotals(item);
      const sellPerLb =
        item.sellPerLb ??
        (item.costPerLb === costs.viking
          ? VIKING_SELL_PER_LB
          : item.costPerLb === costs.hiace
            ? HIACE_SELL_PER_LB
            : item.costPerLb * STANDARD_SELL_MULTIPLIER);
      const fields = [
        item.notes || "",
        materialFullName,
        shapeLabel,
        item.lengthIn.toFixed(2),
        item.dim1.toFixed(3),
        hasDim2 ? item.dim2.toFixed(3) : "",
        item.quantity.toString(),
        `$${item.costPerLb.toFixed(2)}`,
        `$${sellPerLb.toFixed(2)}`,
        totals.totalWeight.toFixed(1),
        `$${totals.totalCost.toFixed(2)}`,
        `$${totals.estSell.toFixed(2)}`,
        `$${(totals.estSell - totals.totalCost).toFixed(2)}`,
      ];
      const fieldLines = fields.map((field, i) =>
        wrapText(field, colWidths[i]),
      );
      const maxLines = Math.max(1, ...fieldLines.map((lines) => lines.length));

      for (let lineIdx = 0; lineIdx < maxLines; lineIdx++) {
        const rowFields = colWidths.map((width, fieldIdx) => {
          const lines = fieldLines[fieldIdx];
          const text = lines[lineIdx] || "";
          return text.padEnd(width, " ").slice(0, width);
        });
        content += rowFields.join("\t") + "\n";
      }
      content += "\n"; // Always blank row between items
    });

    // Grand totals (pad labels for rough alignment)
    content += "\n";
    content +=
      "Grand Total Weight:".padEnd(40, " ").slice(0, 40) +
      formattedGrandWeight +
      " lbs\n";
    content +=
      "Grand Total Cost:".padEnd(40, " ").slice(0, 40) +
      formattedGrandCost +
      "\n";
    content +=
      "Grand Total Est. Sell:".padEnd(40, " ").slice(0, 40) +
      formattedGrandEstSell +
      "\n";
    content +=
      "Grand Total Margin:".padEnd(40, " ").slice(0, 40) +
      formattedGrandMargin +
      "\n";

    return content;
  }, [
    sortedTapeItems,
    shapes,
    getItemTotals,
    formattedGrandWeight,
    formattedGrandCost,
    formattedGrandEstSell,
    formattedGrandMargin,
  ]);

  const handleExport = useCallback(async () => {
    setExportError("");
    setIsExporting(true);
    if (sortedTapeItems.length === 0) {
      setExportError("No items in tape to export.");
      setIsExporting(false);
      return;
    }
    if (exportMethod === "onedrive" && !selectedJob) {
      setExportError("Please select a job.");
      setIsExporting(false);
      return;
    }
    const content = generateTapeContent();
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename =
      exportMethod === "download"
        ? `Tape_Export_${timestamp}.txt`
        : `Tape_Export_${selectedJob}_${timestamp}.txt`;
    if (exportMethod === "download") {
      // Direct browser download
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      alert(`✅ Downloaded: ${filename}`);
      setIsExporting(false);
      setIsExportModalOpen(false);
      return;
    }
    // OneDrive upload (existing logic)
    try {
      const freshSessionRes = await fetch("/api/auth/session");
      const freshSession = await freshSessionRes.json();
      const freshToken = freshSession?.accessToken;
      if (!freshToken) {
        throw new Error("No access token. Please sign out and sign back in.");
      }
      const selectedProject = projects.find(
        (p) => p.project_number === selectedJob,
      );
      if (!selectedProject) {
        throw new Error("Selected project not found in list");
      }
      const oneDrivePath = await uploadTapeToDocs(
        freshToken,
        selectedProject.customer,
        selectedProject.project_number,
        selectedProject.project_name,
        filename,
        content,
      );
      console.log("✅ Uploaded to OneDrive:", oneDrivePath);
      alert(`✅ Uploaded to ${selectedJob}/${selectedJob}-DOCS/${filename}`);
    } catch (err: any) {
      console.error("❌ Upload error:", err);
      setExportError(`Upload failed: ${err.message}`);
    } finally {
      setIsExporting(false);
      setIsExportModalOpen(false);
      setSelectedJob("");
    }
  }, [
    exportMethod,
    selectedJob,
    sortedTapeItems,
    projects,
    generateTapeContent,
    formattedGrandWeight,
    formattedGrandCost,
    formattedGrandEstSell,
    uploadTapeToDocs,
  ]);

  useEffect(() => {
    if (isExportModalOpen) {
      fetchProjects();
      setSelectedJob("");
      setExportMethod("download"); // Quick access to download by default
    }
  }, [isExportModalOpen, fetchProjects]);

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
        <p className="mb-6 text-lg text-zinc-300">
          Sign in to use the weight calculator.
        </p>
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

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <DashboardHeader
          userName={session?.user?.name}
          lastUpdated={null}
          onSignOut={() => signOut({ callbackUrl: "/" })}
          title="Weight calculator"
          subtitle="Estimate part weight and cost, build a tape, and export to a file or a job’s _DOCS folder."
          showLastUpdated={false}
          backHref="/"
          backLabel="Dashboard"
        />

        <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200/90">
          Tape is held in memory only — it resets when you refresh the page.
        </div>

        <div className="mt-8">
          <QuickLinksBar
            openQuotesCount={openQuotesCount}
            activeHref="/weight-calc"
            newProjectHref="/new-project?returnTo=%2Fweight-calc"
          />
        </div>

        <section
          aria-label="Calculator snapshot"
          className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <KpiCard
            label="Items on tape"
            value={tapeItems.length}
            hint="Lines in the tape below"
            icon={ListOrdered}
          />
          <KpiCard
            label="Preview weight"
            value={`${formattedWeight} lbs`}
            hint={`${formattedWeightKg} kg · current line`}
            icon={Weight}
          />
          <KpiCard
            label="Tape total weight"
            value={
              tapeItems.length === 0 ? "—" : `${formattedGrandWeight} lbs`
            }
            hint="Sum of all tape lines"
            icon={Scale}
          />
          <KpiCard
            label="Tape margin"
            value={tapeItems.length === 0 ? "—" : formattedGrandMargin}
            hint="Est. sell minus cost on tape"
            icon={DollarSign}
            valueClassName={
              tapeItems.length === 0
                ? undefined
                : grandTotalMargin >= 0
                  ? "text-emerald-400"
                  : "text-red-400"
            }
          />
        </section>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 shadow-xl">
            <h2 className="mb-6 flex items-center gap-3 text-xl font-semibold tracking-tight text-white">
              <Scale className="size-6 shrink-0 text-zinc-500" aria-hidden />
              Material &amp; shape
            </h2>
            <div className="space-y-8">
              <div>
                <label className="mb-3 block text-sm font-medium text-zinc-400">
                  Material
                </label>
                <div className="flex flex-wrap gap-2">
                  {materialCostOptions.map((opt) => {
                    const mat = materialDensities[opt.materialKey];
                    const costVal = costs[opt.costKey];
                    const sellPerLb =
                      opt.costKey === "viking"
                        ? VIKING_SELL_PER_LB
                        : opt.costKey === "hiace"
                          ? HIACE_SELL_PER_LB
                          : costVal * STANDARD_SELL_MULTIPLIER;
                    const isSelected = materialCostOption === opt.costKey;
                    return (
                      <button
                        key={opt.costKey}
                        type="button"
                        onClick={() => setMaterialCostOption(opt.costKey)}
                        className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors ${isSelected
                          ? "border-blue-500/50 bg-blue-500/15 text-blue-100 ring-1 ring-blue-500/30"
                          : "border-zinc-700 bg-zinc-900/50 text-zinc-300 hover:border-zinc-600 hover:text-white"
                          }`}
                      >
                        <span className="block font-semibold">
                          {opt.label} — ${sellPerLb.toFixed(2)}/lb
                        </span>
                        <span className="block opacity-90">
                          Cost ${costVal.toFixed(2)}/lb · {mat.density.toFixed(3)}{" "}
                          lb/in³
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="mb-3 block text-sm font-medium text-zinc-400">
                  Shape
                </label>
                <div className="flex flex-wrap gap-2">
                  {shapes.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setShape(s.value)}
                      className={`rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${shape === s.value
                        ? "border-blue-500/50 bg-blue-500/15 text-blue-100 ring-1 ring-blue-500/30"
                        : "border-zinc-700 bg-zinc-900/50 text-zinc-300 hover:border-zinc-600 hover:text-white"
                        }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 shadow-xl">
            <h2 className="mb-6 flex items-center gap-3 text-xl font-semibold tracking-tight text-white">
              <Ruler className="size-6 shrink-0 text-zinc-500" aria-hidden />
              Dimensions
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
              {/* Qnty # - Top Left */}
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-400">
                  Qnty #
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(+e.target.value || 1)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950/50 px-4 py-3 text-base font-medium text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. 1"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-400">
                  Length (in)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={lengthIn}
                  onChange={(e) => setLengthIn(+e.target.value || 0)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950/50 px-4 py-3 text-base font-medium text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. 144"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-400">
                  {currentShape?.dimLabel1 ?? "Dimension 1 (in)"}
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={dim1}
                  onChange={(e) => setDim1(+e.target.value || 0)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950/50 px-4 py-3 text-base font-medium text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. 2.0"
                />
              </div>
              {currentShape?.hasDim2 && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-400">
                    {currentShape!.dimLabel2!}
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={dim2}
                    onChange={(e) => setDim2(+e.target.value || 0)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950/50 px-4 py-3 text-base font-medium text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g. 0.125"
                  />
                </div>
              )}
            </div>
            <div className="mt-8 border-t border-zinc-800/80 pt-8">
              <h3 className="mb-4 text-lg font-semibold text-white">
                Preview · weight &amp; budget
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="text-center">
                  <div className="text-xl font-mono font-bold text-zinc-400 mb-1 tracking-tight">
                    Weight (lbs)
                  </div>
                  <div className="text-3xl font-mono font-bold bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600 bg-clip-text text-transparent mb-2 shadow-2xl">
                    {formattedWeight}
                  </div>
                  <p className="text-zinc-400 text-sm">
                    ({formattedWeightKg} kg)
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-xl font-mono font-bold text-zinc-400 mb-1 tracking-tight">
                    Cost $$
                  </div>
                  <div className="text-3xl font-mono font-bold bg-gradient-to-r from-amber-400 via-yellow-500 to-orange-500 bg-clip-text text-transparent mb-2 shadow-2xl">
                    {formattedCost}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-mono font-bold text-zinc-400 mb-1 tracking-tight">
                    Sell $$
                  </div>
                  <div className="text-3xl font-mono font-bold bg-gradient-to-r from-violet-400 via-purple-500 to-pink-500 bg-clip-text text-transparent mb-2 shadow-2xl">
                    {formattedEstSell}
                  </div>
                  <div className="flex items-baseline justify-center gap-2 mt-2">
                    <span className="text-sm font-mono font-bold text-zinc-400">
                      Margin
                    </span>
                    <span className="text-lg font-mono font-bold bg-gradient-to-r from-cyan-400 via-teal-500 to-emerald-600 bg-clip-text text-transparent">
                      {formattedMargin}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                type="button"
                onClick={saveToTape}
                className="gap-2"
              >
                <ArrowDown className="size-4" aria-hidden />
                Save to tape
              </Button>
            </div>
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 shadow-xl">
            <h2 className="mb-6 flex items-center gap-3 text-xl font-semibold tracking-tight text-white">
              <ClipboardList
                className="size-6 shrink-0 text-zinc-500"
                aria-hidden
              />
              Tape
            </h2>
            {tapeItems.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-700/80 bg-zinc-950/30 py-16 text-center text-sm text-zinc-500">
                No items on tape yet. Configure material and dimensions, then use
                &quot;Save to tape&quot;.
              </p>
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border border-zinc-800/80 shadow-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-32 font-medium">
                          Notes
                        </TableHead>
                        <TableHead className="w-72 font-medium">
                          Material
                        </TableHead>
                        <TableHead className="w-28">Shape</TableHead>
                        <TableHead className="w-20 text-right font-mono">
                          Length
                        </TableHead>
                        <TableHead className="w-20 text-right font-mono">
                          Dim1
                        </TableHead>
                        <TableHead className="w-20 text-right font-mono">
                          Dim2
                        </TableHead>
                        <TableHead className="w-20 text-right">Qty</TableHead>
                        <TableHead className="w-22 text-right font-mono">
                          Cost/lb
                        </TableHead>
                        <TableHead className="w-22 text-right font-mono">
                          Sell/lb
                        </TableHead>
                        <TableHead className="w-24 text-right font-mono">
                          Weight
                        </TableHead>
                        <TableHead className="w-24 text-right font-mono">
                          Total Cost
                        </TableHead>
                        <TableHead className="w-32 text-right font-mono">
                          Sell $$
                        </TableHead>
                        <TableHead className="w-24 text-right font-mono">
                          Margin $$
                        </TableHead>
                        <TableHead className="w-16" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedTapeItems.map((item) => {
                        const totals = getItemTotals(item);
                        return (
                          <TableRow
                            key={item.id}
                            className="group hover:bg-blue-600/80"
                          >
                            <TableCell>
                              <input
                                type="text"
                                value={item.notes ?? ""}
                                onChange={(e) =>
                                  updateItem(item.id, "notes", e.target.value)
                                }
                                className="w-full bg-transparent border-none outline-none text-white/90 group-hover:text-white focus:bg-zinc-800/50 focus:outline-none focus:ring-0 rounded px-1 text-sm placeholder-zinc-500"
                                placeholder="Add notes..."
                              />
                            </TableCell>
                            <TableCell className="font-medium text-white/90 group-hover:text-white">
                              <select
                                value={getItemMaterialCostKey(item)}
                                onChange={(e) =>
                                  updateItemMaterialCost(
                                    item.id,
                                    e.target.value as CostKey,
                                  )
                                }
                                className="w-full bg-transparent border-none outline-none text-white/90 group-hover:text-white focus:bg-zinc-800/50 focus:outline-none focus:ring-0 rounded px-1"
                              >
                                {materialCostOptions.map((opt) => {
                                  const mat = materialDensities[opt.materialKey];
                                  const costVal = costs[opt.costKey];
                                  return (
                                    <option
                                      key={opt.costKey}
                                      value={opt.costKey}
                                      className="bg-zinc-800 text-white"
                                    >
                                      {opt.label} — $
                                      {costVal.toFixed(2)}/lb —{" "}
                                      {mat.density.toFixed(3)} lb/in³
                                    </option>
                                  );
                                })}
                              </select>
                            </TableCell>
                            <TableCell>
                              <select
                                value={item.shape}
                                onChange={(e) =>
                                  updateItem(
                                    item.id,
                                    "shape",
                                    e.target.value as ShapeValue,
                                  )
                                }
                                className="w-full bg-transparent border-none outline-none text-white group-hover:text-white focus:bg-zinc-800/50 focus:outline-none focus:ring-0 rounded px-1"
                              >
                                {shapes.map((s) => (
                                  <option
                                    key={s.value}
                                    value={s.value}
                                    className="bg-zinc-800 text-white"
                                  >
                                    {s.label}
                                  </option>
                                ))}
                              </select>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm opacity-90">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={item.lengthIn}
                                onChange={(e) =>
                                  updateItem(
                                    item.id,
                                    "lengthIn",
                                    +e.target.value || 0,
                                  )
                                }
                                className="w-full text-right bg-transparent border-none outline-none font-mono text-sm opacity-90 focus:bg-zinc-800/50 focus:outline-none focus:ring-0 rounded px-1 accent-zinc-300"
                              />
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm opacity-90">
                              <input
                                type="number"
                                step="0.001"
                                min="0"
                                value={item.dim1}
                                onChange={(e) =>
                                  updateItem(
                                    item.id,
                                    "dim1",
                                    +e.target.value || 0,
                                  )
                                }
                                className="w-full text-right bg-transparent border-none outline-none font-mono text-sm opacity-90 focus:bg-zinc-800/50 focus:outline-none focus:ring-0 rounded px-1 accent-zinc-300"
                              />
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm opacity-90">
                              {shapes.find((s) => s.value === item.shape)
                                ?.hasDim2 ? (
                                <input
                                  type="number"
                                  step="0.001"
                                  min="0"
                                  value={item.dim2}
                                  onChange={(e) =>
                                    updateItem(
                                      item.id,
                                      "dim2",
                                      +e.target.value || 0,
                                    )
                                  }
                                  className="w-full text-right bg-transparent border-none outline-none font-mono text-sm opacity-90 focus:bg-zinc-800/50 focus:outline-none focus:ring-0 rounded px-1 accent-zinc-300"
                                />
                              ) : (
                                <span>&nbsp;</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm opacity-90">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) =>
                                  updateItem(
                                    item.id,
                                    "quantity",
                                    +e.target.value || 1,
                                  )
                                }
                                className="w-full text-right bg-transparent border-none outline-none font-mono text-sm opacity-90 focus:bg-zinc-800/50 focus:outline-none focus:ring-0 rounded px-1 accent-zinc-300"
                              />
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm opacity-90">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.costPerLb.toFixed(2)}
                                onChange={(e) =>
                                  updateItem(
                                    item.id,
                                    "costPerLb",
                                    +e.target.value,
                                  )
                                }
                                className="w-full text-right bg-transparent border-none outline-none font-mono text-sm opacity-90 focus:bg-zinc-800/50 focus:outline-none focus:ring-0 rounded px-1 accent-zinc-300"
                              />
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm opacity-90">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={(
                                  item.sellPerLb ??
                                  (item.costPerLb === costs.viking
                                    ? VIKING_SELL_PER_LB
                                    : item.costPerLb === costs.hiace
                                      ? HIACE_SELL_PER_LB
                                      : item.costPerLb *
                                        STANDARD_SELL_MULTIPLIER)
                                ).toFixed(2)}
                                onChange={(e) =>
                                  updateItem(
                                    item.id,
                                    "sellPerLb",
                                    +e.target.value,
                                  )
                                }
                                className="w-full text-right bg-transparent border-none outline-none font-mono text-sm opacity-90 focus:bg-zinc-800/50 focus:outline-none focus:ring-0 rounded px-1 accent-zinc-300"
                              />
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold text-emerald-400 text-sm group-hover:text-emerald-300">
                              {totals.totalWeight.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold text-amber-400 group-hover:text-amber-300">
                              $
                              {totals.totalCost.toLocaleString("en-US", {
                                maximumFractionDigits: 2,
                              })}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold text-violet-400 group-hover:text-violet-300">
                              $
                              {totals.estSell.toLocaleString("en-US", {
                                maximumFractionDigits: 2,
                              })}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold text-cyan-400 group-hover:text-cyan-300">
                              $
                              {(totals.estSell - totals.totalCost).toLocaleString(
                                "en-US",
                                { maximumFractionDigits: 2 },
                              )}
                            </TableCell>
                            <TableCell>
                              <button
                                onClick={() => removeFromTape(item.id)}
                                className="group-hover:opacity-100 opacity-70 p-2 -ml-2 rounded-xl hover:bg-red-500/20 hover:text-red-300 transition-all duration-200 flex items-center justify-center hover:scale-110"
                                title="Delete from tape"
                              >
                                <Trash2 size={18} strokeWidth={2} />
                              </button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {sortedTapeItems.length > 0 && (
                  <div className="mt-6 rounded-2xl border border-zinc-800/80 bg-zinc-950/30 p-6">
                    <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                      Tape summary
                    </h3>
                    <div className="grid grid-cols-1 gap-8 text-right md:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <div className="text-xl text-zinc-400 mb-2">
                          Total Weight
                        </div>
                        <div className="text-5xl font-mono font-bold bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600 bg-clip-text text-transparent shadow-2xl">
                          {formattedGrandWeight} lbs
                        </div>
                      </div>
                      <div>
                        <div className="text-xl text-zinc-400 mb-2">
                          Total Cost
                        </div>
                        <div className="text-5xl font-mono font-bold bg-gradient-to-r from-amber-400 via-yellow-500 to-orange-500 bg-clip-text text-transparent shadow-2xl tracking-tight">
                          {formattedGrandCost}
                        </div>
                      </div>
                      <div>
                        <div className="text-xl text-zinc-400 mb-2">
                          Sell Price
                        </div>
                        <div className="text-5xl font-mono font-bold bg-gradient-to-r from-violet-400 via-purple-500 to-pink-500 bg-clip-text text-transparent shadow-2xl tracking-tight">
                          {formattedGrandEstSell}
                        </div>
                      </div>
                      <div>
                        <div className="text-xl text-zinc-400 mb-2">
                          Margin
                        </div>
                        <div className="text-5xl font-mono font-bold bg-gradient-to-r from-cyan-400 via-teal-500 to-emerald-600 bg-clip-text text-transparent shadow-2xl tracking-tight">
                          {formattedGrandMargin}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {sortedTapeItems.length > 0 && (
                  <div className="mt-6 flex justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setIsExportModalOpen(true)}
                      className="gap-2"
                    >
                      <Download className="size-4" aria-hidden />
                      Export tape
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-zinc-800/80 bg-zinc-900/95 p-6 shadow-2xl">
            <h3 className="mb-5 text-lg font-semibold text-white">Export tape</h3>
            <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-1">
              <button
                type="button"
                onClick={() => setExportMethod("download")}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${exportMethod === "download"
                  ? "bg-blue-600 text-white shadow-sm ring-1 ring-blue-500/30"
                  : "text-zinc-400 hover:bg-zinc-800/80 hover:text-white"
                  }`}
              >
                <HardDriveDownload className="size-4 shrink-0" aria-hidden />
                Download
              </button>
              <button
                type="button"
                onClick={() => setExportMethod("onedrive")}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${exportMethod === "onedrive"
                  ? "bg-blue-600 text-white shadow-sm ring-1 ring-blue-500/30"
                  : "text-zinc-400 hover:bg-zinc-800/80 hover:text-white"
                  }`}
              >
                <CloudUpload className="size-4 shrink-0" aria-hidden />
                Job / OneDrive
              </button>
            </div>
            {exportMethod === "download" ? (
              <div className="mb-6">
                <p className="text-zinc-400 mb-4 text-sm">
                  Download as tab-separated .txt file for easy import.
                </p>
              </div>
            ) : (
              <div className="mb-6">
                <label className="block text-zinc-300 font-medium mb-3">
                  Select Job
                </label>
                <select
                  value={selectedJob}
                  onChange={(e) => setSelectedJob(e.target.value)}
                  disabled={projectsLoading}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950/50 px-4 py-3 text-base text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {projectsLoading ? (
                    <option>Loading projects...</option>
                  ) : projects.length === 0 ? (
                    <option>No active projects available</option>
                  ) : (
                    projects.map((project) => (
                      <option
                        key={project.project_number}
                        value={project.project_number}
                      >
                        {project.project_number} - {project.project_name} (
                        {project.customer})
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}
            {exportError && (
              <p className="text-red-400 text-sm mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl animate-pulse">
                {exportError}
              </p>
            )}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setIsExportModalOpen(false);
                  setSelectedJob("");
                  setExportError("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={handleExport}
                disabled={
                  sortedTapeItems.length === 0 ||
                  isExporting ||
                  (exportMethod === "onedrive" && !selectedJob)
                }
              >
                {isExporting
                  ? "Exporting…"
                  : exportMethod === "download"
                    ? "Download"
                    : "Upload to OneDrive"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
