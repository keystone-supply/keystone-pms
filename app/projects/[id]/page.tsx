"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { ChevronDown, Save, X } from "lucide-react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { QuickLinksBar } from "@/components/dashboard/quick-links-bar";
import { ProjectCalcPanel } from "@/components/projects/project-calc-panel";
import { ProjectDocumentsSection } from "@/components/projects/project-documents-section";
import { ProjectFilesPanel } from "@/components/projects/project-files-panel";
import {
  ProjectActualsFinancialsPanel,
  ProjectQuoteFinancialsPanel,
} from "@/components/projects/project-financials-panel";
import { ProjectOverviewPanel } from "@/components/projects/project-overview-panel";
import { ProjectToolsDock } from "@/components/projects/project-tools-dock";
import { ProjectWorkspaceTwoColumn } from "@/components/projects/project-workspace-two-column";
import { StatusAdvanceDialog } from "@/components/projects/status-advance-dialog";
import { Button } from "@/components/ui/button";
import { useProjectDetail } from "@/hooks/useProjectDetail";
import {
  canAccessSales,
  canEditProjects,
  canManageDocuments,
  canViewFinancials,
} from "@/lib/auth/roles";
import { getSessionCapabilitySet } from "@/lib/auth/session-capabilities";
import { type TickerStageId } from "@/lib/projectStatusTicker";
import { ProjectWorkspaceProvider, useProjectWorkspace } from "@/lib/projectWorkspaceContext";
import {
  mergeWorkspaceLayout,
  parseProjectWorkspaceLayout,
  writeProjectWorkspaceLayoutToSearch,
  type ProjectWorkspaceLayoutState,
} from "@/lib/projectWorkspaceLayout";
import { supabase } from "@/lib/supabaseClient";
import {
  shouldSkipUrlFileSelectionSync,
  type PendingFileUrlSync,
} from "@/lib/workspaceFileSelection";

const URL_FILE_SYNC_TIMEOUT_MS = 2_000;

