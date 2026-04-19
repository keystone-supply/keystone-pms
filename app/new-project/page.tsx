/** New project form; saves to Supabase and creates OneDrive folder structure via lib/onedrive. */
"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { supabase } from "@/lib/supabaseClient";
import { createProjectFolders } from "@/lib/onedrive";
import { nextSequentialJobNumber } from "@/lib/projectNumber";
import { useRouter, useSearchParams } from "next/navigation";
import { Save, X } from "lucide-react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { QuickLinksBar } from "@/components/dashboard/quick-links-bar";
import { Button } from "@/components/ui/button";
import { ProjectBasicsFields } from "@/components/projects/project-basics-fields";
import type { ProjectBasicsField } from "@/lib/projectTypes";
import { safeReturnToPath } from "@/lib/safeReturnTo";
import {
  aggregateDashboardMetrics,
  type DashboardProjectRow,
} from "@/lib/dashboardMetrics";
import { withProjectSelectFallback } from "@/lib/projectQueries";
import { canCreateProjects, normalizeAppRole } from "@/lib/auth/roles";

function NewProjectForm({
  newCustomerReturnTo,
}: {
  newCustomerReturnTo: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState({
    customer: "",
    customer_id: null as string | null,
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
    setSubmitError(null);
    setLoading(true);
    try {
      const newProject = {
        project_number: nextJob,
        customer: form.customer.toUpperCase(),
        customer_id: form.customer_id,
        project_name: form.project_name.toUpperCase(),
        customer_po: form.customer_po,
        supply_industrial: form.supply_industrial,
        customer_approval: "PENDING",
        sales_command_stage: "rfq_customer",
        project_complete: false,
        project_status: "in_process",
        payment_received: false,
        files_phase1_enabled: true,
        material_cost: null,
        labor_cost: null,
        engineering_cost: null,
        equipment_cost: null,
        logistics_cost: null,
        additional_costs: null,
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

      router.push(`/projects/${saved.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setSubmitError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      {submitError ? (
        <div
          className="mb-6 flex items-start justify-between gap-3 rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          role="alert"
        >
          <p>
            <span className="font-semibold text-red-100">Could not create job.</span>{" "}
            {submitError}
          </p>
          <button
            type="button"
            onClick={() => setSubmitError(null)}
            className="shrink-0 rounded-lg p-1 text-red-300 hover:bg-red-500/20 hover:text-white"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}
      <form
        onSubmit={handleSubmit}
        className="space-y-8 rounded-3xl border border-zinc-800 bg-zinc-900 p-10"
      >
        <div>
          <label className="mb-2 block text-xs text-zinc-500">
            PROJECT # (auto)
          </label>
          <div className="font-mono text-5xl font-bold text-emerald-400">
            {nextJob}
          </div>
        </div>
        <ProjectBasicsFields
          mode="create"
          value={form}
          onChange={setBasics}
          createLinkedCustomerId={form.customer_id}
          onCreateLinkedCustomerIdChange={(id) =>
            setForm((f) => ({ ...f, customer_id: id }))
          }
          newCustomerReturnTo={newCustomerReturnTo}
        />
        <Button
          type="submit"
          disabled={loading}
          size="lg"
          className="h-auto w-full gap-3 py-5 text-xl"
        >
          <Save className="size-6" />
          {loading ? "Creating…" : "Create Job + Folders"}
        </Button>
      </form>
    </div>
  );
}

function NewProjectWithReturnTo() {
  const searchParams = useSearchParams();
  const backHref = safeReturnToPath(searchParams.get("returnTo"));
  const rawReturn = searchParams.get("returnTo");
  const newProjectHref =
    rawReturn != null && rawReturn !== ""
      ? `/new-project?returnTo=${encodeURIComponent(rawReturn)}`
      : "/new-project";
  const newCustomerReturnTo =
    rawReturn != null && rawReturn !== ""
      ? `/new-project?returnTo=${encodeURIComponent(rawReturn)}`
      : "/new-project";

  const { data: session, status } = useSession();
  const role = normalizeAppRole(session?.role);
  const canCreate = canCreateProjects(role);
  const [openQuotesCount, setOpenQuotesCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchOpenQuotesCount = useCallback(async () => {
    const { data, error } = await withProjectSelectFallback((select) =>
      supabase.from("projects").select(select),
    );
    if (error || !data) return;
    setOpenQuotesCount(
      aggregateDashboardMetrics(data as DashboardProjectRow[]).openQuotes,
    );
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    void Promise.resolve().then(() => fetchOpenQuotesCount());
  }, [status, fetchOpenQuotesCount]);

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
        <p className="mb-6 text-lg text-zinc-300">Sign in to create a project.</p>
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

  if (!canCreate) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center text-zinc-400">
        <p className="mb-2 text-lg text-zinc-200">Create-project access required.</p>
        <p className="mb-6 text-sm text-zinc-500">
          Your role can view projects, but cannot create new ones.
        </p>
        <Button variant="outline" onClick={() => signOut({ callbackUrl: "/" })}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <DashboardHeader
          userName={session.user?.name}
          lastUpdated={lastUpdated}
          onSignOut={() => signOut({ callbackUrl: "/" })}
          title="New project"
          subtitle="Enter job identity here. Quotes, costs, and P&amp;L are filled in on the project page after the job is created."
          backHref={backHref}
          backLabel="Back"
        />

        <div className="mt-8">
          <QuickLinksBar
            openQuotesCount={openQuotesCount}
            newProjectHref={newProjectHref}
            role={role}
          />
        </div>

        <div className="mt-10">
          <NewProjectForm newCustomerReturnTo={newCustomerReturnTo} />
        </div>
      </div>
    </div>
  );
}

export default function NewProject() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
          Loading…
        </div>
      }
    >
      <NewProjectWithReturnTo />
    </Suspense>
  );
}
