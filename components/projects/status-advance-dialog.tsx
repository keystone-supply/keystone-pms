"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  rowAfterMoveToColumn,
  type SalesBoardMoveTarget,
} from "@/lib/salesBoard";
import type { TickerStageId } from "@/lib/projectStatusTicker";
import type { ProjectRow } from "@/lib/projectTypes";

type StatusAdvanceDialogProps = {
  open: boolean;
  stage: TickerStageId | null;
  project: ProjectRow;
  onClose: () => void;
  onConfirm: (patch: Partial<ProjectRow>) => Promise<void>;
};

const ADVANCE_TARGET_BY_STAGE: Record<TickerStageId, SalesBoardMoveTarget | null> = {
  rfq_in: "rfq_customer",
  rfq_out: "rfq_vendors",
  quoted: "quote_sent",
  approved: "po_issued",
  materials_ordered: "in_process",
  materials_in: "in_process",
  labor_complete: "in_process",
  ready_to_ship: "complete",
  delivered: "delivered",
  invoiced: "invoiced",
};

const CONFIRM_TEXT: Record<TickerStageId, string> = {
  rfq_in: "Mark RFQ received as today?",
  rfq_out: "Mark RFQ sent to vendors as today?",
  quoted: "Mark quote sent as today?",
  approved: "Mark customer PO approved as today?",
  materials_ordered: "Mark materials ordered as today?",
  materials_in: "Mark material received as today?",
  labor_complete: "Mark labor complete as today?",
  ready_to_ship: "Mark ready to ship as today?",
  delivered: "Mark delivered as today?",
  invoiced: "Mark invoiced as today?",
};

const STAGE_TO_MILESTONE_FIELD: Partial<Record<TickerStageId, keyof ProjectRow>> = {
  rfq_in: "rfq_received_at",
  rfq_out: "rfq_vendors_sent_at",
  quoted: "quote_sent_at",
  approved: "po_issued_at",
  materials_ordered: "materials_ordered_at",
  materials_in: "material_received_at",
  labor_complete: "labor_completed_at",
  ready_to_ship: "ready_to_ship_at",
  delivered: "delivered_at",
  invoiced: "invoiced_at",
};

function buildAdvancePatch(project: ProjectRow, stage: TickerStageId): Partial<ProjectRow> {
  const target = ADVANCE_TARGET_BY_STAGE[stage];
  const nowIso = new Date().toISOString();
  const patch: Partial<ProjectRow> = {};

  const milestoneKey = STAGE_TO_MILESTONE_FIELD[stage];
  if (milestoneKey) {
    patch[milestoneKey] = nowIso as never;
  }

  if (!target) return patch;

  const moved = rowAfterMoveToColumn(
    { id: project.id ?? "__local__", ...project },
    target,
  );
  const candidateKeys: Array<keyof ProjectRow> = ["sales_command_stage"];

  for (const key of candidateKeys) {
    if (moved[key] !== project[key]) {
      patch[key] = moved[key] as never;
    }
  }

  return patch;
}

export function StatusAdvanceDialog({
  open,
  stage,
  project,
  onClose,
  onConfirm,
}: StatusAdvanceDialogProps) {
  const [busy, setBusy] = useState(false);
  const message = useMemo(() => {
    if (!stage) return null;
    return CONFIRM_TEXT[stage];
  }, [stage]);

  if (!open || !stage || !message) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">Advance status</h3>
        <p className="mt-2 text-sm text-zinc-300">{message}</p>
        <div className="mt-5 flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm(buildAdvancePatch(project, stage));
              setBusy(false);
            }}
          >
            {busy ? "Saving..." : "Confirm"}
          </Button>
        </div>
      </div>
    </div>
  );
}
