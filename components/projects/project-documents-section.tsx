"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CloudUpload, Eye, FileText, HardDriveDownload, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DOCUMENT_KIND_LABEL, PROJECT_DOCUMENT_KINDS } from "@/lib/documentTypes";
import type {
  DocumentLineItem,
  ProjectDocumentDraftMeta,
  ProjectDocumentKind,
} from "@/lib/documentTypes";
import { milestonePatchForDocumentExport } from "@/lib/documentMilestones";
import {
  PROJECT_DOCUMENT_SELECT,
  type ProjectDocumentRow,
} from "@/lib/projectDocumentDb";
import { buildDefaultDocumentMetaFromProject } from "@/lib/projectDocumentDefaults";
import type { ProjectRow } from "@/lib/projectTypes";
import { CUSTOMER_DETAIL_SELECT, type CustomerWithShipping } from "@/lib/customerQueries";
import { VENDOR_LIST_SELECT, type VendorRow } from "@/lib/vendorQueries";
import {
  buildDocumentDownloadFilename,
  fetchLogoDataUrl,
} from "@/lib/documents/buildProjectDocumentPdf";
import { generateProjectDocumentPdfBuffer } from "@/lib/documents/composePdfInput";
import { uploadPdfToDocs } from "@/lib/onedrive";

function emptyMeta(): ProjectDocumentDraftMeta {
  return {
    lines: [],
    packingLines: [],
    bolRows: [],
  };
}

function normalizeMeta(raw: unknown): ProjectDocumentDraftMeta {
  if (!raw || typeof raw !== "object") return emptyMeta();
  const m = raw as ProjectDocumentDraftMeta;
  return {
    ...emptyMeta(),
    ...m,
    lines: Array.isArray(m.lines) ? m.lines : [],
    packingLines: Array.isArray(m.packingLines) ? m.packingLines : [],
    bolRows: Array.isArray(m.bolRows) ? m.bolRows : [],
  };
}

