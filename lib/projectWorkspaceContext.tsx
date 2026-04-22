"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { ProjectDocumentKind } from "@/lib/documentTypes";
import type { ProjectRow } from "@/lib/projectTypes";

export type ProjectWorkspaceFocusTarget = "files" | "overview" | "docs" | "calc";

export type PinnedCalcValue = {
  id: string;
  label: string;
  value: string;
};

type FocusOpts = {
  docKind?: ProjectDocumentKind | null;
  seedFileId?: string | null;
  seedTapeName?: string | null;
};

type ProjectWorkspaceContextValue = {
  projectId: string;
  project: ProjectRow;
  applyPatch: (patch: Partial<ProjectRow>) => void;
  savePatch: (patch: Partial<ProjectRow>) => Promise<void>;
  refreshProject: () => Promise<void>;
  activeDocumentId: string | null;
  setActiveDocumentId: (id: string | null) => void;
  showPreview: boolean;
  setShowPreview: (show: boolean) => void;
  previewZoom: number;
  setPreviewZoom: (zoom: number) => void;
  selectedFileId: string | null;
  selectFile: (id: string | null) => void;
  lastSavedTapeId: string | null;
  notifyTapeSaved: (id: string) => void;
  linkedCalcTapeIds: string[];
  setLinkedCalcTapeIds: (ids: string[]) => void;
  pinnedCalcValues: PinnedCalcValue[];
  pinCalcValue: (value: PinnedCalcValue) => void;
  unpinCalcValue: (id: string) => void;
  focusTarget: ProjectWorkspaceFocusTarget;
  focus: (target: ProjectWorkspaceFocusTarget, opts?: FocusOpts) => void;
  focusedDocKind: ProjectDocumentKind | null;
  calcSeedFileId: string | null;
  calcSeedTapeName: string | null;
  calcSeedVersion: number;
  requestFilesSync: (highlightFileName?: string | null) => void;
  filesSyncVersion: number;
  highlightedFileName: string | null;
};

const ProjectWorkspaceContext = createContext<ProjectWorkspaceContextValue | null>(
  null,
);

type ProjectWorkspaceProviderProps = {
  projectId: string;
  project: ProjectRow;
  applyPatch: (patch: Partial<ProjectRow>) => void;
  savePatch: (patch: Partial<ProjectRow>) => Promise<void>;
  refreshProject: () => Promise<void>;
  children: ReactNode;
};

export function ProjectWorkspaceProvider({
  projectId,
  project,
  applyPatch,
  savePatch,
  refreshProject,
  children,
}: ProjectWorkspaceProviderProps) {
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [lastSavedTapeId, setLastSavedTapeId] = useState<string | null>(null);
  const [linkedCalcTapeIds, setLinkedCalcTapeIds] = useState<string[]>([]);
  const [pinnedCalcValues, setPinnedCalcValues] = useState<PinnedCalcValue[]>([]);
  const [focusTarget, setFocusTarget] =
    useState<ProjectWorkspaceFocusTarget>("overview");
  const [focusedDocKind, setFocusedDocKind] = useState<ProjectDocumentKind | null>(
    null,
  );
  const [calcSeedFileId, setCalcSeedFileId] = useState<string | null>(null);
  const [calcSeedTapeName, setCalcSeedTapeName] = useState<string | null>(null);
  const [calcSeedVersion, setCalcSeedVersion] = useState(0);
  const [filesSyncVersion, setFilesSyncVersion] = useState(0);
  const [highlightedFileName, setHighlightedFileName] = useState<string | null>(
    null,
  );

  const pinCalcValue = useCallback((value: PinnedCalcValue) => {
    setPinnedCalcValues((prev) => {
      const next = prev.filter((row) => row.id !== value.id);
      return [...next, value];
    });
  }, []);

  const unpinCalcValue = useCallback((id: string) => {
    setPinnedCalcValues((prev) => prev.filter((row) => row.id !== id));
  }, []);

  const notifyTapeSaved = useCallback((id: string) => {
    setLastSavedTapeId(id);
  }, []);

  const selectFile = useCallback((id: string | null) => {
    setSelectedFileId(id);
  }, []);

  const focus = useCallback(
    (target: ProjectWorkspaceFocusTarget, opts?: FocusOpts) => {
      setFocusTarget(target);
      if (opts?.docKind !== undefined) {
        setFocusedDocKind(opts.docKind);
      }
      if (target === "calc" && opts) {
        if (opts.seedFileId !== undefined) setCalcSeedFileId(opts.seedFileId);
        if (opts.seedTapeName !== undefined) setCalcSeedTapeName(opts.seedTapeName);
        setCalcSeedVersion((prev) => prev + 1);
      }
    },
    [],
  );

  const requestFilesSync = useCallback((highlightFileName?: string | null) => {
    setFilesSyncVersion((prev) => prev + 1);
    setHighlightedFileName(highlightFileName ?? null);
  }, []);

  const value = useMemo<ProjectWorkspaceContextValue>(
    () => ({
      projectId,
      project,
      applyPatch,
      savePatch,
      refreshProject,
      activeDocumentId,
      setActiveDocumentId,
      showPreview,
      setShowPreview,
      previewZoom,
      setPreviewZoom,
      selectedFileId,
      selectFile,
      lastSavedTapeId,
      notifyTapeSaved,
      linkedCalcTapeIds,
      setLinkedCalcTapeIds,
      pinnedCalcValues,
      pinCalcValue,
      unpinCalcValue,
      focusTarget,
      focus,
      focusedDocKind,
      calcSeedFileId,
      calcSeedTapeName,
      calcSeedVersion,
      requestFilesSync,
      filesSyncVersion,
      highlightedFileName,
    }),
    [
      activeDocumentId,
      applyPatch,
      calcSeedFileId,
      calcSeedTapeName,
      calcSeedVersion,
      filesSyncVersion,
      focus,
      focusTarget,
      focusedDocKind,
      highlightedFileName,
      lastSavedTapeId,
      linkedCalcTapeIds,
      notifyTapeSaved,
      pinCalcValue,
      pinnedCalcValues,
      previewZoom,
      project,
      projectId,
      refreshProject,
      requestFilesSync,
      savePatch,
      selectFile,
      selectedFileId,
      showPreview,
      unpinCalcValue,
    ],
  );

  return (
    <ProjectWorkspaceContext.Provider value={value}>
      {children}
    </ProjectWorkspaceContext.Provider>
  );
}

export function useProjectWorkspace(): ProjectWorkspaceContextValue {
  const value = useContext(ProjectWorkspaceContext);
  if (!value) {
    throw new Error("useProjectWorkspace must be used within ProjectWorkspaceProvider.");
  }
  return value;
}

export function useProjectWorkspaceOptional(): ProjectWorkspaceContextValue | null {
  return useContext(ProjectWorkspaceContext);
}
