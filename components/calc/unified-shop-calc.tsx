"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import {
  ArrowUp,
  Calculator,
  CloudUpload,
  Copy,
  Download,
  FunctionSquare,
  HardDriveDownload,
  ListOrdered,
  Pin,
  Plus,
  Ruler,
  Save,
  Scale,
  Sigma,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { QuickLinksBar } from "@/components/dashboard/quick-links-bar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteProjectTape,
  listProjectTapes,
  loadTapeFromProject,
  renameProjectTape,
  saveTapeToProject,
} from "@/lib/calcLines/calcLineStorage";
import type { ProjectCalcTapeRow } from "@/lib/calcLines/types";
import {
  aggregateDashboardMetrics,
  type DashboardProjectRow,
} from "@/lib/dashboardMetrics";
import { uploadTapeToDocs } from "@/lib/onedrive";
import { withProjectSelectFallback } from "@/lib/projectQueries";
import { useProjectWorkspaceOptional } from "@/lib/projectWorkspaceContext";
import { supabase } from "@/lib/supabaseClient";
import type { UnifiedTapeLine } from "@/lib/unifiedTapeTypes";
import {
  buildFullExport,
  unifiedExportHasContent,
} from "@/lib/unifiedTapeExport";
import {
  addSavedUnifiedTape,
  deleteSavedUnifiedTape,
  loadSavedUnifiedTapes,
  type SavedUnifiedTapeRecord,
  unifiedSavedTapeTitle,
} from "@/lib/unifiedTapeStorage";
import {
  getMaterialTapeLineSummaryRows,
} from "@/lib/weightCalculationText";
import {
  costs,
  HIACE_SELL_PER_LB,
  materialCostOptions,
  materialDensities,
  shapes,
  STANDARD_SELL_MULTIPLIER,
  VIKING_SELL_PER_LB,
} from "@/lib/weightCalcConfig";
import {
  getItemMaterialCostKey,
  getTapeItemTotals,
  shapeHasDim2,
} from "@/lib/weightCalcMath";
import { useUnifiedTape } from "@/lib/useUnifiedTape";
import type { CostKey, ShapeValue } from "@/lib/weightTapeTypes";

