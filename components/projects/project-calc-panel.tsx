"use client";

import { UnifiedShopCalc } from "@/components/calc/unified-shop-calc";

type ProjectCalcPanelProps = {
  projectId: string;
  projectNumber: string | null;
  projectName: string | null;
  customer: string | null;
};

export function ProjectCalcPanel({
  projectId,
  projectNumber,
  projectName,
  customer,
}: ProjectCalcPanelProps) {
  return (
    <UnifiedShopCalc
      layout="embedded"
      projectId={projectId}
      projectNumber={projectNumber}
      projectName={projectName}
      customer={customer}
    />
  );
}
