/**
 * Default PDF line items from project quote fields.
 * Customer line amounts follow the same rules as the project financials panel.
 */

import type { ProjectDocumentDraftMeta } from "@/lib/documentTypes";
import { buildQuoteCustomerLineExtendeds } from "@/lib/projectFinancials";
import type { ProjectRow } from "@/lib/projectTypes";

export function buildDefaultDocumentMetaFromProject(
  project: ProjectRow,
): ProjectDocumentDraftMeta {
  const total = project.total_quoted ?? 0;
  const name = (project.project_name ?? "").toUpperCase() || "PROJECT";

  const segments = buildQuoteCustomerLineExtendeds(project);

  if (total <= 0 || segments.length === 0) {
    return {
      lines: [
        {
          lineNo: 1,
          description: `Fabrication / materials — ${name}`,
          qty: 1,
          uom: "EA",
          unitPrice: total,
          extended: total,
        },
      ],
      packingLines: [],
      bolRows: [],
    };
  }

  let lineNo = 1;
  let allocated = 0;
  const lines = segments.map((seg, i) => {
    const isLast = i === segments.length - 1;
    const extended = isLast
      ? Math.round((total - allocated) * 100) / 100
      : seg.extended;
    if (!isLast) allocated += extended;
    return {
      lineNo: lineNo++,
      description: `${seg.label} — ${name}`,
      qty: 1,
      uom: "EA" as const,
      unitPrice: extended,
      extended,
    };
  });

  return {
    lines,
    packingLines: [],
    bolRows: [],
  };
}