function suggestDocNumber(project: ProjectRow, kind: ProjectDocumentKind): string {
  const pn = String(project.project_number ?? "JOB").replace(/\s+/g, "");
  const prefix =
    kind === "quote"
      ? "Q"
      : kind === "invoice"
        ? "INV"
        : kind === "rfq"
          ? "RFQ"
          : kind === "purchase_order"
            ? "PO"
            : kind === "bol"
              ? "BOL"
              : kind === "packing_list"
                ? "PK"
                : "DOC";
  return `${prefix}-${pn}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
}

export function ProjectDocumentsSection({
  projectId,
  project,
  supabase,
  onProjectRefresh,
}: {
  projectId: string;
  project: ProjectRow;
  supabase: SupabaseClient;
  onProjectRefresh: () => void;
}) {
  const [rows, setRows] = useState<ProjectDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [crm, setCrm] = useState<CustomerWithShipping | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kind, setKind] = useState<ProjectDocumentKind>("quote");
  const [docNumber, setDocNumber] = useState("");
  const [vendorId, setVendorId] = useState<string>("");
  const [meta, setMeta] = useState<ProjectDocumentDraftMeta>(emptyMeta());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportingRow, setExportingRow] = useState<ProjectDocumentRow | null>(null);
  const [exportMethod, setExportMethod] = useState<"download" | "onedrive">("download");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const [updateMilestones, setUpdateMilestones] = useState(false);

  const defaultShipTo = useMemo(() => {
    const addrs = crm?.customer_shipping_addresses;
    if (!addrs?.length) return null;
    const def = addrs.find((a) => a.is_default);
    return def ?? addrs[0] ?? null;
  }, [crm]);

  const loadDocs = useCallback(async () => {
    const { data, error } = await supabase
      .from("project_documents")
      .select(PROJECT_DOCUMENT_SELECT)
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false });
    if (!error && data) {
      setRows(data as ProjectDocumentRow[]);
    }
    setLoading(false);
  }, [projectId, supabase]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("vendors")
      .select(VENDOR_LIST_SELECT)
      .order("legal_name", { ascending: true })
      .then(({ data }) => {
        if (!cancelled && data) setVendors(data as VendorRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    const cid = project.customer_id;
    if (!cid) {
      setCrm(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from("customers")
      .select(CUSTOMER_DETAIL_SELECT)
      .eq("id", cid)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setCrm(data as CustomerWithShipping);
      });
    return () => {
      cancelled = true;
    };
  }, [project.customer_id, supabase]);

  const openNew = () => {
    setEditingId(null);
    setKind("quote");
    setDocNumber(suggestDocNumber(project, "quote"));
    setVendorId("");
    setMeta(buildDefaultDocumentMetaFromProject(project));
    setSaveError(null);
    setEditorOpen(true);
  };

  const openEdit = (r: ProjectDocumentRow) => {
    setEditingId(r.id);
    setKind(r.kind);
    setDocNumber(r.number ?? suggestDocNumber(project, r.kind));
    setVendorId(r.vendor_id ?? "");
    setMeta(normalizeMeta(r.metadata));
    setSaveError(null);
    setEditorOpen(true);
  };

  const saveDraft = async () => {
    setSaveError(null);
    setSaveBusy(true);
    try {
      const payload = {
        project_id: projectId,
        kind,
        status: "draft",
        number: docNumber.trim() || null,
        metadata: meta,
        vendor_id:
          kind === "rfq" || kind === "purchase_order"
            ? vendorId.trim() || null
            : null,
      };
      if (editingId) {
        const { error } = await supabase
          .from("project_documents")
          .update({
            kind: payload.kind,
            number: payload.number,
            metadata: payload.metadata,
            vendor_id: payload.vendor_id,
          })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("project_documents").insert(payload);
        if (error) throw error;
      }
      setEditorOpen(false);
      await loadDocs();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaveBusy(false);
    }
  };

  const syncLines = (lines: DocumentLineItem[]) =>
    setMeta((m) => ({ ...m, lines }));

  const addLine = () => {
    const nextNo =
      meta.lines.reduce((mx, l) => Math.max(mx, l.lineNo), 0) + 1;
    syncLines([
      ...meta.lines,
      {
        lineNo: nextNo,
        description: "",
        qty: 1,
        uom: "EA",
        unitPrice: 0,
        extended: 0,
      },
    ]);
  };

  const removeLine = (lineNo: number) => {
    syncLines(meta.lines.filter((l) => l.lineNo !== lineNo));
  };

  const patchLine = (lineNo: number, patch: Partial<DocumentLineItem>) => {
    syncLines(
      meta.lines.map((l) => {
        if (l.lineNo !== lineNo) return l;
        const next = { ...l, ...patch };
        if (patch.qty != null || patch.unitPrice != null) {
          next.extended = next.qty * next.unitPrice;
        }
        return next;
      }),
    );
  };

  const runExport = async () => {
    if (!exportingRow) return;
    setExportBusy(true);
    setExportError("");
    try {
      const logo = await fetchLogoDataUrl();
      const vendorForRow =
        (exportingRow.kind === "rfq" ||
          exportingRow.kind === "purchase_order") &&
        exportingRow.vendor_id
          ? (vendors.find((v) => v.id === exportingRow.vendor_id) ?? null)
          : null;
      const buffer = generateProjectDocumentPdfBuffer({
        kind: exportingRow.kind,
        documentNumber: exportingRow.number ?? docNumber,
        issuedDate: new Date(),
        logoDataUrl: logo,
        project,
        meta: normalizeMeta(exportingRow.metadata),
        vendor: vendorForRow,
        customer: crm,
        defaultShipTo,
      });

      const filename = buildDocumentDownloadFilename(
        String(project.project_number ?? "JOB"),
        exportingRow.kind,
        exportingRow.number ?? "draft",
      );

      if (exportMethod === "download") {
        const blob = new Blob([buffer], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const freshSessionRes = await fetch("/api/auth/session");
        const freshSession = await freshSessionRes.json();
        const token = freshSession?.accessToken;
        if (!token) throw new Error("No access token. Sign in again.");
        const path = await uploadPdfToDocs(
          token,
          project.customer ?? "",
          String(project.project_number ?? ""),
          project.project_name ?? "",
          filename,
          buffer,
        );
        await supabase
          .from("project_documents")
          .update({ pdf_path: path, version: (exportingRow.version ?? 1) + 1 })
          .eq("id", exportingRow.id);
      }

      if (updateMilestones) {
        const patch = milestonePatchForDocumentExport(
          project,
          exportingRow.kind,
        );
        if (Object.keys(patch).length > 0) {
          await supabase.from("projects").update(patch).eq("id", projectId);
          onProjectRefresh();
        }
      }

      setExportOpen(false);
      setExportingRow(null);
      setUpdateMilestones(false);
      await loadDocs();
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExportBusy(false);
    }
  };

  const openExportFor = (r: ProjectDocumentRow) => {
    setExportingRow(r);
    setExportMethod("download");
    setExportError("");
    setUpdateMilestones(false);
    setExportOpen(true);
  };

  const quickPreview = async (r: ProjectDocumentRow) => {
    try {
      const logo = await fetchLogoDataUrl();
      const buffer = generateProjectDocumentPdfBuffer({
        kind: r.kind,
        documentNumber: r.number ?? suggestDocNumber(project, r.kind),
        issuedDate: new Date(),
        logoDataUrl: logo,
        project,
        meta: normalizeMeta(r.metadata),
        vendor:
          r.vendor_id && (r.kind === "rfq" || r.kind === "purchase_order")
            ? vendors.find((v) => v.id === r.vendor_id) ?? null
            : null,
        customer: crm,
        defaultShipTo,
      });
      const blob = new Blob([buffer], { type: "application/pdf" });
      window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-900 p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Project documents</h2>
          <p className="mt-1 text-sm text-zinc-500">
            RFQs, quotes, POs, packing lists, BOLs, and invoices — export to PDF
            or your job&apos;s OneDrive `_DOCS` folder.
          </p>
        </div>
        <Button type="button" onClick={openNew} className="gap-2 self-start sm:self-auto">
          <Plus className="size-4" />
          New document
        </Button>
      </div>

      {loading ? (
        <p className="text-zinc-500">Loading documents…</p>
      ) : rows.length === 0 ? (
        <p className="text-zinc-500">No documents yet. Create one to get started.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 size-5 shrink-0 text-sky-400" aria-hidden />
                <div>
                  <p className="font-medium text-white">
                    {DOCUMENT_KIND_LABEL[r.kind]}
                  </p>
                  <p className="font-mono text-sm text-zinc-400">
                    {r.number ?? "—"} · v{r.version}
                    {r.pdf_path ? (
                      <span className="ml-2 text-emerald-500/90">· file saved</span>
                    ) : null}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => void quickPreview(r)}
                >
                  <Eye className="size-4" />
                  Preview
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => openEdit(r)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="gap-1"
                  onClick={() => openExportFor(r)}
                >
                  <HardDriveDownload className="size-4" />
                  Export
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
          <div className="my-8 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">
              {editingId ? "Edit document" : "New document"}
            </h3>

            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase text-zinc-500">
                Document type
              </p>
              <div className="flex flex-wrap gap-2">
                {PROJECT_DOCUMENT_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setKind(k);
                      setDocNumber(suggestDocNumber(project, k));
                    }}
                    className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                      kind === k
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                  >
                    {DOCUMENT_KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>

            {(kind === "rfq" || kind === "purchase_order") ? (
              <div className="mt-4">
                <label className="mb-1 block text-xs text-zinc-500">Vendor</label>
                <select
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white"
                >
                  <option value="">— Select —</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.legal_name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="mt-4">
              <label className="mb-1 block text-xs text-zinc-500">Document #</label>
              <input
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 font-mono text-white"
              />
            </div>

            <div className="mt-6">
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-medium uppercase text-zinc-500">
                  Line items
                </p>
                <div className="flex flex-wrap gap-2">
                  {kind === "quote" || kind === "invoice" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setMeta(buildDefaultDocumentMetaFromProject(project))
                      }
                    >
                      Sync from project totals
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" size="sm" onClick={addLine}>
                    Add line
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                {meta.lines.map((line) => (
                  <div
                    key={line.lineNo}
                    className="grid gap-2 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 sm:grid-cols-12"
                  >
                    <input
                      className="sm:col-span-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white"
                      value={line.lineNo}
                      readOnly
                      title="Line #"
                    />
                    <input
                      className="sm:col-span-5 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white"
                      value={line.description}
                      onChange={(e) =>
                        patchLine(line.lineNo, { description: e.target.value })
                      }
                      placeholder="Description"
                    />
                    <input
                      className="sm:col-span-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white"
                      type="number"
                      value={line.qty}
                      onChange={(e) =>
                        patchLine(line.lineNo, {
                          qty: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                    <input
                      className="sm:col-span-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white"
                      value={line.uom}
                      onChange={(e) =>
                        patchLine(line.lineNo, { uom: e.target.value })
                      }
                    />
                    <input
                      className="sm:col-span-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white"
                      type="number"
                      value={line.unitPrice}
                      onChange={(e) =>
                        patchLine(line.lineNo, {
                          unitPrice: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                    <div className="sm:col-span-1 flex items-center justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeLine(line.lineNo)}
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs text-zinc-500">Notes (footer)</label>
              <textarea
                value={meta.notes ?? ""}
                onChange={(e) =>
                  setMeta((m) => ({ ...m, notes: e.target.value }))
                }
                rows={3}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white"
              />
            </div>

            {saveError ? (
              <p className="mt-3 text-sm text-red-400" role="alert">
                {saveError}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => void saveDraft()}
                disabled={saveBusy}
              >
                {saveBusy ? "Saving…" : "Save draft"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditorOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {exportOpen && exportingRow ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">Export PDF</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Job{" "}
              <span className="font-mono text-zinc-200">
                {project.project_number}
              </span>{" "}
              — {DOCUMENT_KIND_LABEL[exportingRow.kind]}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-1">
              <button
                type="button"
                onClick={() => setExportMethod("download")}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${
                  exportMethod === "download"
                    ? "bg-blue-600 text-white"
                    : "text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                <HardDriveDownload className="size-4" />
                Download
              </button>
              <button
                type="button"
                onClick={() => setExportMethod("onedrive")}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${
                  exportMethod === "onedrive"
                    ? "bg-blue-600 text-white"
                    : "text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                <CloudUpload className="size-4" />
                OneDrive
              </button>
            </div>

            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-zinc-300 select-none">
              <input
                type="checkbox"
                checked={updateMilestones}
                onChange={(e) => setUpdateMilestones(e.target.checked)}
                className="size-4 rounded border-zinc-600"
              />
              Update job milestones (quote → quote sent, RFQ → vendors, vendor PO
              → materials ordered, invoice → invoiced, BOL → delivered)
            </label>

            {exportError ? (
              <p className="mt-3 text-sm text-red-400">{exportError}</p>
            ) : null}

            <div className="mt-6 flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setExportOpen(false);
                  setExportingRow(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={exportBusy}
                onClick={() => void runExport()}
              >
                {exportBusy ? "Working…" : exportMethod === "download" ? "Download" : "Upload"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