function WorkspaceBody({
  searchState,
  setSearchState,
  id,
  roleAllowsDocEdits,
  canEditProject,
  canViewProjectFinancials,
  canAccessSalesRole,
  onBasicsChange,
  updateField,
  customersList,
  applyProjectPatch,
  onAdvanceStage,
}: {
  searchState: ProjectWorkspaceLayoutState;
  setSearchState: (next: ProjectWorkspaceLayoutState) => void;
  id: string;
  roleAllowsDocEdits: boolean;
  canEditProject: boolean;
  canViewProjectFinancials: boolean;
  canAccessSalesRole: boolean;
  onBasicsChange: ReturnType<typeof useProjectDetail>["onBasicsChange"];
  updateField: ReturnType<typeof useProjectDetail>["updateField"];
  customersList: ReturnType<typeof useProjectDetail>["customersList"];
  applyProjectPatch: ReturnType<typeof useProjectDetail>["applyProjectPatch"];
  onAdvanceStage: (stage: TickerStageId) => void;
}) {
  const workspace = useProjectWorkspace();
  const sequenceRef = useRef<string[]>([]);
  const pendingFileUrlSyncRef = useRef<PendingFileUrlSync | null>(null);
  const docsRef = useRef<HTMLDivElement | null>(null);
  const calcRef = useRef<HTMLDivElement | null>(null);
  const filesRef = useRef<HTMLDivElement | null>(null);
  const [documentsExpanded, setDocumentsExpanded] = useState(false);
  const [projectFinancialsExpanded, setProjectFinancialsExpanded] = useState(false);
  const [actualsExpanded, setActualsExpanded] = useState(false);
  const [filesExpanded, setFilesExpanded] = useState(false);

  useEffect(() => {
    if (workspace.focusTarget === "docs") {
      docsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (workspace.focusTarget === "calc") {
      calcRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (workspace.focusTarget === "files") {
      filesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [workspace.focusTarget]);

  useEffect(() => {
    const next = mergeWorkspaceLayout(searchState, {
      file: workspace.selectedFileId,
      kind: workspace.focusedDocKind,
    });
    if (next.file !== searchState.file || next.kind !== searchState.kind) {
      pendingFileUrlSyncRef.current = {
        file: next.file,
        expiresAtMs: Date.now() + URL_FILE_SYNC_TIMEOUT_MS,
      };
      setSearchState(next);
    }
  }, [searchState, setSearchState, workspace.focusedDocKind, workspace.selectedFileId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void workspace.savePatch({});
        return;
      }
      const key = event.key.toLowerCase();
      if (key !== "g" && key !== "f" && key !== "c" && key !== "d") return;
      sequenceRef.current = [...sequenceRef.current.slice(-1), key];
      const joined = sequenceRef.current.join(" ");
      if (joined === "g f") {
        workspace.focus("files");
        filesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (joined === "g c") {
        workspace.focus("calc");
        calcRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (joined === "g d") {
        workspace.focus("docs");
        docsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      window.setTimeout(() => {
        sequenceRef.current = [];
      }, 400);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [workspace]);

  useEffect(() => {
    const sync = shouldSkipUrlFileSelectionSync({
      pending: pendingFileUrlSyncRef.current,
      searchFile: searchState.file,
      nowMs: Date.now(),
    });
    pendingFileUrlSyncRef.current = sync.pending;
    if (sync.skip) return;
    if (!searchState.file) return;
    if (workspace.selectedFileId === searchState.file) return;
    workspace.selectFile(searchState.file);
  }, [searchState.file, workspace]);

  useEffect(() => {
    if (!searchState.kind) return;
    workspace.focus("docs", { docKind: searchState.kind });
    // intentionally only on external query-kind changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchState.kind]);

  useEffect(() => {
    if (workspace.focusTarget === "docs") {
      setDocumentsExpanded(true);
    }
  }, [workspace.focusTarget]);

  useEffect(() => {
    if (workspace.focusTarget === "files") {
      setFilesExpanded(true);
    }
  }, [workspace.focusTarget]);

  return (
    <ProjectWorkspaceTwoColumn
      leftTop={
        <ProjectOverviewPanel
          project={workspace.project}
          canEditProject={canEditProject}
          customersList={customersList}
          canAccessSales={canAccessSalesRole}
          onBasicsChange={onBasicsChange}
          updateField={updateField}
          onAdvanceStage={onAdvanceStage}
        />
      }
      leftMiddle={null}
      leftBottom={
        canViewProjectFinancials ? (
          <div className="grid grid-cols-1 items-start gap-6 2xl:grid-cols-2">
            <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
              <button
                type="button"
                onClick={() => setProjectFinancialsExpanded((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left transition hover:bg-zinc-800/60"
                aria-expanded={projectFinancialsExpanded}
                aria-controls="project-financials-panel"
              >
                <span className="text-sm font-semibold text-white">Project financials</span>
                <ChevronDown
                  className={`size-4 text-zinc-400 transition-transform ${projectFinancialsExpanded ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>

              {projectFinancialsExpanded ? (
                <div id="project-financials-panel" className="mt-3">
                  <ProjectQuoteFinancialsPanel
                    project={workspace.project}
                    applyFinancialPatch={applyProjectPatch}
                  />
                </div>
              ) : null}
            </section>

            <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
              <button
                type="button"
                onClick={() => setActualsExpanded((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left transition hover:bg-zinc-800/60"
                aria-expanded={actualsExpanded}
                aria-controls="project-actuals-panel"
              >
                <span className="text-sm font-semibold text-white">Actuals (P&L)</span>
                <ChevronDown
                  className={`size-4 text-zinc-400 transition-transform ${actualsExpanded ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>

              {actualsExpanded ? (
                <div id="project-actuals-panel" className="mt-3">
                  <ProjectActualsFinancialsPanel
                    project={workspace.project}
                    applyFinancialPatch={applyProjectPatch}
                  />
                </div>
              ) : null}
            </section>
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-400">
            Financial panels are hidden for your role.
          </div>
        )
      }
      rightTop={
        <div ref={docsRef}>
          <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
            <button
              type="button"
              onClick={() => setDocumentsExpanded((prev) => !prev)}
              className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left transition hover:bg-zinc-800/60"
              aria-expanded={documentsExpanded}
              aria-controls="project-documents-panel"
            >
              <span className="text-sm font-semibold text-white">Project documents</span>
              <ChevronDown
                className={`size-4 text-zinc-400 transition-transform ${documentsExpanded ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>

            {documentsExpanded ? (
              <div id="project-documents-panel" className="mt-3">
                <ProjectDocumentsSection
                  projectId={id}
                  project={workspace.project}
                  supabase={supabase}
                  onProjectRefresh={() => void workspace.refreshProject()}
                  onApplyQuoteFinancialsSnapshot={applyProjectPatch}
                  canManageDocuments={roleAllowsDocEdits}
                />
              </div>
            ) : null}
          </section>
        </div>
      }
      rightMiddle={
        <div ref={calcRef}>
          <ProjectCalcPanel
            projectId={id}
            customer={workspace.project.customer ?? null}
            projectName={workspace.project.project_name ?? null}
            projectNumber={workspace.project.project_number ?? null}
          />
        </div>
      }
      rightBottom={
        <>
          <div ref={filesRef}>
            <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
              <button
                type="button"
                onClick={() => setFilesExpanded((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left transition hover:bg-zinc-800/60"
                aria-expanded={filesExpanded}
                aria-controls="project-files-window"
              >
                <span className="text-sm font-semibold text-white">Project files</span>
                <ChevronDown
                  className={`size-4 text-zinc-400 transition-transform ${filesExpanded ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>

              {filesExpanded ? (
                <div id="project-files-window" className="mt-3">
                  {workspace.project.files_phase1_enabled !== false ? (
                    <ProjectFilesPanel projectId={id} />
                  ) : (
                    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
                      Project files are not enabled for this job yet.
                    </div>
                  )}
                </div>
              ) : null}
            </section>
          </div>
          <ProjectToolsDock
            customer={workspace.project.customer ?? null}
            projectNumber={workspace.project.project_number ?? null}
            projectName={workspace.project.project_name ?? null}
          />
        </>
      }
    />
  );
}

export default function ProjectDetail() {
  const params = useParams();
  const id = params.id as string;
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const searchState = useMemo(
    () => parseProjectWorkspaceLayout(new URLSearchParams(searchParamsString)),
    [searchParamsString],
  );
  const [advanceStage, setAdvanceStage] = useState<TickerStageId | null>(null);

  const { data: session, status: sessionStatus } = useSession();
  const capabilities = getSessionCapabilitySet(session);
  const canEditProject = canEditProjects(capabilities);
  const canViewProjectFinancials = canViewFinancials(capabilities);

  const {
    project,
    loading,
    saving,
    saveMessage,
    saveError,
    lastUpdated,
    openQuotesCount,
    customersList,
    refreshProject,
    applyProjectPatch,
    updateField,
    onBasicsChange,
    saveProject,
    saveProjectPatch,
    setSaveError,
    setSaveMessage,
  } = useProjectDetail(id, sessionStatus === "authenticated", canEditProject);

  useEffect(() => {
    if (
      !searchParams.get("tab") &&
      !searchParams.get("view") &&
      !searchParams.get("left") &&
      !searchParams.get("center") &&
      !searchParams.get("right")
    ) {
      return;
    }
    const nextParams = writeProjectWorkspaceLayoutToSearch(
      new URLSearchParams(searchParamsString),
      searchState,
    );
    if (nextParams.toString() === searchParamsString) return;
    router.replace(`${pathname}?${nextParams.toString()}`);
  }, [pathname, router, searchParams, searchParamsString, searchState]);

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
        <p className="mb-6 text-lg text-zinc-300">Sign in to view this project.</p>
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

  const newProjectHref = `/new-project?returnTo=${encodeURIComponent(`/projects/${id}`)}`;
  const headerTitle =
    loading || !project
      ? "Project"
      : `${project.project_number} — ${project.project_name?.toUpperCase() ?? ""}`;
  const headerSubtitle = loading
    ? "Loading job details…"
    : !project
      ? "This job could not be found or you may not have access."
      : "Project workspace with docs, calc, files, and financials.";

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-[1700px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <DashboardHeader
          userName={session.user?.name}
          lastUpdated={lastUpdated}
          onSignOut={() => signOut({ callbackUrl: "/" })}
          title={headerTitle}
          subtitle={headerSubtitle}
          showLastUpdated={!!project && !loading}
        />

        <div className="mt-8">
          <QuickLinksBar
            openQuotesCount={openQuotesCount}
            activeHref="/projects"
            newProjectHref={newProjectHref}
            capabilities={capabilities}
          />
        </div>

        {loading ? (
          <div className="mt-16 text-center text-lg text-zinc-400">
            Loading project details…
          </div>
        ) : !project ? (
          <div className="mt-16 text-center text-lg text-zinc-400">Project not found</div>
        ) : (
          <div className="mx-auto mt-10 max-w-[1700px]">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="outline" asChild>
                <Link href="/projects">All projects</Link>
              </Button>
              <Button
                type="button"
                onClick={() => void saveProject()}
                disabled={saving || !canEditProject}
                className="gap-2"
              >
                <Save className="size-4" />
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>

            {!canEditProject ? (
              <div className="mb-6 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                Your role has read-only access on this project.
              </div>
            ) : null}
            {saveMessage ? (
              <div className="mb-6 flex items-start justify-between gap-3 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
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
              <div className="mb-6 flex items-start justify-between gap-3 rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                <p>
                  <span className="font-semibold text-red-100">Save failed.</span> {saveError}
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

            <ProjectWorkspaceProvider
              projectId={id}
              project={project}
              applyPatch={applyProjectPatch}
              savePatch={saveProjectPatch}
              refreshProject={refreshProject}
            >
              <WorkspaceBody
                searchState={searchState}
                setSearchState={(next) => {
                  const urlParams = writeProjectWorkspaceLayoutToSearch(
                    new URLSearchParams(searchParamsString),
                    next,
                  );
                  if (urlParams.toString() === searchParamsString) return;
                  router.replace(`${pathname}?${urlParams.toString()}`);
                }}
                id={id}
                roleAllowsDocEdits={canManageDocuments(capabilities)}
                canEditProject={canEditProject}
                canViewProjectFinancials={canViewProjectFinancials}
                canAccessSalesRole={canAccessSales(capabilities)}
                onBasicsChange={onBasicsChange}
                updateField={updateField}
                customersList={customersList}
                applyProjectPatch={applyProjectPatch}
                onAdvanceStage={(stage) => setAdvanceStage(stage)}
              />
            </ProjectWorkspaceProvider>

            <StatusAdvanceDialog
              open={advanceStage !== null}
              stage={advanceStage}
              project={project}
              onClose={() => setAdvanceStage(null)}
              onConfirm={async (patch) => {
                await saveProjectPatch(patch);
                setAdvanceStage(null);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
