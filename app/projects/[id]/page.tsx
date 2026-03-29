/** Project detail: P&L, costs, edit and save to Supabase. */
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { useParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { ChevronDown, ChevronRight, Save, X } from "lucide-react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { QuickLinksBar } from "@/components/dashboard/quick-links-bar";
import { Button } from "@/components/ui/button";
import { ProjectBasicsFields } from "@/components/projects/project-basics-fields";
import { ProjectDocumentsSection } from "@/components/projects/project-documents-section";
import {
  ProjectActualsFinancialsPanel,
  ProjectQuoteFinancialsPanel,
} from "@/components/projects/project-financials-panel";
import type { ProjectBasicsField, ProjectRow } from "@/lib/projectTypes";
import {
  normalizeProjectLifecycle,
  pickProjectUpdatePayload,
} from "@/lib/projectTypes";
import {
  aggregateDashboardMetrics,
  type DashboardProjectRow,
} from "@/lib/dashboardMetrics";
import { PROJECT_SELECT } from "@/lib/projectQueries";
import {
  syncActualLaborCost,
  syncQuoteDerivations,
} from "@/lib/projectFinancials";
import { supabase as supabaseMetrics } from "@/lib/supabaseClient";

const detailFieldClass =
  "w-full rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (iso == null || iso === "") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(local: string): string | null {
  if (!local || local.trim() === "") return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const OPS_MILESTONE_FIELDS: {
  key:
    | "rfq_vendors_sent_at"
    | "quote_sent_at"
    | "po_issued_at"
    | "in_process_at"
    | "materials_ordered_at"
    | "material_received_at"
    | "labor_completed_at"
    | "completed_at"
    | "delivered_at"
    | "invoiced_at";
  label: string;
}[] = [
  { key: "rfq_vendors_sent_at", label: "RFQ → vendors sent" },
  { key: "quote_sent_at", label: "Quote sent" },
  { key: "po_issued_at", label: "Customer PO" },
  { key: "in_process_at", label: "In process (shop)" },
  { key: "materials_ordered_at", label: "Materials ordered" },
  { key: "material_received_at", label: "Material received" },
  { key: "labor_completed_at", label: "Labor complete" },
  { key: "completed_at", label: "Complete (sales board)" },
  { key: "delivered_at", label: "Delivered" },
  { key: "invoiced_at", label: "Invoiced" },
];

export default function ProjectDetail() {
  const params = useParams();
  const id = params.id as string;

  const { data: session, status: sessionStatus } = useSession();

  const [project, setProject] = useState<ProjectRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openQuotesCount, setOpenQuotesCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [milestonesOpen, setMilestonesOpen] = useState(false);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = useMemo(
    () => createClient(supabaseUrl, supabaseAnonKey),
    [supabaseUrl, supabaseAnonKey],
  );

  const fetchProject = useCallback(
    async (mode: "full" | "soft" = "full") => {
      if (mode === "full") setLoading(true);
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error(error);
        setProject(null);
        setLastUpdated(null);
      } else {
        const row = data as ProjectRow;
        setProject({
          ...row,
          ...syncQuoteDerivations(row),
          ...syncActualLaborCost(row),
        });
        setLastUpdated(new Date());
      }
      if (mode === "full") setLoading(false);
    },
    [id, supabase],
  );

  const fetchOpenQuotesCount = useCallback(async () => {
    const { data, error } = await supabaseMetrics
      .from("projects")
      .select(PROJECT_SELECT);
    if (error || !data) return;
    setOpenQuotesCount(
      aggregateDashboardMetrics(data as DashboardProjectRow[]).openQuotes,
    );
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => fetchProject("full"));
  }, [fetchProject]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    void Promise.resolve().then(() => fetchOpenQuotesCount());
  }, [sessionStatus, fetchOpenQuotesCount]);

  const applyFinancialPatch = useCallback((patch: Partial<ProjectRow>) => {
    setProject((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...patch };
      return {
        ...next,
        ...syncQuoteDerivations(next),
        ...syncActualLaborCost(next),
      };
    });
  }, []);

  const handleSave = async () => {
    if (!project) return;
    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);
    const synced = {
      ...project,
      ...syncQuoteDerivations(project),
      ...syncActualLaborCost(project),
    };
    const normalized = normalizeProjectLifecycle(synced);
    const payload = pickProjectUpdatePayload(normalized);
    const { error } = await supabase
      .from("projects")
      .update(payload)
      .eq("id", id);
    if (!error) {
      setProject(normalized);
      setSaveMessage(
        "Saved — realtime update sent to all connected sessions.",
      );
      setLastUpdated(new Date());
      void fetchProject("soft");
    } else {
      setSaveError(error.message ?? "Could not save changes.");
    }
    setSaving(false);
  };

  const updateField = <K extends keyof ProjectRow>(
    field: K,
    value: ProjectRow[K],
  ) => {
    setProject((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  const onBasicsChange = (field: ProjectBasicsField, value: string) => {
    if (field === "customer" || field === "project_name") {
      updateField(field, value.toUpperCase());
      return;
    }
    updateField(field, value);
  };

  if (sessionStatus === "loading") {
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
          Sign in to view this project.
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

  const newProjectHref = `/new-project?returnTo=${encodeURIComponent(`/projects/${id}`)}`;

  const headerTitle =
    loading || !project
      ? "Project"
      : `${project.project_number} — ${project.project_name?.toUpperCase() ?? ""}`;

  const headerSubtitle = loading
    ? "Loading job details…"
    : !project
      ? "This job could not be found or you may not have access."
      : "P&L, quote lines, and job status — edits save to Supabase.";

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <DashboardHeader
          userName={session.user?.name}
          lastUpdated={lastUpdated}
          onSignOut={() => signOut({ callbackUrl: "/" })}
          title={headerTitle}
          subtitle={headerSubtitle}
          backHref="/projects"
          backLabel="All projects"
          showLastUpdated={!!project && !loading}
        />

        <div className="mt-8">
          <QuickLinksBar
            openQuotesCount={openQuotesCount}
            activeHref="/projects"
            newProjectHref={newProjectHref}
          />
        </div>

        {loading ? (
          <div className="mt-16 text-center text-lg text-zinc-400">
            Loading project details…
          </div>
        ) : !project ? (
          <div className="mt-16 text-center text-lg text-zinc-400">
            Project not found
          </div>
        ) : (
          <div className="mx-auto mt-10 max-w-7xl">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end">
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="gap-2 self-start sm:self-auto"
              >
                <Save className="size-4" />
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>

            {saveMessage ? (
              <div
                className="mb-6 flex items-start justify-between gap-3 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
                role="status"
              >
                <p>{saveMessage}</p>
                <button
                  type="button"
                  onClick={() => setSaveMessage(null)}
                  className="shrink-0 rounded-lg p-1 text-emerald-300 hover:bg-emerald-500/20 hover:text-white"
                  aria-label="Dismiss"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : null}
            {saveError ? (
              <div
                className="mb-6 flex items-start justify-between gap-3 rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200"
                role="alert"
              >
                <p>
                  <span className="font-semibold text-red-100">
                    Save failed.
                  </span>{" "}
                  {saveError}
                </p>
                <button
                  type="button"
                  onClick={() => setSaveError(null)}
                  className="shrink-0 rounded-lg p-1 text-red-300 hover:bg-red-500/20 hover:text-white"
                  aria-label="Dismiss"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : null}

      <div className="space-y-8">
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8">
            <h2 className="text-xl font-semibold mb-6">Project Info</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">
                  PROJECT #
                </label>
                <div className="font-mono text-2xl font-semibold text-emerald-400/90 tracking-tight">
                  {project.project_number}
                </div>
              </div>
              <ProjectBasicsFields
                mode="edit"
                value={{
                  customer: project.customer,
                  project_name: project.project_name,
                  customer_po: project.customer_po,
                  supply_industrial: project.supply_industrial,
                }}
                onChange={onBasicsChange}
              />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">
                    APPROVAL
                  </label>
                  <select
                    value={project.customer_approval || "PENDING"}
                    onChange={(e) =>
                      updateField("customer_approval", e.target.value)
                    }
                    className={detailFieldClass}
                  >
                    <option value="PENDING">PENDING</option>
                    <option value="ACCEPTED">ACCEPTED</option>
                    <option value="REJECTED">REJECTED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">
                    PROJECT STATUS
                  </label>
                  <select
                    value={project.project_status || ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateField(
                        "project_status",
                        v === ""
                          ? null
                          : (v as NonNullable<ProjectRow["project_status"]>),
                      );
                    }}
                    className={detailFieldClass}
                  >
                    <option value="">—</option>
                    <option value="in_process">IN PROCESS</option>
                    <option value="done">DONE</option>
                    <option value="cancelled">CANCELLED</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!project.project_complete}
                  onChange={(e) =>
                    updateField("project_complete", e.target.checked)
                  }
                  className="size-4 rounded border-zinc-600 bg-zinc-900 text-blue-500 focus:ring-2 focus:ring-blue-500/40"
                />
                <span className="text-sm text-zinc-300">Project complete</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!project.payment_received}
                  onChange={(e) =>
                    updateField("payment_received", e.target.checked)
                  }
                  className="size-4 rounded border-zinc-600 bg-zinc-900 text-blue-500 focus:ring-2 focus:ring-blue-500/40"
                />
                <span className="text-sm text-zinc-300">Payment received</span>
              </label>
              <p className="text-xs text-zinc-500">
                Saving sets <strong className="text-zinc-400">complete</strong>{" "}
                to match status: Done → complete, Cancelled → not complete.
              </p>
              <div className="mt-6 rounded-2xl border border-zinc-800/50 bg-zinc-950/30 p-4">
                <button
                  type="button"
                  onClick={() => setMilestonesOpen((o) => !o)}
                  className="flex w-full items-center gap-1.5 text-left text-xs font-medium text-zinc-400 hover:text-zinc-200"
                  aria-expanded={milestonesOpen}
                  id="project-milestones-toggle"
                >
                  {milestonesOpen ? (
                    <ChevronDown className="size-4 shrink-0 text-zinc-500" />
                  ) : (
                    <ChevronRight className="size-4 shrink-0 text-zinc-500" />
                  )}
                  Milestones (date/time, optional)
                </button>
                {milestonesOpen ? (
                  <div
                    className="mt-4 space-y-4 text-sm"
                    role="region"
                    aria-labelledby="project-milestones-toggle"
                  >
                    <p className="text-[11px] leading-snug text-zinc-500">
                      Optional ops timestamps for this job. Hidden until you
                      expand this section.
                    </p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {OPS_MILESTONE_FIELDS.map(({ key, label }) => (
                        <div key={key}>
                          <label className="mb-1 block text-xs text-zinc-500">
                            {label}
                          </label>
                          <input
                            type="datetime-local"
                            value={isoToDatetimeLocal(project[key])}
                            onChange={(e) =>
                              updateField(
                                key,
                                datetimeLocalToIso(e.target.value),
                              )
                            }
                            className={detailFieldClass}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
          <ProjectQuoteFinancialsPanel
            project={project}
            applyFinancialPatch={applyFinancialPatch}
          />
          <ProjectActualsFinancialsPanel
            project={project}
            applyFinancialPatch={applyFinancialPatch}
          />
        </div>
      </div>

            <div className="mt-8">
            <ProjectDocumentsSection
              projectId={id}
              project={project}
              supabase={supabase}
              onProjectRefresh={() => void fetchProject("soft")}
              onApplyQuoteFinancialsSnapshot={applyFinancialPatch}
            />

            <div className="mt-12 text-center">
              <a
                href={`https://onedrive.live.com/?id=ROOT&cid=...&folder=Documents%2F0%20PROJECT%20FOLDERS%2F${project.customer}%2F${project.project_number}%20-%20${project.project_name}`}
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:underline"
              >
                Open this job’s folder in OneDrive (Documents/0 PROJECT FOLDERS)
              </a>
            </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
