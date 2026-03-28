/**
 * Patch project row after a document is exported (timestamps + board stage).
 * Does not set customer `po_issued_at` for vendor purchase orders — use
 * `materials_ordered_at` instead per product rules.
 */

import type { ProjectDocumentKind } from "@/lib/documentTypes";
import type { ProjectRow } from "@/lib/projectTypes";
import { normalizeProjectLifecycle } from "@/lib/projectTypes";

function stampIfEmpty(
  row: ProjectRow,
  key: keyof ProjectRow,
  iso: string,
): void {
  const cur = row[key];
  if (cur == null || String(cur).trim() === "") {
    (row as Record<string, unknown>)[key as string] = iso;
  }
}

export type MilestoneExportPatch = Record<string, unknown>;

export function milestonePatchForDocumentExport(
  row: ProjectRow,
  kind: ProjectDocumentKind,
  now: Date = new Date(),
): MilestoneExportPatch {
  const iso = now.toISOString();
  const next: ProjectRow = { ...row };

  switch (kind) {
    case "quote":
      next.sales_command_stage = "quote_sent";
      stampIfEmpty(next, "quote_sent_at", iso);
      break;
    case "rfq":
      next.sales_command_stage = "rfq_vendors";
      stampIfEmpty(next, "rfq_vendors_sent_at", iso);
      break;
    case "purchase_order":
      stampIfEmpty(next, "materials_ordered_at", iso);
      break;
    case "invoice":
      next.sales_command_stage = "invoiced";
      stampIfEmpty(next, "invoiced_at", iso);
      break;
    case "bol":
      stampIfEmpty(next, "delivered_at", iso);
      next.sales_command_stage = "delivered";
      break;
    case "packing_list":
      break;
    default:
      break;
  }

  const normalized = normalizeProjectLifecycle(next);
  const out: MilestoneExportPatch = {};
  const keys: (keyof ProjectRow)[] = [
    "sales_command_stage",
    "quote_sent_at",
    "rfq_vendors_sent_at",
    "materials_ordered_at",
    "invoiced_at",
    "delivered_at",
  ];
  for (const k of keys) {
    if (normalized[k] !== row[k]) out[k as string] = normalized[k] ?? null;
  }
  return out;
}
