"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  createColumnHelper,
  useReactTable,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp, Eye } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ProjectStatusTicker } from "@/components/projects/project-status-ticker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  classifySupplyIndustrial,
  type DashboardProjectRow,
  estimatedMarginPctQuoted,
  isCancelledProject,
  realizedMarginPct,
} from "@/lib/dashboardMetrics";
import {
  deriveProjectStatusTicker,
  TICKER_STAGES,
} from "@/lib/projectStatusTicker";
import { projectRowHealth } from "@/lib/projectListUtils";
import { cn } from "@/lib/utils";

function formatUsd(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatPct(n: number | null): string {
  if (n === null) return "—";
  return `${Math.round(n * 10) / 10}%`;
}

function formatCreatedAt(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

function segmentLabel(p: DashboardProjectRow): string {
  const s = classifySupplyIndustrial(p.supply_industrial);
  if (s === "supply") return "Supply";
  if (s === "industrial") return "Industrial";
  return "—";
}

/** Calendar year from `created_at` (local), or null if missing / invalid. */
function projectCreatedYear(p: DashboardProjectRow): number | null {
  const raw = p.created_at;
  if (raw == null || raw === "") return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear();
}

function compareProjectNumber(a: DashboardProjectRow, b: DashboardProjectRow): number {
  const na = Number(a.project_number);
  const nb = Number(b.project_number);
  const aNum = Number.isFinite(na);
  const bNum = Number.isFinite(nb);
  if (aNum && bNum && na !== nb) return na - nb;
  return String(a.project_number ?? "").localeCompare(
    String(b.project_number ?? ""),
    undefined,
    { numeric: true },
  );
}

function approvalBadgeClass(approval: string): string {
  if (approval === "ACCEPTED")
    return "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30";
  if (approval === "REJECTED")
    return "bg-red-500/10 text-red-400 ring-red-500/30";
  if (approval === "CANCELLED")
    return "bg-violet-500/10 text-violet-300 ring-violet-500/35";
  if (approval === "PENDING")
    return "bg-amber-500/10 text-amber-400 ring-amber-500/30";
  return "bg-zinc-500/10 text-zinc-400 ring-zinc-500/30";
}

function healthBadgeClass(health: string): string {
  if (health === "Complete")
    return "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30";
  if (health === "Cancelled")
    return "bg-violet-500/10 text-violet-300 ring-violet-500/35";
  if (health === "Stale quote" || health === "Rejected")
    return "bg-red-500/10 text-red-400 ring-red-500/30";
  if (health === "Pending approval" || health === "Low quoted margin")
    return "bg-amber-500/10 text-amber-400 ring-amber-500/30";
  return "bg-zinc-500/10 text-zinc-300 ring-zinc-500/30";
}

const columnHelper = createColumnHelper<DashboardProjectRow>();
const TICKER_STAGE_ORDER = new Map(TICKER_STAGES.map((id, i) => [id, i]));

const baseColumns = [
  columnHelper.display({
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <Link
        href={`/projects/${row.original.id}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 hover:text-blue-300"
      >
        <Eye className="size-4" aria-hidden />
        View
      </Link>
    ),
    enableSorting: false,
    enableHiding: false,
    meta: { sticky: true },
  }),
  columnHelper.accessor((row) => row.project_number, {
    id: "project_number",
    header: "Project #",
    cell: (info) => (
      <span className="font-mono text-sm font-semibold tabular-nums">
        {info.getValue() ?? "—"}
      </span>
    ),
    sortingFn: (a, b) => compareProjectNumber(a.original, b.original),
    enableHiding: false,
  }),
  columnHelper.accessor((row) => row.customer, {
    id: "customer",
    header: "Customer",
    cell: (info) => (
      <span className="max-w-[10rem] truncate uppercase sm:max-w-[14rem]">
        {(info.getValue() || "—") as string}
      </span>
    ),
    sortingFn: (a, b) =>
      String(a.original.customer ?? "").localeCompare(
        String(b.original.customer ?? ""),
        undefined,
        { sensitivity: "base" },
      ),
  }),
  columnHelper.accessor((row) => row.created_at, {
    id: "created_at",
    header: "Created",
    cell: (info) => (
      <span className="whitespace-nowrap tabular-nums text-sm text-zinc-300">
        {formatCreatedAt(info.getValue() as string | null | undefined)}
      </span>
    ),
    sortingFn: (a, b) => {
      const ta = a.original.created_at
        ? new Date(a.original.created_at).getTime()
        : 0;
      const tb = b.original.created_at
        ? new Date(b.original.created_at).getTime()
        : 0;
      return ta - tb;
    },
  }),
  columnHelper.accessor((row) => row.project_name, {
    id: "project_name",
    header: "Project name",
    cell: (info) => (
      <span className="max-w-[12rem] truncate uppercase sm:max-w-xs">
        {(info.getValue() || "—") as string}
      </span>
    ),
    sortingFn: (a, b) =>
      String(a.original.project_name ?? "").localeCompare(
        String(b.original.project_name ?? ""),
        undefined,
        { sensitivity: "base" },
      ),
  }),
  columnHelper.display({
    id: "ticker",
    header: "Status ticker",
    cell: ({ row }) => (
      <ProjectStatusTicker
        ticker={deriveProjectStatusTicker(row.original)}
        variant="compact"
        className="min-w-[22rem]"
      />
    ),
    sortingFn: (a, b) => {
      const aTicker = deriveProjectStatusTicker(a.original);
      const bTicker = deriveProjectStatusTicker(b.original);
      const aRank = TICKER_STAGE_ORDER.get(aTicker.current) ?? 0;
      const bRank = TICKER_STAGE_ORDER.get(bTicker.current) ?? 0;
      return aRank - bRank;
    },
  }),
  columnHelper.accessor((row) => row.project_status ?? "—", {
    id: "project_status",
    header: "Ops status",
    cell: (info) => {
      const v = info.getValue();
      if (!v || v === "—")
        return <span className="text-zinc-600">—</span>;
      const label =
        v === "in_process"
          ? "In process"
          : v === "done"
            ? "Done"
            : v === "cancelled"
              ? "Cancelled"
              : String(v);
      return <span className="text-zinc-200">{label}</span>;
    },
    sortingFn: (a, b) =>
      String(a.original.project_status ?? "").localeCompare(
        String(b.original.project_status ?? ""),
      ),
  }),
  columnHelper.accessor((row) => row.customer_approval, {
    id: "customer_approval",
    header: "Approval",
    cell: (info) => {
      const v = info.getValue();
      if (!v) return <span className="text-zinc-500">—</span>;
      return (
        <Badge
          variant="outline"
          className={cn(
            "border-0 px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
            approvalBadgeClass(String(v)),
          )}
        >
          {String(v)}
        </Badge>
      );
    },
    sortingFn: (a, b) =>
      String(a.original.customer_approval ?? "").localeCompare(
        String(b.original.customer_approval ?? ""),
      ),
  }),
  columnHelper.accessor((row) => row.project_complete, {
    id: "project_complete",
    header: "Complete",
    cell: (info) =>
      info.getValue() ? (
        <span className="text-emerald-400">Yes</span>
      ) : (
        <span className="text-zinc-400">No</span>
      ),
    sortingFn: (a, b) =>
      Number(!!a.original.project_complete) - Number(!!b.original.project_complete),
  }),
  columnHelper.accessor((row) => projectRowHealth(row), {
    id: "health",
    header: "Health",
    cell: (info) => {
      const h = info.getValue();
      return (
        <Badge
          variant="outline"
          className={cn(
            "whitespace-nowrap border-0 px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
            healthBadgeClass(h),
          )}
        >
          {h}
        </Badge>
      );
    },
    sortingFn: (a, b) => {
      const ha = projectRowHealth(a.original);
      const hb = projectRowHealth(b.original);
      return ha.localeCompare(hb);
    },
  }),
  columnHelper.accessor((row) => segmentLabel(row), {
    id: "segment",
    header: "Segment",
    cell: (info) => {
      const t = info.getValue();
      return (
        <span className={t === "—" ? "text-zinc-600" : "text-zinc-200"}>{t}</span>
      );
    },
    sortingFn: (a, b) =>
      segmentLabel(a.original).localeCompare(segmentLabel(b.original)),
  }),
  columnHelper.accessor((row) => row.total_quoted ?? 0, {
    id: "total_quoted",
    header: "Quoted",
    cell: (info) => (
      <span className="tabular-nums">{formatUsd(Number(info.getValue()) || 0)}</span>
    ),
  }),
  columnHelper.accessor((row) => row.invoiced_amount ?? 0, {
    id: "invoiced_amount",
    header: "Invoiced",
    cell: (info) => (
      <span className="tabular-nums">{formatUsd(Number(info.getValue()) || 0)}</span>
    ),
  }),
  columnHelper.accessor((row) => realizedMarginPct(row), {
    id: "realized_margin",
    header: "Realized margin",
    cell: (info) => {
      const m = info.getValue();
      return (
        <span
          className={cn(
            "tabular-nums",
            m !== null && m < 0 ? "text-red-400" : "text-zinc-200",
          )}
        >
          {formatPct(m)}
        </span>
      );
    },
  }),
  columnHelper.accessor((row) => estimatedMarginPctQuoted(row), {
    id: "estimated_margin",
    header: "Est. margin (quote)",
    cell: (info) => {
      const m = info.getValue();
      return (
        <span
          className={cn(
            "tabular-nums",
            m !== null && m < 0 ? "text-red-400" : "text-zinc-200",
          )}
        >
          {formatPct(m)}
        </span>
      );
    },
  }),
];

export type CompletionFilter = "all" | "active" | "complete" | "cancelled";
export type ApprovalFilter =
  | "all"
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "CANCELLED";
export type SegmentFilter = "all" | "supply" | "industrial" | "other";
export type YearFilter = "all" | number;

type ProjectsDataTableProps = {
  data: DashboardProjectRow[];
  canViewFinancialColumns: boolean;
};

const FINANCIAL_COLUMN_IDS = [
  "total_quoted",
  "invoiced_amount",
  "realized_margin",
  "estimated_margin",
] as const;

export function ProjectsDataTable({
  data,
  canViewFinancialColumns,
}: ProjectsDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "project_number", desc: true },
  ]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [completion, setCompletion] = useState<CompletionFilter>("all");
  const [approval, setApproval] = useState<ApprovalFilter>("all");
  const [segment, setSegment] = useState<SegmentFilter>("all");
  const [year, setYear] = useState<YearFilter>("all");
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    project_status: false,
    total_quoted: canViewFinancialColumns,
    invoiced_amount: canViewFinancialColumns,
    realized_margin: canViewFinancialColumns,
    estimated_margin: false,
  });

  useEffect(() => {
    if (canViewFinancialColumns) return;
    setColumnVisibility((prev) => ({
      ...prev,
      total_quoted: false,
      invoiced_amount: false,
      realized_margin: false,
      estimated_margin: false,
    }));
  }, [canViewFinancialColumns]);

  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    for (const p of data) {
      const y = projectCreatedYear(p);
      if (y != null) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [data]);

  const filteredSource = useMemo(() => {
    return data.filter((p) => {
      const cancelled = isCancelledProject(p);
      if (completion === "active") {
        if (p.project_complete || cancelled) return false;
      }
      if (completion === "complete" && !p.project_complete) return false;
      if (completion === "cancelled" && !cancelled) return false;
      if (approval !== "all" && (p.customer_approval || "") !== approval) {
        return false;
      }
      const seg = classifySupplyIndustrial(p.supply_industrial);
      if (segment !== "all" && seg !== segment) return false;
      if (year !== "all") {
        const y = projectCreatedYear(p);
        if (y !== year) return false;
      }
      return true;
    });
  }, [data, completion, approval, segment, year]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table hook is intentionally used here.
  const table = useReactTable({
    data: filteredSource,
    columns: baseColumns,
    state: { sorting, globalFilter, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue).toLowerCase().trim();
      if (!q) return true;
      const p = row.original;
      const hay = [
        p.project_number,
        p.project_name,
        p.customer,
        p.created_at,
        formatCreatedAt(p.created_at),
      ]
        .map((x) => String(x ?? "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    },
  });

  const rowCount = table.getRowModel().rows.length;
  const scopedCount = filteredSource.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-md">
          <label htmlFor="projects-search" className="text-xs font-medium text-zinc-500">
            Search projects
          </label>
          <input
            id="projects-search"
            type="search"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Project #, name, customer…"
            className="rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            autoComplete="off"
          />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500">Status</span>
            <select
              value={completion}
              onChange={(e) =>
                setCompletion(e.target.value as CompletionFilter)
              }
              className="rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              aria-label="Filter by completion status"
            >
              <option value="all">All</option>
              <option value="active">Active (incomplete)</option>
              <option value="complete">Complete</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500">Approval</span>
            <select
              value={approval}
              onChange={(e) =>
                setApproval(e.target.value as ApprovalFilter)
              }
              className="rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              aria-label="Filter by customer approval"
            >
              <option value="all">All</option>
              <option value="PENDING">Pending</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500">Segment</span>
            <select
              value={segment}
              onChange={(e) =>
                setSegment(e.target.value as SegmentFilter)
              }
              className="rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              aria-label="Filter supply / industrial"
            >
              <option value="all">All</option>
              <option value="supply">Supply</option>
              <option value="industrial">Industrial</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500">Year</span>
            <select
              value={year === "all" ? "all" : String(year)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "all") {
                  setYear("all");
                  return;
                }
                const n = Number.parseInt(v, 10);
                setYear(Number.isFinite(n) ? n : "all");
              }}
              className="rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              aria-label="Filter by job created year"
            >
              <option value="all">All years</option>
              {yearOptions.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <details className="group relative">
            <summary className="cursor-pointer list-none rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm font-medium text-zinc-200 marker:hidden [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                Columns
                <ChevronDown className="size-4 text-zinc-500 transition group-open:rotate-180" />
              </span>
            </summary>
            <div className="absolute right-0 z-20 mt-2 min-w-[12rem] space-y-2 rounded-xl border border-zinc-700 bg-zinc-900 p-3 shadow-xl">
              {table.getAllLeafColumns().map((column) => {
                if (!column.getCanHide()) return null;
                if (
                  !canViewFinancialColumns &&
                  FINANCIAL_COLUMN_IDS.includes(
                    column.id as (typeof FINANCIAL_COLUMN_IDS)[number],
                  )
                ) {
                  return null;
                }
                return (
                  <label
                    key={column.id}
                    className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300"
                  >
                    <input
                      type="checkbox"
                      className="rounded border-zinc-600 bg-zinc-800"
                      checked={column.getIsVisible()}
                      onChange={column.getToggleVisibilityHandler()}
                    />
                    <span className="capitalize">
                      {typeof column.columnDef.header === "string"
                        ? column.columnDef.header
                        : column.id.replace(/_/g, " ")}
                    </span>
                  </label>
                );
              })}
            </div>
          </details>
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        Showing{" "}
        <span className="font-medium text-zinc-400 tabular-nums">{rowCount}</span>{" "}
        of{" "}
        <span className="font-medium text-zinc-400 tabular-nums">
          {scopedCount}
        </span>{" "}
        in view ·{" "}
        <span className="font-medium text-zinc-400 tabular-nums">{data.length}</span>{" "}
        loaded
      </p>

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
        <Table className="border-0 text-white">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="border-zinc-800 hover:bg-transparent"
              >
                {headerGroup.headers.map((header) => {
                  const sticky =
                    (header.column.columnDef.meta as { sticky?: boolean } | undefined)
                      ?.sticky;
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "h-11 whitespace-nowrap bg-zinc-950 px-3 text-xs font-medium uppercase tracking-wider text-zinc-400",
                        sticky &&
                          "sticky left-0 z-20 border-r border-zinc-800 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.5)]",
                      )}
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          className={cn(
                            "inline-flex items-center gap-1 select-none hover:text-zinc-200",
                            header.column.getCanSort() &&
                              "cursor-pointer rounded-md px-1 py-0.5 -mx-1 hover:bg-zinc-800/80",
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                          disabled={!header.column.getCanSort()}
                          aria-label={
                            header.column.getCanSort()
                              ? `Sort by ${String(header.column.columnDef.header)}`
                              : undefined
                          }
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {header.column.getCanSort() ? (
                            <span className="inline-flex w-4 flex-col leading-none text-zinc-600">
                              <ChevronUp
                                className={cn(
                                  "-mb-1 size-3",
                                  header.column.getIsSorted() === "asc"
                                    ? "text-blue-400"
                                    : "",
                                )}
                              />
                              <ChevronDown
                                className={cn(
                                  "size-3",
                                  header.column.getIsSorted() === "desc"
                                    ? "text-blue-400"
                                    : "",
                                )}
                              />
                            </span>
                          ) : null}
                        </button>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableCell
                  colSpan={baseColumns.length}
                  className="h-32 text-center text-zinc-500"
                >
                  No projects match filters — try clearing search or filters
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-zinc-800 transition-colors hover:bg-blue-600/15"
                >
                  {row.getVisibleCells().map((cell) => {
                    const sticky =
                      (cell.column.columnDef.meta as { sticky?: boolean } | undefined)
                        ?.sticky;
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "py-3 text-sm text-zinc-100",
                          sticky &&
                            "sticky left-0 z-10 border-r border-zinc-800 bg-zinc-900 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.45)]",
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
