"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { UnifiedShopCalc } from "@/components/calc/unified-shop-calc";
import { supabase } from "@/lib/supabaseClient";

type ProjectPickerRow = {
  id: string;
  project_number: string | null;
  project_name: string | null;
};

export default function WeightCalcPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectPickerRow[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("projects")
      .select("id,project_number,project_name")
      .neq("sales_command_stage", "invoiced")
      .neq("sales_command_stage", "cancelled")
      .neq("sales_command_stage", "lost")
      .order("project_number", { ascending: false })
      .then(({ data }) => {
        if (cancelled || !data) return;
        setProjects(data as ProjectPickerRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <section className="mx-auto mt-8 max-w-[132rem] rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-4 text-zinc-200 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <p className="text-sm text-zinc-300">
          For pricing and quote workflow, open this tape on a project. Standalone mode
          is a scratchpad and only supports local download export.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white sm:max-w-xl"
          >
            <option value="">Choose a project…</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.project_number ?? "JOB"} — {project.project_name ?? "Untitled"}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selectedProjectId}
            onClick={() => router.push(`/projects/${selectedProjectId}?tab=calc`)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Open project calc
          </button>
        </div>
      </section>

      <UnifiedShopCalc allowOneDriveExport={false} />
    </div>
  );
}
