/** Project detail: P&L, costs, edit and save to Supabase. */
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { useParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { Save, X } from "lucide-react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { QuickLinksBar } from "@/components/dashboard/quick-links-bar";
import { Button } from "@/components/ui/button";
import { ProjectBasicsFields } from "@/components/projects/project-basics-fields";
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
import { supabase as supabaseMetrics } from "@/lib/supabaseClient";

const QUOTED_FIELDS = [
  "total_quoted",
  "materials_quoted",
  "labor_quoted",
  "engineering_quoted",
  "equipment_quoted",
  "logistics_quoted",
  "taxes_quoted",
] as const;

const REALIZED_COST_FIELDS = [
  "material_cost",
  "labor_cost",
  "engineering_cost",
  "equipment_cost",
  "logistics_cost",
  "additional_costs",
] as const;

function quotedLabel(field: string): string {
  return field.replace(/_/g, " ");
}

const detailFieldClass =
  "w-full rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/30";
const detailFieldMono = `${detailFieldClass} font-mono tabular-nums`;

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
        setProject(data as ProjectRow);
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

  const pl = project
    ? (project.invoiced_amount || 0) -
      ((project.material_cost || 0) +
        (project.labor_cost || 0) +
        (project.engineering_cost || 0) +
        (project.equipment_cost || 0) +
        (project.logistics_cost || 0) +
        (project.additional_costs || 0))
    : 0;

  const plMargin =
    project && (project.invoiced_amount || 0) > 0
      ? Math.round((pl / (project.invoiced_amount || 0)) * 100)
      : 0;

  const totalQuoted = project?.total_quoted || 0;
  const totalQuotedCosts = project
    ? (project.materials_quoted || 0) +
      (project.labor_quoted || 0) +
      (project.engineering_quoted || 0) +
      (project.equipment_quoted || 0) +
      (project.logistics_quoted || 0) +
      (project.taxes_quoted || 0)
    : 0;

  const estimatedPl = project ? totalQuoted - totalQuotedCosts : 0;
  const estimatedMarginPct =
    project && totalQuoted > 0
      ? Math.round((estimatedPl / totalQuoted) * 100)
      : 0;

  const handleSave = async () => {
    if (!project) return;
    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);
    const normalized = normalizeProjectLifecycle(project);
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
          <div className="mx-auto mt-10 max-w-5xl">
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

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="space-y-6">
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
              <div className="border-t border-zinc-800 pt-6 mt-2">
                <h3 className="text-sm font-medium text-zinc-400 mb-4">
                  Milestones (date/time, optional)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {OPS_MILESTONE_FIELDS.map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-xs text-zinc-500 block mb-1">
                        {label}
                      </label>
                      <input
                        type="datetime-local"
                        value={isoToDatetimeLocal(project[key])}
                        onChange={(e) =>
                          updateField(key, datetimeLocalToIso(e.target.value))
                        }
                        className={detailFieldClass}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 space-y-8">
          <h2 className="text-xl font-semibold">
            Live P&amp;L (updates instantly)
          </h2>

          <div className="grid grid-cols-2 gap-6 text-lg">
            <div className="bg-zinc-950 rounded-2xl p-6 border border-zinc-700">
              <div className="text-zinc-500 text-sm">INVOICED AMOUNT</div>
              <input
                type="number"
                value={project.invoiced_amount || 0}
                onChange={(e) =>
                  updateField(
                    "invoiced_amount",
                    parseFloat(e.target.value) || 0,
                  )
                }
                className="w-full bg-transparent text-4xl font-mono font-bold mt-2 focus:outline-none"
              />
            </div>
            <div className="bg-zinc-950 rounded-2xl p-6 border border-zinc-700">
              <div className="text-zinc-500 text-sm">TOTAL COSTS</div>
              <div className="text-4xl font-mono font-bold mt-2 text-red-400">
                $
                {(
                  (project.material_cost || 0) +
                  (project.labor_cost || 0) +
                  (project.engineering_cost || 0) +
                  (project.equipment_cost || 0) +
                  (project.logistics_cost || 0) +
                  (project.additional_costs || 0)
                ).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="bg-emerald-950 border border-emerald-800 rounded-3xl p-8">
            <div className="text-emerald-400 text-sm font-medium">
              Realized P&amp;L
            </div>
            <div className="text-6xl font-mono font-bold mt-2 text-emerald-300">
              ${pl.toLocaleString()}
            </div>
            <div className="text-emerald-400 text-2xl mt-1">
              {plMargin}% MARGIN
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            {REALIZED_COST_FIELDS.map((field) => (
              <div key={field}>
                <label className="text-zinc-500 block mb-1 capitalize">
                  {quotedLabel(field)}
                </label>
                <input
                  type="number"
                  value={project[field] ?? 0}
                  onChange={(e) =>
                    updateField(field, parseFloat(e.target.value) || 0)
                  }
                  className={detailFieldMono}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 bg-zinc-900 border border-zinc-800 rounded-3xl p-8 space-y-8">
        <h2 className="text-xl font-semibold">Quote &amp; estimate (live)</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div className="bg-zinc-950 rounded-2xl p-5 border border-zinc-700 lg:col-span-2">
            <div className="text-zinc-500 text-sm">TOTAL QUOTED</div>
            <input
              type="number"
              value={project.total_quoted ?? 0}
              onChange={(e) =>
                updateField("total_quoted", parseFloat(e.target.value) || 0)
              }
              className="w-full bg-transparent text-3xl font-mono font-bold mt-2 focus:outline-none"
            />
          </div>
          <div className="bg-zinc-950 rounded-2xl p-5 border border-zinc-700 lg:col-span-2">
            <div className="text-zinc-500 text-sm">TOTAL QUOTED COSTS</div>
            <div className="text-3xl font-mono font-bold mt-2 text-zinc-200">
              ${totalQuotedCosts.toLocaleString()}
            </div>
          </div>
        </div>
        <div className="bg-sky-950 border border-sky-800 rounded-3xl p-8">
          <div className="text-sky-400 text-sm font-medium">
            Estimated P&amp;L (quoted − quoted costs)
          </div>
          <div className="text-5xl font-mono font-bold mt-2 text-sky-200">
            ${estimatedPl.toLocaleString()}
          </div>
          <div className="text-sky-400 text-xl mt-1">
            {estimatedMarginPct}% MARGIN ON QUOTE
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          {QUOTED_FIELDS.filter((f) => f !== "total_quoted").map((field) => (
            <div key={field}>
              <label className="text-zinc-500 block mb-1 capitalize">
                {quotedLabel(field)}
              </label>
              <input
                type="number"
                value={project[field] ?? 0}
                onChange={(e) =>
                  updateField(field, parseFloat(e.target.value) || 0)
                }
                className={detailFieldMono}
              />
            </div>
          ))}
        </div>
      </div>

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
        )}
      </div>
    </div>
  );
}
