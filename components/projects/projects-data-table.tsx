"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  type ColumnSizingState,
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
import {
  PIPELINE_STAGE_LABELS,
  boardColumnForProject,
} from "@/lib/salesCommandBoardColumn";
import {
  formatRiversideDateWithMt,
  riversideYear,
} from "@/lib/time/riversideDisplay";
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
  return formatRiversideDateWithMt(raw);
}

function segmentLabel(p: DashboardProjectRow): string {
  const s = classifySupplyIndustrial(p.supply_industrial);
  if (s === "supply") return "Supply";
  if (s === "industrial") return "Industrial";
  return "—";
}

/** Calendar year from `created_at` in Riverside local time, or null if invalid. */
function projectCreatedYear(p: DashboardProjectRow): number | null {
  return riversideYear(p.created_at);
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

function stageLabel(p: DashboardProjectRow): string {
  return PIPELINE_STAGE_LABELS[boardColumnForProject(p)];
}

function isCompleted(p: DashboardProjectRow): boolean {
  return boardColumnForProject(p) === "invoiced";
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
    size: 84,
    minSize: 84,
    maxSize: 84,
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
    enableResizing: false,
    meta: { sticky: true },
  }),
  columnHelper.accessor((row) => row.project_number, {
    id: "project_number",
    header: "Project #",
    size: 88,
    minSize: 88,
    maxSize: 88,
    cell: (info) => (
      <span className="font-mono text-sm font-semibold tabular-nums">
        {info.getValue() ?? "—"}
      </span>
    ),
    sortingFn: (a, b) => compareProjectNumber(a.original, b.original),
    enableResizing: false,
  }),
  columnHelper.accessor((row) => row.customer, {
    id: "customer",
    header: "Customer",
    size: 126,
    cell: (info) => (
      <span className="break-words whitespace-normal uppercase">
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
    size: 135,
    cell: (info) => (
      <span className="tabular-nums text-sm text-zinc-300">
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
      <span className="break-words whitespace-normal uppercase">
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
    size: 234,
    cell: ({ row }) => (
      <ProjectStatusTicker
        ticker={deriveProjectStatusTicker(row.original)}
        variant="compact"
        className="min-w-0"
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
  columnHelper.accessor((row) => stageLabel(row), {
    id: "sales_command_stage",
    header: "Stage",
    cell: (info) => {
      const v = info.getValue();
      return (
        <span className={v ? "text-zinc-200" : "text-zinc-600"}>
          {v || "—"}
        </span>
      );
    },
    sortingFn: (a, b) =>
      stageLabel(a.original).localeCompare(stageLabel(b.original)),
  }),
  columnHelper.accessor((row) => projectRowHealth(row), {
    id: "health",
    header: "Health",
    size: 108,
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
    size: 90,
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
export type SegmentFilter = "all" | "supply" | "industrial" | "other";
export type YearFilter = "all" | number;

const PROJECTS_TABLE_COLUMN_SIZING_KEY = "projects-data-table:column-sizing:v1";
const DEFAULT_COLUMN_MIN_SIZE = 40;
const DEFAULT_COLUMN_MAX_SIZE = 2000;
const KNOWN_COLUMN_IDS = new Set(
  baseColumns
    .map((column) => column.id)
    .filter((id): id is string => typeof id === "string"),
);

export function sanitizeColumnSizingState(raw: unknown): ColumnSizingState {
  if (!raw || typeof raw !== "object") return {};
  const next: ColumnSizingState = {};
  for (const [columnId, size] of Object.entries(raw)) {
    if (!KNOWN_COLUMN_IDS.has(columnId)) continue;
    if (typeof size !== "number" || !Number.isFinite(size)) continue;
    next[columnId] = Math.max(
      DEFAULT_COLUMN_MIN_SIZE,
      Math.min(DEFAULT_COLUMN_MAX_SIZE, Math.round(size)),
    );
  }
  return next;
}

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
const VISIBLE_ROW_COUNT = 20;
const TABLE_HEADER_HEIGHT_PX = 44;
const TABLE_ROW_HEIGHT_PX = 52;
const DEFAULT_COLUMN_SIZE = 180;
const CONTROL_INPUT_CLASS =
  "rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

function isFinancialColumnId(
  columnId: string,
): columnId is (typeof FINANCIAL_COLUMN_IDS)[number] {
  return FINANCIAL_COLUMN_IDS.includes(
    columnId as (typeof FINANCIAL_COLUMN_IDS)[number],
  );
}

export function ProjectsDataTable({
  data,
  canViewFinancialColumns,
}: ProjectsDataTableProps) {
  const tableViewportRef = useRef<HTMLDivElement | null>(null);
  const [tableViewportWidth, setTableViewportWidth] = useState(0);
  const tableViewportMaxHeight =
    TABLE_HEADER_HEIGHT_PX + VISIBLE_ROW_COUNT * TABLE_ROW_HEIGHT_PX;
  const [sorting, setSorting] = useState<SortingState>([
    { id: "project_number", desc: true },
  ]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => {
    if (typeof window === "undefined") return {};
    try {
      const persisted = window.localStorage.getItem(
        PROJECTS_TABLE_COLUMN_SIZING_KEY,
      );
      if (!persisted) return {};
      return sanitizeColumnSizingState(JSON.parse(persisted));
    } catch {
      return {};
    }
  });
  const [globalFilter, setGlobalFilter] = useState("");
  const [completion, setCompletion] = useState<CompletionFilter>("all");
  const [segment, setSegment] = useState<SegmentFilter>("all");
  const [year, setYear] = useState<YearFilter>(() => {
    const currentYear = riversideYear(new Date().toISOString());
    return currentYear ?? "all";
  });
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    project_number: true,
    customer: true,
    created_at: true,
    project_name: true,
    ticker: true,
    sales_command_stage: false,
    health: true,
    segment: false,
    total_quoted: false,
    invoiced_amount: false,
    realized_margin: false,
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

  useEffect(() => {
    if (!canViewFinancialColumns) return;
    setColumnVisibility((prev) => ({
      ...prev,
      project_number: prev.project_number ?? true,
      customer: prev.customer ?? true,
      created_at: prev.created_at ?? true,
      project_name: prev.project_name ?? true,
      ticker: prev.ticker ?? true,
      sales_command_stage: prev.sales_command_stage ?? false,
      health: prev.health ?? true,
      segment: prev.segment ?? false,
      total_quoted: prev.total_quoted ?? false,
      invoiced_amount: prev.invoiced_amount ?? false,
      realized_margin: prev.realized_margin ?? false,
      estimated_margin: prev.estimated_margin ?? false,
    }));
  }, [canViewFinancialColumns]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (Object.keys(columnSizing).length === 0) {
        window.localStorage.removeItem(PROJECTS_TABLE_COLUMN_SIZING_KEY);
        return;
      }
      window.localStorage.setItem(
        PROJECTS_TABLE_COLUMN_SIZING_KEY,
        JSON.stringify(columnSizing),
      );
    } catch {
      // ignore storage failures to keep table interactive
    }
  }, [columnSizing]);

  useEffect(() => {
    const viewport = tableViewportRef.current;
    if (!viewport) return;
    if (typeof window === "undefined") return;

    const measure = () => {
      setTableViewportWidth(Math.max(0, Math.floor(viewport.clientWidth)));
    };
    measure();

    if (!("ResizeObserver" in window)) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

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
        if (isCompleted(p) || cancelled) return false;
      }
      if (completion === "complete" && !isCompleted(p)) return false;
      if (completion === "cancelled" && !cancelled) return false;
      const seg = classifySupplyIndustrial(p.supply_industrial);
      if (segment !== "all" && seg !== segment) return false;
      if (year !== "all") {
        const y = projectCreatedYear(p);
        if (y !== year) return false;
      }
      return true;
    });
  }, [data, completion, segment, year]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table hook is intentionally used here.
  const table = useReactTable({
    data: filteredSource,
    columns: baseColumns,
    defaultColumn: {
      size: 180,
      minSize: 40,
      maxSize: 2000,
    },
    state: { sorting, globalFilter, columnVisibility, columnSizing },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnSizingChange: setColumnSizing,
    columnResizeMode: "onChange",
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
  const visibleLeafColumns = table.getVisibleLeafColumns();
  const columnWidths = new Map<string, number>();
  const baseWidthByColumn = new Map<string, number>();
  let baseTableWidth = 0;

  for (const column of visibleLeafColumns) {
    const explicitSize = columnSizing[column.id];
    const columnDefault = column.columnDef.size ?? DEFAULT_COLUMN_SIZE;
    const min = column.columnDef.minSize ?? DEFAULT_COLUMN_MIN_SIZE;
    const max = column.columnDef.maxSize ?? DEFAULT_COLUMN_MAX_SIZE;
    const base = Number.isFinite(explicitSize)
      ? Number(explicitSize)
      : columnDefault;
    const clampedBase = Math.max(min, Math.min(max, base));
    baseWidthByColumn.set(column.id, clampedBase);
    baseTableWidth += clampedBase;
  }

  const scaleFactor =
    tableViewportWidth > 0 && baseTableWidth > 0
      ? tableViewportWidth / baseTableWidth
      : 1;

  let resolvedTableWidth = 0;
  for (const column of visibleLeafColumns) {
    const base = baseWidthByColumn.get(column.id) ?? DEFAULT_COLUMN_SIZE;
    const min = column.columnDef.minSize ?? DEFAULT_COLUMN_MIN_SIZE;
    const max = column.columnDef.maxSize ?? DEFAULT_COLUMN_MAX_SIZE;
    const scaled = Math.round(base * scaleFactor);
    const width = Math.max(min, Math.min(max, scaled));
    columnWidths.set(column.id, width);
    resolvedTableWidth += width;
  }

  if (resolvedTableWidth <= 0) resolvedTableWidth = table.getTotalSize();
  const visibleColumnCount = visibleLeafColumns.length;

  const resetToDefaultColumnLayout = () => {
    table.resetColumnSizing(true);
    setColumnSizing({});
  };

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
              className={CONTROL_INPUT_CLASS}
              aria-label="Filter by completion status"
            >
              <option value="all">All</option>
              <option value="active">Active (incomplete)</option>
              <option value="complete">Complete</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500">Segment</span>
            <select
              value={segment}
              onChange={(e) =>
                setSegment(e.target.value as SegmentFilter)
              }
              className={CONTROL_INPUT_CLASS}
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
              className={CONTROL_INPUT_CLASS}
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

          <button
            type="button"
            onClick={resetToDefaultColumnLayout}
            className="rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm font-medium text-zinc-200 transition hover:bg-zinc-800"
          >
            Reset column sizes
          </button>

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
                if (!canViewFinancialColumns && isFinancialColumnId(column.id)) {
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

      <div
        className={cn(
          "overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50",
          table.getState().columnSizingInfo.isResizingColumn &&
            "cursor-col-resize select-none",
        )}
      >
        <div
          ref={tableViewportRef}
          className="overflow-auto"
          style={{ maxHeight: `${tableViewportMaxHeight}px` }}
        >
          <Table
            className="w-max table-fixed border-0 text-white"
            style={{ minWidth: resolvedTableWidth, width: resolvedTableWidth }}
          >
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
                        "relative h-11 break-words whitespace-normal bg-zinc-950 px-3 text-xs font-medium uppercase tracking-wider text-zinc-400",
                        sticky &&
                          "sticky left-0 z-20 border-r border-zinc-800 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.5)]",
                      )}
                      style={{
                        width: columnWidths.get(header.column.id) ?? header.getSize(),
                        minWidth: header.column.columnDef.minSize,
                      }}
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          className={cn(
                            "flex w-full items-start gap-1 text-left select-none hover:text-zinc-200",
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
                            <span className="inline-flex w-4 shrink-0 flex-col leading-none text-zinc-600">
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
                      {header.column.getCanResize() ? (
                        <div
                          role="separator"
                          tabIndex={0}
                          aria-orientation="vertical"
                          aria-label={`Resize ${String(header.column.columnDef.header)} column`}
                          aria-valuemin={header.column.columnDef.minSize ?? DEFAULT_COLUMN_MIN_SIZE}
                          aria-valuemax={header.column.columnDef.maxSize ?? DEFAULT_COLUMN_MAX_SIZE}
                          aria-valuenow={
                            columnWidths.get(header.column.id) ?? header.getSize()
                          }
                          title="Drag to resize. Double-click to reset width."
                          onClick={(event) => event.stopPropagation()}
                          onDoubleClick={() => header.column.resetSize()}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            header.getResizeHandler()(event);
                          }}
                          onTouchStart={(event) => {
                            event.stopPropagation();
                            header.getResizeHandler()(event);
                          }}
                          onKeyDown={(event) => {
                            const min = header.column.columnDef.minSize ?? DEFAULT_COLUMN_MIN_SIZE;
                            const max = header.column.columnDef.maxSize ?? DEFAULT_COLUMN_MAX_SIZE;
                            const columnId = header.column.id;
                            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                              event.preventDefault();
                              const delta = event.key === "ArrowRight" ? 16 : -16;
                              setColumnSizing((prev) => {
                                const current = prev[columnId] ?? header.getSize();
                                return {
                                  ...prev,
                                  [columnId]: Math.max(
                                    min,
                                    Math.min(max, Math.round(current + delta)),
                                  ),
                                };
                              });
                            }
                            if (event.key === "Home") {
                              event.preventDefault();
                              setColumnSizing((prev) => ({ ...prev, [columnId]: min }));
                            }
                            if (event.key === "End") {
                              event.preventDefault();
                              setColumnSizing((prev) => ({ ...prev, [columnId]: max }));
                            }
                          }}
                          className={cn(
                            "absolute right-0 top-0 h-full w-4 translate-x-1/2 cursor-col-resize select-none touch-none rounded-sm transition-colors before:absolute before:bottom-1 before:left-1/2 before:top-1 before:w-px before:-translate-x-1/2 before:bg-zinc-600/60 hover:bg-blue-400/20 hover:before:bg-blue-400/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/50",
                            header.column.getIsResizing() && "bg-blue-400/80",
                          )}
                        />
                      ) : null}
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
                  colSpan={visibleColumnCount}
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
                          "break-words whitespace-normal py-3 text-sm text-zinc-100",
                          sticky &&
                            "sticky left-0 z-10 border-r border-zinc-800 bg-zinc-900 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.45)]",
                        )}
                        style={{
                          width:
                            columnWidths.get(cell.column.id) ?? cell.column.getSize(),
                          minWidth: cell.column.columnDef.minSize,
                        }}
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
    </div>
  );
}
