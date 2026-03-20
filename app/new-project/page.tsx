/** New project form; saves to Supabase and creates OneDrive folder structure via lib/onedrive. */
"use client";

import { Suspense, useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { createProjectFolders } from "@/lib/onedrive";
import { nextSequentialJobNumber } from "@/lib/projectNumber";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";

import { ProjectBasicsFields } from "@/components/projects/project-basics-fields";
import type { ProjectBasicsField } from "@/lib/projectTypes";
import { safeReturnToPath } from "@/lib/safeReturnTo";

function NewProjectForm({ backHref }: { backHref: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    customer: "",
    project_name: "",
    customer_po: "",
    supply_industrial: "SUPPLY",
  });

  const [nextJob, setNextJob] = useState("");

  useEffect(() => {
    const getNextJob = async () => {
      const { data } = await supabase.from("projects").select("project_number");
      const nums = (data ?? []).map((r) => r.project_number);
      setNextJob(nextSequentialJobNumber(nums));
    };
    getNextJob();
  }, []);

  const setBasics = (field: ProjectBasicsField, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const newProject = {
        project_number: nextJob,
        customer: form.customer.toUpperCase(),
        project_name: form.project_name.toUpperCase(),
        customer_po: form.customer_po,
        supply_industrial: form.supply_industrial,
        customer_approval: "PENDING",
        project_complete: false,
        project_status: "in_process",
        material_cost: 0,
        labor_cost: 0,
        engineering_cost: 0,
        equipment_cost: 0,
        logistics_cost: 0,
        additional_costs: 0,
        invoiced_amount: 0,
      };
      const { data: saved, error } = await supabase
        .from("projects")
        .insert(newProject)
        .select()
        .single();
      if (error) throw error;

      const freshSessionRes = await fetch("/api/auth/session");
      const freshSession = await freshSessionRes.json();
      const freshToken = freshSession?.accessToken;
      console.log("Fresh token length:", freshToken?.length || 0);
      if (freshToken) {
        await createProjectFolders(
          freshToken,
          form.customer,
          nextJob,
          form.project_name,
        );
      } else {
        console.error("❌ No fresh token - re-login required");
      }

      alert(
        `✅ Job ${nextJob} created! Folders in Documents/0 PROJECT FOLDERS`,
      );
      router.push(`/projects/${saved.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      alert("Error: " + message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-10">
        <button
          type="button"
          onClick={() => router.push(backHref)}
          className="flex items-center gap-2 text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" /> Back
        </button>
        <h1 className="text-4xl font-bold tracking-tight">New Project</h1>
      </div>
      <p className="text-zinc-500 text-sm mb-6 -mt-4">
        Enter job identity here. Quotes, costs, and P&amp;L are filled in on the
        project page after the job is created.
      </p>
      <form
        onSubmit={handleSubmit}
        className="bg-zinc-900 border border-zinc-800 rounded-3xl p-10 space-y-8"
      >
        <div>
          <label className="text-xs text-zinc-500 block mb-2">
            PROJECT # (auto)
          </label>
          <div className="font-mono text-5xl font-bold text-emerald-400">
            {nextJob}
          </div>
        </div>
        <ProjectBasicsFields mode="create" value={form} onChange={setBasics} />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black hover:bg-zinc-800 text-white py-5 rounded-3xl font-medium text-xl flex items-center justify-center gap-3 disabled:opacity-50"
        >
          <Save className="w-6 h-6" />{" "}
          {loading ? "Creating..." : "Create Job + Folders"}
        </button>
      </form>
    </div>
  );
}

function NewProjectWithReturnTo() {
  const searchParams = useSearchParams();
  const backHref = safeReturnToPath(searchParams.get("returnTo"));
  return <NewProjectForm backHref={backHref} />;
}

export default function NewProject() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-zinc-400">
          Loading…
        </div>
      }
    >
      <NewProjectWithReturnTo />
    </Suspense>
  );
}
