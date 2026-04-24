"use client";

import { Button } from "@/components/ui/button";
import { DOCUMENT_KIND_LABEL, PROJECT_DOCUMENT_KINDS } from "@/lib/documentTypes";
import type {
  DocumentLineItem,
  ProjectDocumentDraftMeta,
  ProjectDocumentKind,
} from "@/lib/documentTypes";
import type { CustomerWithShipping } from "@/lib/customerQueries";
import type { ProjectRow } from "@/lib/projectTypes";
import type { VendorRow } from "@/lib/vendorQueries";

type DocumentEditorModalProps = {
  open: boolean;
  editingId: string | null;
  canManageDocuments: boolean;
  project: ProjectRow;
  crm: CustomerWithShipping | null;
  vendors: VendorRow[];
  kind: ProjectDocumentKind;
  docNumber: string;
  vendorId: string;
  meta: ProjectDocumentDraftMeta;
  saveError: string | null;
  saveBusy: boolean;
  onKindChange: (kind: ProjectDocumentKind) => void;
  onDocNumberChange: (value: string) => void;
  onVendorChange: (vendorId: string) => void;
  onMetaChange: (updater: (prev: ProjectDocumentDraftMeta) => ProjectDocumentDraftMeta) => void;
  onAddLine: () => void;
  onRemoveLine: (lineNo: number) => void;
  onPatchLine: (lineNo: number, patch: Partial<DocumentLineItem>) => void;
  onImportFromCalc: () => void;
  onSyncFromProjectTotals: () => void;
  onSave: () => Promise<void>;
  onClose: () => void;
};

