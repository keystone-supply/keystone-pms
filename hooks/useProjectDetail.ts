"use client";

import { useCallback, useEffect, useState } from "react";

import {
  aggregateDashboardMetrics,
  type DashboardProjectRow,
} from "@/lib/dashboardMetrics";
import { CUSTOMER_LIST_SELECT, type CustomerRow } from "@/lib/customerQueries";
import {
  normalizeProjectMarkupPctsForEditor,
  syncActualLaborCost,
  syncQuoteDerivations,
} from "@/lib/projectFinancials";
import { withProjectSelectFallback } from "@/lib/projectQueries";
import type { ProjectBasicsField, ProjectRow } from "@/lib/projectTypes";
import { pickProjectUpdatePayload } from "@/lib/projectTypes";
import { supabase } from "@/lib/supabaseClient";

type FetchMode = "full" | "soft";

export type UseProjectDetailResult = {
  project: ProjectRow | null;
  loading: boolean;
  saving: boolean;
  saveMessage: string | null;
  saveError: string | null;
  lastUpdated: Date | null;
  openQuotesCount: number;
  customersList: CustomerRow[];
  refreshProject: () => Promise<void>;
  applyProjectPatch: (patch: Partial<ProjectRow>) => void;
  updateField: <K extends keyof ProjectRow>(field: K, value: ProjectRow[K]) => void;
  onBasicsChange: (field: ProjectBasicsField, value: string) => void;
  saveProject: () => Promise<void>;
  saveProjectPatch: (patch: Partial<ProjectRow>) => Promise<void>;
  setSaveMessage: (value: string | null) => void;
  setSaveError: (value: string | null) => void;
};

export function useProjectDetail(
  projectId: string,
  isAuthenticated: boolean,
  canEditProject: boolean,
): UseProjectDetailResult {
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [openQuotesCount, setOpenQuotesCount] = useState(0);
  const [customersList, setCustomersList] = useState<CustomerRow[]>([]);

  const fetchProject = useCallback(
    async (mode: FetchMode = "full") => {
      if (mode === "full") setLoading(true);
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();

      if (error) {
        console.error(error);
        setProject(null);
        setLastUpdated(null);
      } else {
        const row = data as ProjectRow;
        const withMarkups = normalizeProjectMarkupPctsForEditor(row);
        setProject({
          ...withMarkups,
          ...syncQuoteDerivations(withMarkups),
          ...syncActualLaborCost(withMarkups),
        });
        setLastUpdated(new Date());
      }
      if (mode === "full") setLoading(false);
    },
    [projectId],
  );

  const fetchOpenQuotesCount = useCallback(async () => {
    const { data, error } = await withProjectSelectFallback((select) =>
      supabase.from("projects").select(select),
    );
    if (error || !data) return;
    setOpenQuotesCount(
      aggregateDashboardMetrics(data as DashboardProjectRow[]).openQuotes,
    );
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void Promise.resolve().then(() => fetchProject("full"));
  }, [fetchProject, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void Promise.resolve().then(() => fetchOpenQuotesCount());
  }, [fetchOpenQuotesCount, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void supabase
      .from("customers")
      .select(CUSTOMER_LIST_SELECT)
      .order("legal_name", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setCustomersList(data as CustomerRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const applyProjectPatch = useCallback((patch: Partial<ProjectRow>) => {
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

  const updateField = useCallback(
    <K extends keyof ProjectRow>(field: K, value: ProjectRow[K]) => {
      setProject((prev) => (prev ? { ...prev, [field]: value } : null));
    },
    [],
  );

  const onBasicsChange = useCallback(
    (field: ProjectBasicsField, value: string) => {
      if (field === "customer" || field === "project_name") {
        updateField(field, value.toUpperCase() as ProjectRow[typeof field]);
        return;
      }
      updateField(field, value as ProjectRow[typeof field]);
    },
    [updateField],
  );

  const saveProject = useCallback(async () => {
    if (!project) return;
    if (!canEditProject) {
      setSaveError("Your role can view this project but cannot edit it.");
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);

    const synced = normalizeProjectMarkupPctsForEditor({
      ...project,
      ...syncQuoteDerivations(project),
      ...syncActualLaborCost(project),
    });
    const payload = pickProjectUpdatePayload(synced);
    const { error } = await supabase
      .from("projects")
      .update(payload)
      .eq("id", projectId);

    if (!error) {
      setProject(synced);
      setSaveMessage("Saved — realtime update sent to all connected sessions.");
      setLastUpdated(new Date());
      await fetchProject("soft");
    } else {
      setSaveError(error.message ?? "Could not save changes.");
    }

    setSaving(false);
  }, [canEditProject, fetchProject, project, projectId]);

  const saveProjectPatch = useCallback(
    async (patch: Partial<ProjectRow>) => {
      if (!project) return;
      const next = { ...project, ...patch };
      setProject(next);
      if (!canEditProject) {
        setSaveError("Your role can view this project but cannot edit it.");
        return;
      }

      setSaving(true);
      setSaveMessage(null);
      setSaveError(null);

      const synced = normalizeProjectMarkupPctsForEditor({
        ...next,
        ...syncQuoteDerivations(next),
        ...syncActualLaborCost(next),
      });
      const payload = pickProjectUpdatePayload(synced);
      const { error } = await supabase
        .from("projects")
        .update(payload)
        .eq("id", projectId);

      if (!error) {
        setProject(synced);
        setSaveMessage("Saved — realtime update sent to all connected sessions.");
        setLastUpdated(new Date());
        await fetchProject("soft");
      } else {
        setSaveError(error.message ?? "Could not save changes.");
      }

      setSaving(false);
    },
    [canEditProject, fetchProject, project, projectId],
  );

  const refreshProject = useCallback(async () => {
    await fetchProject("soft");
  }, [fetchProject]);

  return {
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
    setSaveMessage,
    setSaveError,
  };
}
