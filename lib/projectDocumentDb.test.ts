import assert from "node:assert/strict";
import { test } from "node:test";

import type { ProjectDocumentDraftMeta } from "@/lib/documentTypes";
import {
  buildRevisionHistoryLabel,
  pickRevisionForExport,
  type ProjectDocumentRevisionRow,
  type ProjectDocumentRow,
} from "@/lib/projectDocumentDb";

const meta: ProjectDocumentDraftMeta = { lines: [] };

const baseRow: ProjectDocumentRow = {
  id: "doc-1",
  project_id: "proj-1",
  kind: "quote",
  status: "draft",
  number: "Q-123",
  current_revision_index: 3,
  version: 1,
  pdf_path: null,
  metadata: meta,
  vendor_id: null,
  created_at: "2026-04-21T00:00:00Z",
  updated_at: "2026-04-21T00:00:00Z",
};

test("pickRevisionForExport returns matching historical snapshot when selected", () => {
  const revisions: ProjectDocumentRevisionRow[] = [
    {
      id: "rev-1",
      document_id: "doc-1",
      revision_index: 1,
      state: "draft",
      number_snapshot: "Q-001",
      metadata_snapshot: { lines: [{ lineNo: 1, description: "old", qty: 1, uom: "EA", unitPrice: 1, extended: 1 }] },
      vendor_id_snapshot: null,
      issued_date_snapshot: null,
      export_channel: null,
      exported_at: null,
      pdf_path: null,
      filename: null,
      created_by: null,
      created_at: "2026-04-20T00:00:00Z",
    },
  ];

  const selected = pickRevisionForExport(baseRow, revisions, 1);
  assert.equal(selected.revisionIndex, 1);
  assert.equal(selected.number, "Q-001");
  assert.equal(selected.metadata.lines[0]?.description, "old");
});

test("pickRevisionForExport falls back to latest row snapshot", () => {
  const selected = pickRevisionForExport(baseRow, [], 999);
  assert.equal(selected.revisionIndex, 3);
  assert.equal(selected.number, "Q-123");
  assert.equal(selected.metadata.lines.length, 0);
});

test("buildRevisionHistoryLabel formats revision and timestamp", () => {
  const label = buildRevisionHistoryLabel({
    id: "rev-2",
    document_id: "doc-1",
    revision_index: 2,
    state: "exported",
    number_snapshot: "Q-002",
    metadata_snapshot: meta,
    vendor_id_snapshot: null,
    issued_date_snapshot: null,
    export_channel: "download",
    exported_at: "2026-04-21T10:00:00Z",
    pdf_path: null,
    filename: "file.pdf",
    created_by: null,
    created_at: "2026-04-21T09:00:00Z",
  });

  assert.equal(label.includes("REV. 2"), true);
  assert.equal(label.includes("(v2)"), true);
  assert.equal(label.includes("MT"), true);
});

test("buildRevisionHistoryLabel prefers created_at_riverside when present", () => {
  const label = buildRevisionHistoryLabel({
    id: "rev-3",
    document_id: "doc-1",
    revision_index: 3,
    state: "draft",
    number_snapshot: "Q-003",
    metadata_snapshot: meta,
    vendor_id_snapshot: null,
    issued_date_snapshot: null,
    export_channel: null,
    exported_at: null,
    exported_at_riverside: null,
    pdf_path: null,
    filename: null,
    created_by: null,
    created_at: "2026-04-21T09:00:00Z",
    created_at_riverside: "2026-04-21 03:00:00",
  });
  assert.equal(label.includes("2026-04-21 03:00"), true);
});