export function DocumentEditorModal({
  open,
  editingId,
  canManageDocuments,
  project,
  crm,
  vendors,
  kind,
  docNumber,
  vendorId,
  meta,
  saveError,
  saveBusy,
  onKindChange,
  onDocNumberChange,
  onVendorChange,
  onMetaChange,
  onAddLine,
  onRemoveLine,
  onPatchLine,
  onImportFromCalc,
  onSyncFromProjectTotals,
  onSave,
  onClose,
}: DocumentEditorModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className="my-8 max-h-[90vh] w-full max-w-[92rem] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">{editingId ? "Edit document" : "New document"}</h3>

        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase text-zinc-500">Document type</p>
          <div className="flex flex-wrap gap-2">
            {PROJECT_DOCUMENT_KINDS.map((documentKind) => (
              <button
                key={documentKind}
                type="button"
                onClick={() => onKindChange(documentKind)}
                className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                  kind === documentKind
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                {DOCUMENT_KIND_LABEL[documentKind]}
              </button>
            ))}
          </div>
        </div>

        {kind === "rfq" || kind === "purchase_order" ? (
          <div className="mt-4">
            <label className="mb-1 block text-xs text-zinc-500">Vendor</label>
            <select
              value={vendorId}
              onChange={(event) => onVendorChange(event.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white"
            >
              <option value="">— Select —</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.legal_name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="mt-4">
          <label className="mb-1 block text-xs text-zinc-500">Document #</label>
          <input
            value={docNumber}
            onChange={(event) => onDocNumberChange(event.target.value)}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 font-mono text-white"
          />
        </div>

        {kind === "quote" ? (
          <div className="mt-4 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
            <p className="text-xs font-medium uppercase text-zinc-500">Quote PDF fields</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Quote description</label>
                <input
                  value={meta.quoteDescription ?? ""}
                  onChange={(event) =>
                    onMetaChange((prev) => ({
                      ...prev,
                      quoteDescription: event.target.value || undefined,
                    }))
                  }
                  placeholder={(project.project_name ?? "").toUpperCase() || "Project name"}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Shipping method</label>
                <input
                  value={meta.shippingMethod ?? ""}
                  onChange={(event) =>
                    onMetaChange((prev) => ({
                      ...prev,
                      shippingMethod: event.target.value || undefined,
                    }))
                  }
                  placeholder="e.g. prepaid, FOB, will call"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Payment terms</label>
                <input
                  value={meta.paymentTerms ?? ""}
                  onChange={(event) =>
                    onMetaChange((prev) => ({
                      ...prev,
                      paymentTerms: event.target.value || undefined,
                    }))
                  }
                  placeholder={crm?.payment_terms ?? "e.g. Net 30"}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Lead time (following P.O.)</label>
                <input
                  value={meta.leadTime ?? ""}
                  onChange={(event) =>
                    onMetaChange((prev) => ({
                      ...prev,
                      leadTime: event.target.value || undefined,
                    }))
                  }
                  placeholder="e.g. 1–2 weeks"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Customer contact (override)</label>
                <input
                  value={meta.customerContactDisplay ?? ""}
                  onChange={(event) =>
                    onMetaChange((prev) => ({
                      ...prev,
                      customerContactDisplay: event.target.value || undefined,
                    }))
                  }
                  placeholder={
                    [crm?.contact_name, crm?.contact_phone].filter(Boolean).join(" · ") ||
                    "From CRM if blank"
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Account manager</label>
                <input
                  value={meta.accountManagerDisplay ?? ""}
                  onChange={(event) =>
                    onMetaChange((prev) => ({
                      ...prev,
                      accountManagerDisplay: event.target.value || undefined,
                    }))
                  }
                  placeholder="Name (phone) — or set NEXT_PUBLIC_QUOTE_ACCOUNT_MANAGER"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Tax rate %</label>
                <input
                  type="number"
                  step="0.01"
                  value={meta.quotePdfTaxRatePct == null ? "" : meta.quotePdfTaxRatePct}
                  onChange={(event) => {
                    const value = event.target.value;
                    onMetaChange((prev) => ({
                      ...prev,
                      quotePdfTaxRatePct: value === "" ? null : parseFloat(value),
                    }));
                  }}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Tax $</label>
                <input
                  type="number"
                  step="0.01"
                  value={meta.quotePdfTaxAmount == null ? "" : meta.quotePdfTaxAmount}
                  onChange={(event) => {
                    const value = event.target.value;
                    onMetaChange((prev) => ({
                      ...prev,
                      quotePdfTaxAmount: value === "" ? null : parseFloat(value),
                    }));
                  }}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Logistics $</label>
                <input
                  type="number"
                  step="0.01"
                  value={meta.quotePdfLogisticsAmount == null ? "" : meta.quotePdfLogisticsAmount}
                  onChange={(event) => {
                    const value = event.target.value;
                    onMetaChange((prev) => ({
                      ...prev,
                      quotePdfLogisticsAmount: value === "" ? null : parseFloat(value),
                    }));
                  }}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Other $</label>
                <input
                  type="number"
                  step="0.01"
                  value={meta.quotePdfOtherAmount == null ? "" : meta.quotePdfOtherAmount}
                  onChange={(event) => {
                    const value = event.target.value;
                    onMetaChange((prev) => ({
                      ...prev,
                      quotePdfOtherAmount: value === "" ? null : parseFloat(value),
                    }));
                  }}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-6">
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-medium uppercase text-zinc-500">Line items</p>
            <div className="flex flex-wrap gap-2">
              {kind === "quote" || kind === "invoice" ? (
                <Button type="button" variant="secondary" size="sm" onClick={onSyncFromProjectTotals}>
                  Sync from project totals
                </Button>
              ) : null}
              <Button type="button" variant="secondary" size="sm" onClick={onImportFromCalc}>
                Import from Calc
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onAddLine}>
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
                {kind === "quote" ? (
                  <input
                    className="sm:col-span-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white"
                    value={line.partRef ?? ""}
                    onChange={(event) =>
                      onPatchLine(line.lineNo, {
                        partRef: event.target.value.trim() ? event.target.value.trim() : undefined,
                      })
                    }
                    placeholder="Item #"
                  />
                ) : null}
                <input
                  className={`rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white ${
                    kind === "quote" ? "sm:col-span-3" : "sm:col-span-5"
                  }`}
                  value={line.description}
                  onChange={(event) => onPatchLine(line.lineNo, { description: event.target.value })}
                  placeholder="Description"
                />
                <input
                  className="sm:col-span-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white"
                  type="number"
                  value={line.qty}
                  onChange={(event) =>
                    onPatchLine(line.lineNo, {
                      qty: parseFloat(event.target.value) || 0,
                    })
                  }
                />
                <input
                  className="sm:col-span-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white"
                  value={line.uom}
                  onChange={(event) => onPatchLine(line.lineNo, { uom: event.target.value })}
                />
                <input
                  className="sm:col-span-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-white"
                  type="number"
                  value={line.unitPrice}
                  onChange={(event) =>
                    onPatchLine(line.lineNo, {
                      unitPrice: parseFloat(event.target.value) || 0,
                    })
                  }
                />
                <div className="sm:col-span-1 flex items-center justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onRemoveLine(line.lineNo)}
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
            onChange={(event) => onMetaChange((prev) => ({ ...prev, notes: event.target.value }))}
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
          <Button type="button" onClick={() => void onSave()} disabled={saveBusy || !canManageDocuments}>
            {saveBusy ? "Saving…" : "Save draft"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
