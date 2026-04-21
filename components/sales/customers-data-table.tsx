"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  createColumnHelper,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp, Eye } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CustomerRow, CustomerStatus } from "@/lib/customerQueries";
import { formatRiversideDateWithMt } from "@/lib/time/riversideDisplay";
import { cn } from "@/lib/utils";

function formatFollowUp(raw: string | null | undefined): string {
  return formatRiversideDateWithMt(raw);
}

function statusBadgeClass(s: CustomerStatus): string {
  if (s === "active")
    return "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30";
  if (s === "prospect")
    return "bg-amber-500/10 text-amber-400 ring-amber-500/30";
  return "bg-zinc-500/10 text-zinc-400 ring-zinc-500/30";
}

const columnHelper = createColumnHelper<CustomerRow>();

const columns = [
  columnHelper.accessor((row) => row.legal_name, {
    id: "legal_name",
    header: "Legal name",
    cell: (info) => (
      <Link
        href={`/sales/customers/${info.row.original.id}`}
        className="font-medium text-blue-400 hover:text-blue-300"
      >
        {info.getValue()}
      </Link>
    ),
    sortingFn: (a, b) =>
      a.original.legal_name.localeCompare(b.original.legal_name, undefined, {
        sensitivity: "base",
      }),
  }),
  columnHelper.accessor((row) => row.account_code, {
    id: "account_code",
    header: "Acct #",
    cell: (info) => (
      <span className="font-mono text-sm text-zinc-300">
        {(info.getValue() as string | null) || "—"}
      </span>
    ),
  }),
  columnHelper.accessor((row) => row.contact_name, {
    id: "contact_name",
    header: "Contact",
    cell: (info) => (
      <span className="max-w-[10rem] truncate text-zinc-300">
        {(info.getValue() as string | null) || "—"}
      </span>
    ),
  }),
  columnHelper.accessor(
    (row) =>
      [row.billing_city, row.billing_state].filter(Boolean).join(", ") || "—",
    {
      id: "location",
      header: "City / state",
      cell: (info) => (
        <span className="text-sm text-zinc-400">{info.getValue() as string}</span>
      ),
    },
  ),
  columnHelper.accessor((row) => row.payment_terms, {
    id: "payment_terms",
    header: "Terms",
    cell: (info) => (
      <span className="max-w-[8rem] truncate text-sm text-zinc-400">
        {(info.getValue() as string | null) || "—"}
      </span>
    ),
  }),
  columnHelper.accessor((row) => row.status, {
    id: "status",
    header: "Status",
    cell: (info) => {
      const s = info.getValue() as CustomerStatus;
      return (
        <Badge
          variant="outline"
          className={cn(
            "border-0 px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset",
            statusBadgeClass(s),
          )}
        >
          {s}
        </Badge>
      );
    },
  }),
  columnHelper.accessor((row) => row.follow_up_at, {
    id: "follow_up_at",
    header: "Follow-up",
    cell: (info) => {
      const row = info.row.original;
      const at = info.getValue() as string | null;
      const paused =
        at != null &&
        at !== "" &&
        row.follow_up_active === false;
      return (
        <span className="whitespace-nowrap tabular-nums text-sm text-zinc-400">
          {formatFollowUp(at)}
          {paused ? (
            <span className="ml-1.5 text-zinc-600">(off)</span>
          ) : null}
        </span>
      );
    },
    sortingFn: (a, b) => {
      const ta = a.original.follow_up_at
        ? new Date(a.original.follow_up_at).getTime()
        : 0;
      const tb = b.original.follow_up_at
        ? new Date(b.original.follow_up_at).getTime()
        : 0;
      return ta - tb;
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <Link
        href={`/sales/customers/${row.original.id}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 hover:text-blue-300"
      >
        <Eye className="size-4" aria-hidden />
        Open
      </Link>
    ),
    enableSorting: false,
  }),
];

export type CustomerStatusFilter = "all" | CustomerStatus;

export function CustomersDataTable({
  data,
  statusFilter,
  search,
}: {
  data: CustomerRow[];
  statusFilter: CustomerStatusFilter;
  search: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "legal_name", desc: false },
  ]);

  const filtered = useMemo(() => {
    let rows = data;
    if (statusFilter !== "all") {
      rows = rows.filter((r) => r.status === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        const hay = [
          r.legal_name,
          r.account_code,
          r.contact_name,
          r.contact_email,
          r.billing_city,
          r.payment_terms,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return rows;
  }, [data, statusFilter, search]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table hook is intentionally used here.
  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500">
        {filtered.length} account{filtered.length === 1 ? "" : "s"}
        {statusFilter !== "all" ? ` · status: ${statusFilter}` : ""}
      </p>
      <div className="overflow-x-auto rounded-2xl border border-zinc-800/90 bg-zinc-900/40">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow
                key={hg.id}
                className="border-zinc-800 hover:bg-transparent"
              >
                {hg.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="text-zinc-400"
                    aria-sort={
                      header.column.getIsSorted() === "asc"
                        ? "ascending"
                        : header.column.getIsSorted() === "desc"
                          ? "descending"
                          : undefined
                    }
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-medium text-zinc-300 hover:text-white"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {header.column.getIsSorted() === "asc" ? (
                          <ChevronUp className="size-3.5 opacity-80" />
                        ) : header.column.getIsSorted() === "desc" ? (
                          <ChevronDown className="size-3.5 opacity-80" />
                        ) : null}
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableCell
                  colSpan={columns.length}
                  className="py-10 text-center text-zinc-500"
                >
                  No accounts match your filters.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-zinc-800/80 hover:bg-zinc-800/30"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="text-zinc-200">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