export function UnifiedShopCalc({
  allowOneDriveExport = true,
  layout = "page",
  projectId = null,
  projectNumber = null,
  projectName = null,
  customer = null,
}: {
  allowOneDriveExport?: boolean;
  layout?: "page" | "embedded";
  projectId?: string | null;
  projectNumber?: string | null;
  projectName?: string | null;
  customer?: string | null;
} = {}) {
  const { data: session, status } = useSession();
  const workspace = useProjectWorkspaceOptional();
  const usingProjectTapes = !!projectId;
  const attemptedProjectTapesInitRef = useRef(false);

  useEffect(() => {
    attemptedProjectTapesInitRef.current = false;
  }, [projectId]);

  const [openQuotesCount, setOpenQuotesCount] = useState(0);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [savedTapes, setSavedTapes] = useState<SavedUnifiedTapeRecord[]>([]);
  const [selectedSavedTapeId, setSelectedSavedTapeId] = useState<string>("");
  const [projectTapes, setProjectTapes] = useState<ProjectCalcTapeRow[]>([]);
  const [selectedProjectTapeId, setSelectedProjectTapeId] = useState<string>("");
  const [projectTapeName, setProjectTapeName] = useState("");
  const [projectTapeBusy, setProjectTapeBusy] = useState(false);
  const [projectTapeError, setProjectTapeError] = useState<string | null>(null);

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  /** When set, export modal uses these lines instead of the working tape (e.g. saved tape). */
  const [exportTargetLines, setExportTargetLines] = useState<
    UnifiedTapeLine[] | null
  >(null);
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
  const {
    addMathLine,
    clearTape,
    closeMaterialEdit,
    currentShape,
    dim1,
    dim2,
    editingMaterialContext,
    evals,
    formattedCost,
    formattedEstSell,
    formattedGrandCost,
    formattedGrandEstSell,
    formattedGrandMargin,
    formattedGrandWeight,
    formattedMargin,
    formattedWeight,
    formattedWeightKg,
    grandTotalMargin,
    insertLineAfter,
    lastNumericLine,
    lengthIn,
    lines,
    margin,
    materialEditLineId,
    materialCostOption,
    openMaterialEdit,
    quantity,
    removeLine,
    sendWeightToTape,
    setDim1,
    setDim2,
    setLengthIn,
    setLines,
    setMaterialCostOption,
    setMaterialEditLineId,
    setQuantity,
    setShape,
    shape,
    updateItemField,
    updateItemMaterialCost,
    updateMathExpr,
    weightLinesInOrder,
  } = useUnifiedTape();

  const fetchOpenQuotesCount = useCallback(async () => {
    const { data, error } = await withProjectSelectFallback((select) =>
      supabase.from("projects").select(select),
    );
    if (error || !data) return;
    setOpenQuotesCount(
      aggregateDashboardMetrics(data as DashboardProjectRow[]).openQuotes,
    );
  }, []);

  const fetchProjects = useCallback(async () => {
    setProjectsLoading(true);
    const { data, error } = await supabase
      .from("projects")
      .select("project_number, project_name, customer")
      .neq("sales_command_stage", "invoiced")
      .neq("sales_command_stage", "cancelled")
      .neq("sales_command_stage", "lost")
      .order("project_number", { ascending: false });
    if (error) console.error("Error fetching projects:", error);
    setProjects(data || []);
    setProjectsLoading(false);
  }, []);

  const refreshProjectTapes = useCallback(async () => {
    if (!projectId) return;
    try {
      const rows = await listProjectTapes(supabase, projectId);
      setProjectTapes(rows);
      setSelectedProjectTapeId((prev) => {
        if (rows.some((row) => row.id === prev)) return prev;
        return rows[0]?.id ?? "";
      });
      setProjectTapeError(null);
    } catch (err: unknown) {
      setProjectTapes([]);
      setSelectedProjectTapeId("");
      setProjectTapeError(
        err instanceof Error ? err.message : "Could not load project tapes.",
      );
    }
  }, [projectId]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (layout !== "page") return;
    fetchOpenQuotesCount();
  }, [fetchOpenQuotesCount, layout, status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (usingProjectTapes) {
      if (attemptedProjectTapesInitRef.current) return;
      attemptedProjectTapesInitRef.current = true;
      void refreshProjectTapes();
      return;
    }
    setSavedTapes(loadSavedUnifiedTapes());
  }, [refreshProjectTapes, status, usingProjectTapes]);

  useEffect(() => {
    if (usingProjectTapes) return;
    if (savedTapes.length === 0) {
      setSelectedSavedTapeId("");
      return;
    }
    setSelectedSavedTapeId((prev) =>
      savedTapes.some((t) => t.id === prev) ? prev : savedTapes[0]!.id,
    );
  }, [savedTapes, usingProjectTapes]);

  const selectedSavedTape = useMemo(
    () => savedTapes.find((t) => t.id === selectedSavedTapeId),
    [savedTapes, selectedSavedTapeId],
  );
  const selectedProjectTape = useMemo(
    () => projectTapes.find((t) => t.id === selectedProjectTapeId) ?? null,
    [projectTapes, selectedProjectTapeId],
  );

  const saveBrowserTape = useCallback(() => {
    setSavedTapes(addSavedUnifiedTape(lines));
    setCopyHint("Saved tape to this browser.");
    setTimeout(() => setCopyHint(null), 2500);
  }, [lines]);

  const removeSavedTape = useCallback((id: string) => {
    if (!window.confirm("Remove this saved tape from this browser?")) return;
    setSavedTapes(deleteSavedUnifiedTape(id));
  }, []);

  const loadSavedTape = useCallback((record: SavedUnifiedTapeRecord) => {
    setLines(
      record.lines.map((l) =>
        l.kind === "math"
          ? { ...l, id: crypto.randomUUID() }
          : {
              ...l,
              id: crypto.randomUUID(),
              item: { ...l.item, id: crypto.randomUUID() },
            },
      ),
    );
    setMaterialEditLineId(null);
    setCopyHint("Loaded saved tape.");
    setTimeout(() => setCopyHint(null), 2500);
  }, [setLines, setMaterialEditLineId]);

  const saveProjectTape = useCallback(async () => {
    if (!projectId) return null;
    if (lines.length === 0) {
      setProjectTapeError("Add at least one line before saving.");
      return null;
    }
    setProjectTapeBusy(true);
    setProjectTapeError(null);
    try {
      const id = await saveTapeToProject(supabase, projectId, lines, projectTapeName);
      await refreshProjectTapes();
      setSelectedProjectTapeId(id);
      setCopyHint("Saved tape to this project.");
      setTimeout(() => setCopyHint(null), 2500);
      return id;
    } catch (err: unknown) {
      setProjectTapeError(
        err instanceof Error ? err.message : "Could not save project tape.",
      );
      return null;
    } finally {
      setProjectTapeBusy(false);
    }
  }, [lines, projectId, projectTapeName, refreshProjectTapes]);

  const loadSelectedProjectTape = useCallback(async () => {
    if (!selectedProjectTapeId) return;
    setProjectTapeBusy(true);
    setProjectTapeError(null);
    try {
      const loaded = await loadTapeFromProject(supabase, selectedProjectTapeId);
      setLines(loaded.lines);
      setMaterialEditLineId(null);
      setCopyHint("Loaded project tape.");
      setTimeout(() => setCopyHint(null), 2500);
    } catch (err: unknown) {
      setProjectTapeError(
        err instanceof Error ? err.message : "Could not load project tape.",
      );
    } finally {
      setProjectTapeBusy(false);
    }
  }, [selectedProjectTapeId, setLines, setMaterialEditLineId]);

  const renameSelectedProjectTape = useCallback(async () => {
    if (!selectedProjectTape) return;
    const nextName = window.prompt("Rename tape", selectedProjectTape.name ?? "");
    if (!nextName) return;
    setProjectTapeBusy(true);
    setProjectTapeError(null);
    try {
      await renameProjectTape(supabase, selectedProjectTape.id, nextName);
      await refreshProjectTapes();
    } catch (err: unknown) {
      setProjectTapeError(
        err instanceof Error ? err.message : "Could not rename project tape.",
      );
    } finally {
      setProjectTapeBusy(false);
    }
  }, [refreshProjectTapes, selectedProjectTape]);

  const deleteSelectedProjectTape = useCallback(async () => {
    if (!selectedProjectTape) return;
    if (!window.confirm("Delete this project tape?")) return;
    setProjectTapeBusy(true);
    setProjectTapeError(null);
    try {
      await deleteProjectTape(supabase, selectedProjectTape.id);
      await refreshProjectTapes();
    } catch (err: unknown) {
      setProjectTapeError(
        err instanceof Error ? err.message : "Could not delete project tape.",
      );
    } finally {
      setProjectTapeBusy(false);
    }
  }, [refreshProjectTapes, selectedProjectTape]);

  const copyResults = useCallback(async () => {
    const text = buildFullExport(lines);
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint("Copied full tape export to clipboard.");
      setTimeout(() => setCopyHint(null), 2500);
    } catch {
      setCopyHint("Could not copy — try again or copy manually.");
      setTimeout(() => setCopyHint(null), 2500);
    }
  }, [lines]);

  const handleExport = useCallback(async () => {
    const toExport = exportTargetLines ?? lines;
    setExportError("");
    setIsExporting(true);
    if (!unifiedExportHasContent(toExport)) {
      setExportError(
        exportTargetLines
          ? "This saved tape has no material or math lines to export."
          : "Add at least one math or material line to export.",
      );
      setIsExporting(false);
      return;
    }
    if (
      allowOneDriveExport &&
      exportMethod === "onedrive" &&
      !usingProjectTapes &&
      !selectedJob
    ) {
      setExportError("Please select a job.");
      setIsExporting(false);
      return;
    }
    if (
      allowOneDriveExport &&
      exportMethod === "onedrive" &&
      usingProjectTapes &&
      (!projectNumber || !projectName || !customer)
    ) {
      setExportError("Project name, number, and customer are required.");
      setIsExporting(false);
      return;
    }
    const content = buildFullExport(toExport);
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const uploadJobNumber = usingProjectTapes ? projectNumber : selectedJob;
    const filename =
      exportMethod === "download"
        ? `Tape_Export_${timestamp}.txt`
        : `Tape_Export_${uploadJobNumber}_${timestamp}.txt`;
    if (!allowOneDriveExport || exportMethod === "download") {
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
      setExportTargetLines(null);
      return;
    }
    try {
      const freshSessionRes = await fetch("/api/auth/session");
      const freshSession = await freshSessionRes.json();
      const freshToken = freshSession?.accessToken;
      if (!freshToken) {
        throw new Error("No access token. Please sign out and sign back in.");
      }
      const selectedProject = usingProjectTapes
        ? {
            project_number: projectNumber,
            project_name: projectName,
            customer,
          }
        : projects.find((p) => p.project_number === selectedJob);
      if (!selectedProject?.project_number || !selectedProject.project_name || !selectedProject.customer) {
        throw new Error("Selected project not found in list");
      }
      await uploadTapeToDocs(
        freshToken,
        selectedProject.customer,
        selectedProject.project_number,
        selectedProject.project_name,
        filename,
        content,
      );
      alert(`✅ Uploaded to ${selectedJob}/${selectedJob}-DOCS/${filename}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      console.error("❌ Upload error:", err);
      setExportError(`Upload failed: ${message}`);
    } finally {
      setIsExporting(false);
      setIsExportModalOpen(false);
      setExportTargetLines(null);
      setSelectedJob("");
    }
  }, [
    lines,
    exportTargetLines,
    exportMethod,
    selectedJob,
    projects,
    allowOneDriveExport,
    customer,
    projectName,
    projectNumber,
    usingProjectTapes,
  ]);

  useEffect(() => {
    if (isExportModalOpen) {
      if (allowOneDriveExport && !usingProjectTapes) {
        void fetchProjects();
      }
      setSelectedJob("");
      setExportMethod("download");
    }
  }, [isExportModalOpen, fetchProjects, allowOneDriveExport, usingProjectTapes]);

  useEffect(() => {
    if (!materialEditLineId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMaterialEditLineId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [materialEditLineId, setMaterialEditLineId]);

  if (status === "loading") {
    return (
      <div
        className={
          layout === "page"
            ? "flex h-screen items-center justify-center bg-zinc-950 text-white"
            : "flex min-h-[320px] items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-900 p-6 text-white"
        }
      >
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <div
        className={
          layout === "page"
            ? "flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center text-zinc-400"
            : "flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-900 px-6 py-10 text-center text-zinc-400"
        }
      >
        <p className="mb-6 text-lg text-zinc-300">
          Sign in to use the shop calculator.
        </p>
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

  return (
    <div className={layout === "page" ? "min-h-screen bg-zinc-950 text-white" : "text-white"}>
      <div
        className={
          layout === "page"
            ? "mx-auto max-w-[92.4rem] px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
            : "rounded-3xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6"
        }
      >
        {layout === "page" ? (
          <>
            <DashboardHeader
              userName={session?.user?.name}
              lastUpdated={null}
              onSignOut={() => signOut({ callbackUrl: "/" })}
              title="Shop calculator"
              subtitle="Material weight and cost, math tape, one export — saved tapes stay in this browser."
              showLastUpdated={false}
            />

            <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200/90">
              Working lines reset on refresh unless you save a copy (Saved tapes).
              Material lines show sell total as the result; <code className="font-mono text-amber-100/95">ans</code> and{" "}
              <code className="font-mono text-amber-100/95">@N</code> use that line&apos;s sell ($) on material rows.{" "}
              <span className="font-mono text-amber-100/95">Enter</span> on a math row adds the next line.
            </div>

            <div className="mt-8">
              <QuickLinksBar
                openQuotesCount={openQuotesCount}
                activeHref="/weight-calc"
                newProjectHref="/new-project?returnTo=%2Fweight-calc"
              />
            </div>
          </>
        ) : (
          <div className="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200/90">
            Tapes save to this project. Use Save &amp; use in RFQ/Quote/PO to jump to documents and import lines.
          </div>
        )}

        <section
          aria-label="Calculator snapshot"
          className={`${layout === "page" ? "mt-8" : "mt-2"} grid gap-4 sm:grid-cols-2 xl:grid-cols-4`}
        >
          <KpiCard
            label="Lines"
            value={lines.length}
            hint="Math + material rows"
            icon={ListOrdered}
          />
          <KpiCard
            label="Last result"
            value={lastNumericLine?.display ?? "—"}
            hint={
              lastNumericLine
                ? `Line ${lastNumericLine.index}`
                : "Evaluate to see a value"
            }
            icon={Sigma}
          />
          <KpiCard
            label="Material weight"
            value={
              weightLinesInOrder.length === 0
                ? "—"
                : `${formattedGrandWeight} lbs`
            }
            hint="Sum of material lines in order"
            icon={Scale}
          />
          <KpiCard
            label="Math errors"
            value={evals.filter((e) => e.error).length}
            hint="Expression lines that failed"
            icon={Calculator}
          />
        </section>

        <div className={`${layout === "page" ? "mt-8" : "mt-5"} grid grid-cols-1 gap-6 lg:grid-cols-3`}>
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={addMathLine}>
                <Plus className="mr-1 size-4" aria-hidden />
                Math line
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={clearTape}>
                <Trash2 className="mr-1 size-4" aria-hidden />
                Clear tape
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  usingProjectTapes ? void saveProjectTape() : saveBrowserTape()
                }
                disabled={projectTapeBusy}
              >
                <Save className="mr-1 size-4" aria-hidden />
                {usingProjectTapes ? "Save to project" : "Save tape"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void copyResults()}
              >
                <Copy className="mr-1 size-4" aria-hidden />
                Copy export
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setExportTargetLines(null);
                  setIsExportModalOpen(true);
                }}
                disabled={!unifiedExportHasContent(lines)}
                className="gap-1"
              >
                <Download className="size-4" aria-hidden />
                Export
              </Button>
              {workspace && usingProjectTapes ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={projectTapeBusy}
                    onClick={async () => {
                      const id = await saveProjectTape();
                      if (!id) return;
                      workspace.notifyTapeSaved(id);
                      workspace.focus("docs", { docKind: "rfq" });
                    }}
                  >
                    Save &amp; use in RFQ
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={projectTapeBusy}
                    onClick={async () => {
                      const id = await saveProjectTape();
                      if (!id) return;
                      workspace.notifyTapeSaved(id);
                      workspace.focus("docs", { docKind: "quote" });
                    }}
                  >
                    Save &amp; use in Quote
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={projectTapeBusy}
                    onClick={async () => {
                      const id = await saveProjectTape();
                      if (!id) return;
                      workspace.notifyTapeSaved(id);
                      workspace.focus("docs", { docKind: "purchase_order" });
                    }}
                  >
                    Save &amp; use in PO
                  </Button>
                </>
              ) : null}
              {copyHint ? (
                <span className="text-xs text-zinc-400">{copyHint}</span>
              ) : null}
            </div>
            {projectTapeError ? (
              <p className="text-sm text-red-300">{projectTapeError}</p>
            ) : null}

            <div className="overflow-x-auto rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-xl">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="w-10 text-zinc-500">#</TableHead>
                    <TableHead className="w-24 text-zinc-300">Type</TableHead>
                    <TableHead className="min-w-[14rem] text-zinc-300">
                      Line
                    </TableHead>
                    <TableHead className="w-[min(40%,280px)] text-zinc-300">
                      Result
                    </TableHead>
                    <TableHead className="w-12 text-right text-zinc-500">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, index) => {
                    const e = evals[index];
                    if (line.kind === "math") {
                      return (
                        <TableRow
                          key={line.id}
                          className="border-zinc-800/80 hover:bg-zinc-900/60"
                        >
                          <TableCell className="align-middle font-mono text-xs text-zinc-500">
                            {index + 1}
                          </TableCell>
                          <TableCell className="align-middle">
                            <span className="rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-200">
                              Math
                            </span>
                          </TableCell>
                          <TableCell className="align-middle py-2">
                            <label htmlFor={`expr-${line.id}`} className="sr-only">
                              Expression line {index + 1}
                            </label>
                            <input
                              id={`expr-${line.id}`}
                              type="text"
                              autoComplete="off"
                              spellCheck={false}
                              value={line.expr}
                              onChange={(ev) =>
                                updateMathExpr(line.id, ev.target.value)
                              }
                              onKeyDown={(ev) => {
                                if (ev.key !== "Enter" || ev.shiftKey) return;
                                ev.preventDefault();
                                insertLineAfter(line.id);
                              }}
                              className="w-full min-w-[12rem] rounded-lg border border-zinc-700/80 bg-zinc-950/80 px-3 py-2 font-mono text-sm text-zinc-100 outline-none ring-blue-500/40 placeholder:text-zinc-600 focus:border-blue-500/50 focus:ring-2"
                              placeholder="e.g. sqrt(16) or x = 3 * 12"
                            />
                          </TableCell>
                          <TableCell className="align-middle">
                            {e?.error ? (
                              <span className="text-sm text-red-400" title={e.error}>
                                {e.error}
                              </span>
                            ) : (
                              <span className="font-mono text-sm text-emerald-200/95">
                                {e?.display ?? ""}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="align-middle text-right">
                            <div className="flex justify-end gap-1">
                              {workspace && e?.display && !e.error ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    workspace.pinCalcValue({
                                      id: `${line.id}-${index}`,
                                      label: `Line ${index + 1}`,
                                      value: e.display,
                                    })
                                  }
                                >
                                  <Pin className="mr-1 size-3.5" />
                                  Pin
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                                onClick={() => removeLine(line.id)}
                                aria-label={`Remove line ${index + 1}`}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    }

                    const totals = getTapeItemTotals(line.item);
                    const summaryRows = getMaterialTapeLineSummaryRows(line.item);
                    return (
                      <TableRow
                        key={line.id}
                        className="border-zinc-800/80 hover:bg-zinc-900/60"
                      >
                        <TableCell className="align-top font-mono text-xs text-zinc-500">
                          {index + 1}
                        </TableCell>
                        <TableCell className="align-top">
                          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-200">
                            Material
                          </span>
                        </TableCell>
                        <TableCell className="align-top py-2">
                          <button
                            type="button"
                            onClick={() => openMaterialEdit(line.id)}
                            className="mb-1 text-left text-xs font-medium text-zinc-400 hover:text-zinc-200"
                          >
                            Edit row
                          </button>
                          <div className="space-y-1 text-left font-mono text-xs leading-relaxed text-zinc-300">
                            <div>{summaryRows.typeShape}</div>
                            <div>{summaryRows.sizeQty}</div>
                          </div>
                        </TableCell>
                        <TableCell className="align-top font-mono text-sm text-violet-200/95">
                          {totals.estSell.toLocaleString("en-US", {
                            style: "currency",
                            currency: "USD",
                          })}
                        </TableCell>
                        <TableCell className="align-top text-right">
                          <div className="flex justify-end gap-1">
                            {workspace && e?.display && !e.error ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  workspace.pinCalcValue({
                                    id: `${line.id}-${index}`,
                                    label: `Line ${index + 1}`,
                                    value: e.display,
                                  })
                                }
                              >
                                <Pin className="mr-1 size-3.5" />
                                Pin
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                              onClick={() => removeLine(line.id)}
                              aria-label={`Remove material line ${index + 1}`}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {weightLinesInOrder.length > 0 ? (
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 shadow-sm sm:p-4">
                <div className="mb-2.5 flex items-center gap-2 border-b border-zinc-800/70 pb-2">
                  <Scale
                    className="size-3.5 shrink-0 text-zinc-600 sm:size-4"
                    aria-hidden
                  />
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 sm:text-xs">
                    Material summary · line order
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4">
                  <div className="relative min-w-0 overflow-hidden rounded-lg border border-zinc-800/60 bg-zinc-950/50 px-2 py-2 sm:px-2.5 sm:py-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[11px]">
                      Total weight
                    </p>
                    <div className="mt-0.5 min-w-0 overflow-x-auto">
                      <p className="whitespace-nowrap font-mono text-sm font-semibold tabular-nums tracking-tight text-emerald-300/95 sm:text-base">
                        {formattedGrandWeight} lbs
                      </p>
                    </div>
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-500/25 to-transparent"
                      aria-hidden
                    />
                  </div>
                  <div className="relative min-w-0 overflow-hidden rounded-lg border border-zinc-800/60 bg-zinc-950/50 px-2 py-2 sm:px-2.5 sm:py-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[11px]">
                      Total cost
                    </p>
                    <div className="mt-0.5 min-w-0 overflow-x-auto">
                      <p className="whitespace-nowrap font-mono text-sm font-semibold tabular-nums tracking-tight text-amber-200/95 sm:text-base">
                        {formattedGrandCost}
                      </p>
                    </div>
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-500/25 to-transparent"
                      aria-hidden
                    />
                  </div>
                  <div className="relative min-w-0 overflow-hidden rounded-lg border border-zinc-800/60 bg-zinc-950/50 px-2 py-2 sm:px-2.5 sm:py-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[11px]">
                      Sell
                    </p>
                    <div className="mt-0.5 min-w-0 overflow-x-auto">
                      <p className="whitespace-nowrap font-mono text-sm font-semibold tabular-nums tracking-tight text-violet-200/95 sm:text-base">
                        {formattedGrandEstSell}
                      </p>
                    </div>
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-violet-500/25 to-transparent"
                      aria-hidden
                    />
                  </div>
                  <div className="relative min-w-0 overflow-hidden rounded-lg border border-zinc-800/60 bg-zinc-950/50 px-2 py-2 sm:px-2.5 sm:py-2.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[11px]">
                      Margin
                    </p>
                    <div className="mt-0.5 min-w-0 overflow-x-auto">
                      <p
                        className={`whitespace-nowrap font-mono text-sm font-semibold tabular-nums tracking-tight sm:text-base ${
                          grandTotalMargin < 0
                            ? "text-red-400"
                            : "text-cyan-200/95"
                        }`}
                      >
                        {formattedGrandMargin}
                      </p>
                    </div>
                    <div
                      className={
                        grandTotalMargin < 0
                          ? "pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-red-500/30 to-transparent"
                          : "pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-500/25 to-transparent"
                      }
                      aria-hidden
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <p className="text-xs text-zinc-500">
              Math examples: <code className="text-zinc-400">sin(pi/2)</code>,{" "}
              <code className="text-zinc-400">381 mm to inch</code>,{" "}
              <code className="text-zinc-400">sqrt(ans)</code>,{" "}
              <code className="text-zinc-400">#note 2+2</code>,{" "}
              <code className="text-zinc-400">@1*3</code>. See{" "}
              <span className="font-mono">mathjs.org</span> for functions.
            </p>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/40 p-5 text-sm text-zinc-200 shadow-xl">
              <h2 className="text-base font-semibold text-zinc-100">
                {usingProjectTapes ? "Project tapes" : "Saved tapes"}
              </h2>
              {usingProjectTapes ? (
                <>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                    These tapes are stored with this project and available across devices.
                  </p>
                  <label
                    htmlFor="project-tape-name"
                    className="mt-4 block text-xs font-medium text-zinc-500"
                  >
                    Tape name (optional)
                  </label>
                  <input
                    id="project-tape-name"
                    value={projectTapeName}
                    onChange={(e) => setProjectTapeName(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 font-mono text-xs text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Tape name"
                  />
                  <label
                    htmlFor="project-tape-select"
                    className="mt-4 block text-xs font-medium text-zinc-500"
                  >
                    Choose a project tape
                  </label>
                  <select
                    id="project-tape-select"
                    value={selectedProjectTapeId}
                    onChange={(e) => setSelectedProjectTapeId(e.target.value)}
                    disabled={projectTapes.length === 0}
                    className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 font-mono text-xs text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {projectTapes.length === 0 ? (
                      <option value="">No project tapes yet</option>
                    ) : (
                      projectTapes.map((tape) => (
                        <option key={tape.id} value={tape.id}>
                          {tape.name}
                        </option>
                      ))
                    )}
                  </select>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!selectedProjectTapeId || projectTapeBusy}
                      onClick={() => void loadSelectedProjectTape()}
                    >
                      Load
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!selectedProjectTape || projectTapeBusy}
                      onClick={() => void renameSelectedProjectTape()}
                    >
                      Rename
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1 text-red-300 hover:bg-red-950/50 hover:text-red-200"
                      disabled={!selectedProjectTape || projectTapeBusy}
                      onClick={() => void deleteSelectedProjectTape()}
                    >
                      <Trash2 className="size-4" aria-hidden />
                      Delete
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                    Stored in this browser only. Older saved tapes from the previous
                    calculator URL may appear here once automatically.
                  </p>
                  <label
                    htmlFor="saved-tape-select"
                    className="mt-4 block text-xs font-medium text-zinc-500"
                  >
                    Choose a saved tape
                  </label>
                  <select
                    id="saved-tape-select"
                    value={selectedSavedTapeId}
                    onChange={(e) => setSelectedSavedTapeId(e.target.value)}
                    disabled={savedTapes.length === 0}
                    className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 font-mono text-xs text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savedTapes.length === 0 ? (
                      <option value="">No saved tapes — use &quot;Save tape&quot;</option>
                    ) : (
                      savedTapes.map((tape) => {
                        const title = unifiedSavedTapeTitle(tape.lines);
                        const label =
                          title.length > 80 ? `${title.slice(0, 77)}…` : title;
                        return (
                          <option key={tape.id} value={tape.id}>
                            {label}
                          </option>
                        );
                      })
                    )}
                  </select>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!selectedSavedTape}
                      onClick={() =>
                        selectedSavedTape && loadSavedTape(selectedSavedTape)
                      }
                    >
                      Load
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={
                        !selectedSavedTape ||
                        !unifiedExportHasContent(selectedSavedTape.lines)
                      }
                      onClick={() => {
                        if (!selectedSavedTape) return;
                        setExportTargetLines(selectedSavedTape.lines);
                        setIsExportModalOpen(true);
                      }}
                    >
                      <Download className="size-4" aria-hidden />
                      Export
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1 text-red-300 hover:bg-red-950/50 hover:text-red-200"
                      disabled={!selectedSavedTape}
                      onClick={() =>
                        selectedSavedTape &&
                        removeSavedTape(selectedSavedTape.id)
                      }
                    >
                      <Trash2 className="size-4" aria-hidden />
                      Delete
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 text-xs text-zinc-500">
              <p className="flex items-center gap-2 font-medium text-zinc-400">
                <FunctionSquare className="size-4 text-zinc-500" />
                Mode: math.js + shop materials
              </p>
            </div>
          </aside>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 shadow-sm sm:p-4">
            <div className="mb-3 flex flex-col gap-2.5 border-b border-zinc-800/70 pb-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Scale
                  className="size-3.5 shrink-0 text-zinc-600 sm:size-4"
                  aria-hidden
                />
                <h2 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 sm:text-xs">
                  Material &amp; shape
                </h2>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={sendWeightToTape}
                className="gap-1.5 shrink-0 self-start sm:self-auto"
              >
                <ArrowUp className="size-3.5 sm:size-4" aria-hidden />
                Add material line
              </Button>
            </div>
            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[11px]">
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
                        className={`min-w-[8.5rem] max-w-full rounded-lg border px-2.5 py-2 text-left transition-colors sm:min-w-[9.5rem] sm:px-3 sm:py-2.5 ${
                          isSelected
                            ? "border-blue-500/45 bg-blue-500/10 text-blue-100 ring-1 ring-blue-500/25"
                            : "border-zinc-800/60 bg-zinc-950/50 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900/70 hover:text-zinc-100"
                        }`}
                      >
                        <span className="block text-sm font-medium leading-snug">
                          {opt.label} — ${sellPerLb.toFixed(2)}/lb
                        </span>
                        <span
                          className={`mt-0.5 block text-[11px] leading-snug ${
                            isSelected ? "text-blue-200/60" : "text-zinc-500"
                          }`}
                        >
                          Cost ${costVal.toFixed(2)}/lb · {mat.density.toFixed(3)}{" "}
                          lb/in³
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="mb-2 block text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[11px]">
                  Shape
                </label>
                <div className="flex flex-wrap gap-2">
                  {shapes.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setShape(s.value)}
                      className={`rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors sm:px-3 sm:py-2 sm:text-sm ${
                        shape === s.value
                          ? "border-blue-500/45 bg-blue-500/10 text-blue-100 ring-1 ring-blue-500/25"
                          : "border-zinc-800/60 bg-zinc-950/50 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900/70 hover:text-zinc-100"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 shadow-sm sm:p-4">
            <div className="mb-3 flex items-center gap-2 border-b border-zinc-800/70 pb-2.5">
              <Ruler
                className="size-3.5 shrink-0 text-zinc-600 sm:size-4"
                aria-hidden
              />
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 sm:text-xs">
                Dimensions
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3 md:gap-3.5">
              <div>
                <label
                  htmlFor="preview-qty"
                  className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[11px]"
                >
                  Qty
                </label>
                <input
                  id="preview-qty"
                  type="number"
                  step="1"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(+e.target.value || 1)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 font-mono text-sm tabular-nums text-white outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <div>
                <label
                  htmlFor="preview-length"
                  className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[11px]"
                >
                  Length (in)
                </label>
                <input
                  id="preview-length"
                  type="number"
                  step="any"
                  min="0"
                  value={lengthIn}
                  onChange={(e) => setLengthIn(+e.target.value || 0)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 font-mono text-sm tabular-nums text-white outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <div>
                <label
                  htmlFor="preview-dim1"
                  className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[11px]"
                >
                  {currentShape?.dimLabel1 ?? "Dimension 1 (in)"}
                </label>
                <input
                  id="preview-dim1"
                  type="number"
                  step="0.001"
                  min="0"
                  value={dim1}
                  onChange={(e) => setDim1(+e.target.value || 0)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 font-mono text-sm tabular-nums text-white outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              {currentShape?.hasDim2 && (
                <div>
                  <label
                    htmlFor="preview-dim2"
                    className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[11px]"
                  >
                    {currentShape.dimLabel2!}
                  </label>
                  <input
                    id="preview-dim2"
                    type="number"
                    step="0.001"
                    min="0"
                    value={dim2}
                    onChange={(e) => setDim2(+e.target.value || 0)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2.5 font-mono text-sm tabular-nums text-white outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/40"
                  />
                </div>
              )}
            </div>
            <div className="mt-5 border-t border-zinc-800/70 pt-3 sm:pt-3.5">
              <div className="mb-2.5 flex items-center gap-2 border-b border-zinc-800/70 pb-2">
                <Sigma
                  className="size-3.5 shrink-0 text-zinc-600 sm:size-4"
                  aria-hidden
                />
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 sm:text-xs">
                  Preview · weight &amp; budget
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4">
                <div className="relative min-w-0 overflow-hidden rounded-lg border border-zinc-800/60 bg-zinc-950/50 px-2 py-2 sm:px-2.5 sm:py-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[11px]">
                    Weight (lbs)
                  </p>
                  <div className="mt-0.5 min-w-0 overflow-x-auto">
                    <p className="whitespace-nowrap font-mono text-sm font-semibold tabular-nums tracking-tight text-emerald-300/95 sm:text-base">
                      {formattedWeight}
                    </p>
                  </div>
                  <p className="mt-1 truncate font-mono text-[10px] tabular-nums text-zinc-500 sm:text-xs">
                    {formattedWeightKg} kg
                  </p>
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-500/25 to-transparent"
                    aria-hidden
                  />
                </div>
                <div className="relative min-w-0 overflow-hidden rounded-lg border border-zinc-800/60 bg-zinc-950/50 px-2 py-2 sm:px-2.5 sm:py-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[11px]">
                    Cost
                  </p>
                  <div className="mt-0.5 min-w-0 overflow-x-auto">
                    <p className="whitespace-nowrap font-mono text-sm font-semibold tabular-nums tracking-tight text-amber-200/95 sm:text-base">
                      {formattedCost}
                    </p>
                  </div>
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-500/25 to-transparent"
                    aria-hidden
                  />
                </div>
                <div className="relative min-w-0 overflow-hidden rounded-lg border border-zinc-800/60 bg-zinc-950/50 px-2 py-2 sm:px-2.5 sm:py-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[11px]">
                    Sell
                  </p>
                  <div className="mt-0.5 min-w-0 overflow-x-auto">
                    <p className="whitespace-nowrap font-mono text-sm font-semibold tabular-nums tracking-tight text-violet-200/95 sm:text-base">
                      {formattedEstSell}
                    </p>
                  </div>
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-violet-500/25 to-transparent"
                    aria-hidden
                  />
                </div>
                <div className="relative min-w-0 overflow-hidden rounded-lg border border-zinc-800/60 bg-zinc-950/50 px-2 py-2 sm:px-2.5 sm:py-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[11px]">
                    Margin
                  </p>
                  <div className="mt-0.5 min-w-0 overflow-x-auto">
                    <p
                      className={`whitespace-nowrap font-mono text-sm font-semibold tabular-nums tracking-tight sm:text-base ${
                        margin < 0 ? "text-red-400" : "text-cyan-200/95"
                      }`}
                    >
                      {formattedMargin}
                    </p>
                  </div>
                  <div
                    className={
                      margin < 0
                        ? "pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-red-500/30 to-transparent"
                        : "pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-500/25 to-transparent"
                    }
                    aria-hidden
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {(() => {
        const ctx = editingMaterialContext;
        if (!ctx) return null;
        const { line, lineNumber } = ctx;
        const item = line.item;
        const lineId = line.id;
        const ctl =
          "mt-1.5 w-full min-h-11 rounded-lg border border-zinc-600 bg-zinc-950/80 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/40";
        const ctlMono = `${ctl} font-mono`;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            role="presentation"
            onClick={closeMaterialEdit}
          >
            <div
              className="max-h-[min(90vh,880px)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-zinc-800/80 bg-zinc-900/95 p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="material-edit-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h3
                id="material-edit-title"
                className="mb-6 text-lg font-semibold text-white"
              >
                Edit material line {lineNumber}
              </h3>
              <div className="space-y-6">
                <div>
                  <label
                    htmlFor={`mat-notes-${lineId}`}
                    className="text-sm font-medium text-zinc-400"
                  >
                    Notes
                  </label>
                  <input
                    id={`mat-notes-${lineId}`}
                    type="text"
                    value={item.notes}
                    onChange={(ev) =>
                      updateItemField(lineId, "notes", ev.target.value)
                    }
                    className={ctl}
                  />
                </div>
                <div>
                  <label
                    htmlFor={`mat-material-${lineId}`}
                    className="text-sm font-medium text-zinc-400"
                  >
                    Material
                  </label>
                  <select
                    id={`mat-material-${lineId}`}
                    value={getItemMaterialCostKey(item)}
                    onChange={(ev) =>
                      updateItemMaterialCost(lineId, ev.target.value as CostKey)
                    }
                    className={ctl}
                  >
                    {materialCostOptions.map((opt) => (
                      <option key={opt.costKey} value={opt.costKey}>
                        {opt.label} — ${costs[opt.costKey].toFixed(2)}/lb
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                  <div>
                    <label
                      htmlFor={`mat-shape-${lineId}`}
                      className="text-sm font-medium text-zinc-400"
                    >
                      Shape
                    </label>
                    <select
                      id={`mat-shape-${lineId}`}
                      value={item.shape}
                      onChange={(ev) =>
                        updateItemField(
                          lineId,
                          "shape",
                          ev.target.value as ShapeValue,
                        )
                      }
                      className={ctl}
                    >
                      {shapes.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor={`mat-len-${lineId}`}
                      className="text-sm font-medium text-zinc-400"
                    >
                      Len (in)
                    </label>
                    <input
                      id={`mat-len-${lineId}`}
                      type="number"
                      value={item.lengthIn}
                      onChange={(ev) =>
                        updateItemField(
                          lineId,
                          "lengthIn",
                          +ev.target.value || 0,
                        )
                      }
                      className={ctlMono}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`mat-d1-${lineId}`}
                      className="text-sm font-medium text-zinc-400"
                    >
                      D1
                    </label>
                    <input
                      id={`mat-d1-${lineId}`}
                      type="number"
                      value={item.dim1}
                      onChange={(ev) =>
                        updateItemField(lineId, "dim1", +ev.target.value || 0)
                      }
                      className={ctlMono}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`mat-d2-${lineId}`}
                      className="text-sm font-medium text-zinc-400"
                    >
                      D2
                    </label>
                    {shapeHasDim2(item.shape) ? (
                      <input
                        id={`mat-d2-${lineId}`}
                        type="number"
                        value={item.dim2}
                        onChange={(ev) =>
                          updateItemField(
                            lineId,
                            "dim2",
                            +ev.target.value || 0,
                          )
                        }
                        className={ctlMono}
                      />
                    ) : (
                      <div className="mt-1.5 flex min-h-11 items-center rounded-lg border border-zinc-700/50 bg-zinc-950/40 px-3 font-mono text-sm text-zinc-500">
                        —
                      </div>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor={`mat-qty-${lineId}`}
                      className="text-sm font-medium text-zinc-400"
                    >
                      Qty
                    </label>
                    <input
                      id={`mat-qty-${lineId}`}
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(ev) =>
                        updateItemField(
                          lineId,
                          "quantity",
                          +ev.target.value || 1,
                        )
                      }
                      className={ctlMono}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor={`mat-cost-${lineId}`}
                      className="text-sm font-medium text-zinc-400"
                    >
                      Cost/lb
                    </label>
                    <input
                      id={`mat-cost-${lineId}`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.costPerLb}
                      onChange={(ev) =>
                        updateItemField(lineId, "costPerLb", +ev.target.value)
                      }
                      className={ctlMono}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`mat-sell-${lineId}`}
                      className="text-sm font-medium text-zinc-400"
                    >
                      Sell/lb
                    </label>
                    <input
                      id={`mat-sell-${lineId}`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={(
                        item.sellPerLb ??
                        (item.costPerLb === costs.viking
                          ? VIKING_SELL_PER_LB
                          : item.costPerLb === costs.hiace
                            ? HIACE_SELL_PER_LB
                            : item.costPerLb * STANDARD_SELL_MULTIPLIER)
                      ).toFixed(2)}
                      onChange={(ev) =>
                        updateItemField(lineId, "sellPerLb", +ev.target.value)
                      }
                      className={ctlMono}
                    />
                  </div>
                </div>
              </div>
              <div className="mt-8 flex gap-3 border-t border-zinc-800/80 pt-6">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={closeMaterialEdit}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  onClick={closeMaterialEdit}
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-zinc-800/80 bg-zinc-900/95 p-6 shadow-2xl">
            <h3 className="mb-5 text-lg font-semibold text-white">
              {exportTargetLines ? "Export saved tape" : "Export tape"}
            </h3>
            <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-1">
              <button
                type="button"
                onClick={() => setExportMethod("download")}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  exportMethod === "download"
                    ? "bg-blue-600 text-white shadow-sm ring-1 ring-blue-500/30"
                    : "text-zinc-400 hover:bg-zinc-800/80 hover:text-white"
                }`}
              >
                <HardDriveDownload className="size-4 shrink-0" aria-hidden />
                Download
              </button>
              {allowOneDriveExport ? (
                <button
                  type="button"
                  onClick={() => setExportMethod("onedrive")}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    exportMethod === "onedrive"
                      ? "bg-blue-600 text-white shadow-sm ring-1 ring-blue-500/30"
                      : "text-zinc-400 hover:bg-zinc-800/80 hover:text-white"
                  }`}
                >
                  <CloudUpload className="size-4 shrink-0" aria-hidden />
                  Job / OneDrive
                </button>
              ) : null}
            </div>
            {!allowOneDriveExport || exportMethod === "download" ? (
              <p className="mb-6 text-sm text-zinc-400">
                Material block (TSV) and math block in one .txt file.
              </p>
            ) : usingProjectTapes ? (
              <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-300">
                Upload target: {projectNumber ?? "PROJECT"} — {projectName ?? "Untitled"} (
                {customer ?? "No customer"})
              </div>
            ) : (
              <div className="mb-6">
                <label className="mb-3 block font-medium text-zinc-300">
                  Select job
                </label>
                <select
                  value={selectedJob}
                  onChange={(e) => setSelectedJob(e.target.value)}
                  disabled={projectsLoading}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950/50 px-4 py-3 text-base text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {projectsLoading ? (
                    <option>Loading projects…</option>
                  ) : projects.length === 0 ? (
                    <option>No active projects</option>
                  ) : (
                    projects.map((project) => (
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
              </div>
            )}
            {exportError ? (
              <p className="mt-2 animate-pulse rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                {exportError}
              </p>
            ) : null}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setIsExportModalOpen(false);
                  setExportTargetLines(null);
                  setSelectedJob("");
                  setExportError("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={() => void handleExport()}
                disabled={
                  !unifiedExportHasContent(exportTargetLines ?? lines) ||
                  isExporting ||
                  (allowOneDriveExport &&
                    exportMethod === "onedrive" &&
                    !usingProjectTapes &&
                    !selectedJob)
                }
              >
                {isExporting
                  ? "Exporting…"
                  : !allowOneDriveExport || exportMethod === "download"
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
