"use client";

import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Package,
  ReceiptText,
  Truck,
} from "lucide-react";

import type { ProjectDocumentKind } from "@/lib/documentTypes";
import { cn } from "@/lib/utils";

type DocumentKindIconProps = {
  kind: ProjectDocumentKind;
  className?: string;
};

function iconForDocumentKind(kind: ProjectDocumentKind): LucideIcon {
  switch (kind) {
    case "rfq":
      return ClipboardList;
    case "quote":
      return FileText;
    case "purchase_order":
      return FileCheck2;
    case "packing_list":
      return Package;
    case "bol":
      return Truck;
    case "invoice":
      return ReceiptText;
    default: {
      const exhaustiveKind: never = kind;
      return exhaustiveKind;
    }
  }
}

export function documentKindIconTone(kind: ProjectDocumentKind): string {
  switch (kind) {
    case "rfq":
      return "text-cyan-300 bg-cyan-500/10 ring-cyan-500/35";
    case "quote":
      return "text-blue-300 bg-blue-500/10 ring-blue-500/35";
    case "purchase_order":
      return "text-amber-300 bg-amber-500/10 ring-amber-500/35";
    case "packing_list":
      return "text-emerald-300 bg-emerald-500/10 ring-emerald-500/35";
    case "bol":
      return "text-orange-300 bg-orange-500/10 ring-orange-500/35";
    case "invoice":
      return "text-violet-300 bg-violet-500/10 ring-violet-500/35";
    default: {
      const exhaustiveKind: never = kind;
      return exhaustiveKind;
    }
  }
}

export function DocumentKindIcon({ kind, className }: DocumentKindIconProps) {
  const Icon = iconForDocumentKind(kind);
  return <Icon className={cn("size-5", className)} aria-hidden />;
}
