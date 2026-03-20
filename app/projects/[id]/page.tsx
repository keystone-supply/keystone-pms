/** Project detail: P&L, costs, edit and save to Supabase. */
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";

import { ProjectBasicsFields } from "@/components/projects/project-basics-fields";
import type { ProjectBasicsField, ProjectRow } from "@/lib/projectTypes";
import {
  normalizeProjectLifecycle,
  pickProjectUpdatePayload,
} from "@/lib/projectTypes";

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

export default function ProjectDetail() {
  const params = useParams();
  const id = params.id as string;

  const [project, setProject] = useState<ProjectRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const fetchProject = async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();

    if (error) console.error(error);
    else setProject(data as ProjectRow);
    setLoading(false);
  };

  useEffect(() => {
    fetchProject();
  }, [id]);

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
    const normalized = normalizeProjectLifecycle(project);
    const payload = pickProjectUpdatePayload(normalized);
    const { error } = await supabase
      .from("projects")
      .update(payload)
      .eq("id", id);
    if (!error) {
      setProject(normalized);
      alert("✅ Saved – realtime update sent to all 4 users");
      fetchProject();
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

  if (loading)
    return (
      <div className="p-10 text-center text-xl">Loading project details…</div>
    );
  if (!project)
    return <div className="p-10 text-center text-xl">Project not found</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/projects"
          className="flex items-center gap-2 text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" /> Back to All Projects
        </Link>
        <h1 className="text-4xl font-bold tracking-tight flex-1">
          {project.project_number} – {project.project_name?.toUpperCase()}
        </h1>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-black text-white px-6 py-3 rounded-2xl font-medium hover:bg-zinc-800 disabled:opacity-50"
        >
          <Save className="w-5 h-5" /> {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3"
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
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3"
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
                  className="size-4 rounded border-zinc-600 bg-zinc-800"
                />
                <span className="text-sm text-zinc-300">Project complete</span>
              </label>
              <p className="text-xs text-zinc-500">
                Saving sets <strong className="text-zinc-400">complete</strong>{" "}
                to match status: Done → complete, Cancelled → not complete.
              </p>
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
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 font-mono"
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
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 font-mono"
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
  );
}
