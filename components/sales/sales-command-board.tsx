/** Horizontal sales command board: CRM touch + project pipeline with dnd-kit. */
"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  type DragEndEvent,
  type DragStartEvent,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, GripVertical, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { AttentionItem } from "@/lib/dashboardMetrics";
import { classifySupplyIndustrial } from "@/lib/dashboardMetrics";
import type { DashboardProjectRow } from "@/lib/dashboardMetrics";
import type { CustomerRow } from "@/lib/customerQueries";
import { supabase } from "@/lib/supabaseClient";
import { pickProjectUpdatePayload } from "@/lib/projectTypes";
import type { SalesProjectColumn } from "@/lib/salesBoard";
import {
  boardColumnForProject,
  dropIdToMoveTarget,
  isTouchBaseCustomer,
  moveTargetFromRow,
  rowAfterMoveToColumn,
  SALES_BOARD_DROP,
  touchBaseSortKey,
} from "@/lib/salesBoard";
import { SALES_PROJECT_COLUMNS } from "@/lib/salesCommandBoardColumn";
import { cn } from "@/lib/utils";

const TOUCH_LIMIT = 20;

/** Scroll viewport height: fits ~3–4 cards (project rows) before vertical scroll. */
const COLUMN_BODY_MAX_H = "max-h-[36rem]";
const COLUMN_BODY_MIN_H = "min-h-[9rem]";

const PIPELINE_COLUMNS: Array<{
  key: Exclude<SalesProjectColumn, "lost">;
  dropId: string;
  title: string;
  subtitle: string;
}> = [
  {
    key: "rfq_customer",
    dropId: SALES_BOARD_DROP.rfq_customer,
    title: "RFQ",
    subtitle: "From customer",
  },
  {
    key: "rfq_vendors",
    dropId: SALES_BOARD_DROP.rfq_vendors,
    title: "RFQ → vendors",
    subtitle: "Sent for quote",
  },
  {
    key: "quote_sent",
    dropId: SALES_BOARD_DROP.quote_sent,
    title: "Quote sent",
    subtitle: "Awaiting PO",
  },
  {
    key: "po_issued",
    dropId: SALES_BOARD_DROP.po_issued,
    title: "Customer PO",
    subtitle: "Accepted",
  },
  {
    key: "in_process",
    dropId: SALES_BOARD_DROP.in_process,
    title: "In process",
    subtitle: "Shop / ops",
  },
  {
    key: "complete",
    dropId: SALES_BOARD_DROP.complete,
    title: "Complete",
    subtitle: "Job done",
  },
  {
    key: "delivered",
    dropId: SALES_BOARD_DROP.delivered,
    title: "Delivered",
    subtitle: "Shipped / received",
  },
  {
    key: "invoiced",
    dropId: SALES_BOARD_DROP.invoiced,
    title: "Invoiced",
    subtitle: "Billing",
  },
];

function formatShortDate(iso: string | null | undefined): string | null {
  if (iso == null || String(iso).trim() === "") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function milestoneHint(project: DashboardProjectRow): string | null {
  const col = boardColumnForProject(project);
  switch (col) {
    case "rfq_customer": {
      const d = formatShortDate(project.created_at);
      return d ? `Logged ${d}` : null;
    }
    case "rfq_vendors": {
      const d = formatShortDate(project.rfq_vendors_sent_at);
      return d ? `Vendors ${d}` : null;
    }
    case "quote_sent": {
      const d = formatShortDate(project.quote_sent_at);
      return d ? `Quoted ${d}` : null;
    }
    case "po_issued": {
      const d = formatShortDate(project.po_issued_at);
      return d ? `PO ${d}` : null;
    }
    case "in_process": {
      const d = formatShortDate(project.in_process_at);
      return d ? `Started ${d}` : null;
    }
    case "complete": {
      const d = formatShortDate(project.completed_at);
      return d ? `Done ${d}` : null;
    }
    case "delivered": {
      const d = formatShortDate(project.delivered_at);
      return d ? `Delivered ${d}` : null;
    }
    case "invoiced": {
      const d = formatShortDate(project.invoiced_at);
      return d ? `Invoiced ${d}` : null;
    }
    case "lost":
    default:
      return null;
  }
}

function dragIdProject(id: string) {
  return `project:${id}`;
}

function dragIdCustomer(id: string) {
  return `customer:${id}`;
}

function parseDragId(
  raw: string | number,
): { kind: "project" | "customer"; id: string } | null {
  const s = String(raw);
  if (s.startsWith("project:")) {
    return { kind: "project", id: s.slice("project:".length) };
  }
  if (s.startsWith("customer:")) {
    return { kind: "customer", id: s.slice("customer:".length) };
  }
  return null;
}

type SalesCommandBoardProps = {
  projects: DashboardProjectRow[];
  setProjects: React.Dispatch<React.SetStateAction<DashboardProjectRow[]>>;
  customers: CustomerRow[];
  setCustomers: React.Dispatch<React.SetStateAction<CustomerRow[]>>;
  attentionByProjectId: Map<string, AttentionItem>;
  formatUsd: (n: number) => string;
};

function ColumnShell({
  dropId,
  title,
  subtitle,
  count,
  children,
  className,
}: {
  dropId: string;
  title: string;
  subtitle?: string;
  count: number;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[min(100%,240px)] shrink-0 flex-col rounded-2xl border border-zinc-800/90 bg-zinc-900/40",
        isOver && "ring-2 ring-blue-500/50 ring-offset-2 ring-offset-zinc-950",
        className,
      )}
    >
      <div className="shrink-0 border-b border-zinc-800/80 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <span className="font-mono text-xs tabular-nums text-zinc-500">
            {count}
          </span>
        </div>
        {subtitle ? (
          <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
        ) : null}
      </div>
      <div
        className={cn(
          "min-h-0 flex flex-col gap-2 overflow-y-auto overflow-x-hidden overscroll-y-contain p-2",
          COLUMN_BODY_MIN_H,
          COLUMN_BODY_MAX_H,
        )}
      >
        {children}
      </div>
    </div>
  );
}

function LostDropStrip({
  id,
  label,
}: {
  id: string;
  label: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-10 flex-1 rounded-lg border border-dashed border-zinc-600 px-1 py-2 text-center text-[10px] font-medium leading-tight text-zinc-500",
        isOver && "border-blue-500/50 bg-blue-950/25 text-zinc-300",
      )}
    >
      {label}
    </div>
  );
}

function LostColumn({
  projects,
  attentionByProjectId,
  formatUsd,
  dragDisabled,
}: {
  projects: DashboardProjectRow[];
  attentionByProjectId: Map<string, AttentionItem>;
  formatUsd: (n: number) => string;
  dragDisabled: boolean;
}) {
  const num = (n: string | number | null | undefined) => {
    const x = typeof n === "number" ? n : parseInt(String(n ?? ""), 10);
    return Number.isFinite(x) ? x : 0;
  };
  const sorted = [...projects].sort(
    (a, b) => num(b.project_number) - num(a.project_number),
  );

  return (
    <div
      className={cn(
        "flex w-[min(100%,260px)] shrink-0 flex-col rounded-2xl border border-zinc-800/90 bg-zinc-900/40",
      )}
    >
      <div className="shrink-0 border-b border-zinc-800/80 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">Lost</h3>
          <span className="font-mono text-xs tabular-nums text-zinc-500">
            {projects.length}
          </span>
        </div>
        <p className="mt-1 text-xs text-zinc-500">Rejected or cancelled</p>
        <div className="mt-2 flex gap-1.5">
          <LostDropStrip
            id={SALES_BOARD_DROP.lost_rejected}
            label="Drop → rejected"
          />
          <LostDropStrip
            id={SALES_BOARD_DROP.lost_cancelled}
            label="Drop → cancelled"
          />
        </div>
      </div>
      <div
        className={cn(
          "min-h-0 flex flex-col gap-2 overflow-y-auto overflow-x-hidden overscroll-y-contain p-2",
          COLUMN_BODY_MIN_H,
          COLUMN_BODY_MAX_H,
        )}
      >
        {sorted.map((p) => (
          <DraggableProjectCard
            key={p.id}
            project={p}
            attention={attentionByProjectId.get(p.id)}
            formatUsd={formatUsd}
            disabled={dragDisabled}
          />
        ))}
      </div>
    </div>
  );
}

function ProjectCardInner({
  project,
  attention,
  formatUsd,
  dragging,
}: {
  project: DashboardProjectRow;
  attention: AttentionItem | undefined;
  formatUsd: (n: number) => string;
  dragging?: boolean;
}) {
  const si = classifySupplyIndustrial(project.supply_industrial);
  const quoted = project.total_quoted || 0;
  const milestoneLine = milestoneHint(project);

  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-700/90 bg-zinc-950/80 p-3 shadow-sm",
        dragging && "opacity-90 shadow-lg",
      )}
    >
      <div className="flex items-start gap-2">
        <GripVertical
          className="mt-0.5 size-4 shrink-0 text-zinc-600"
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="font-mono text-xs text-zinc-500">
              #{project.project_number ?? "—"}
            </p>
            <p className="truncate text-sm font-medium text-zinc-100">
              {project.project_name || "—"}
            </p>
            <p className="truncate text-xs text-zinc-500">
              {project.customer || "—"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs text-amber-200/90">
              {formatUsd(quoted)}
            </span>
            {si === "supply" ? (
              <Badge className="text-[10px]">Supply</Badge>
            ) : si === "industrial" ? (
              <Badge className="bg-violet-500/15 text-[10px] text-violet-300">
                Industrial
              </Badge>
            ) : null}
            {boardColumnForProject(project) === "lost" ? (
              String(project.customer_approval || "").toUpperCase() ===
              "CANCELLED" ? (
                <Badge className="bg-zinc-500/15 text-[10px] text-zinc-300">
                  Cancelled
                </Badge>
              ) : (
                <Badge className="bg-red-500/15 text-[10px] text-red-300">
                  Rejected
                </Badge>
              )
            ) : null}
          </div>
          {milestoneLine ? (
            <p className="text-[10px] text-zinc-500">{milestoneLine}</p>
          ) : null}
          {attention ? (
            <p className="flex items-start gap-1 text-xs text-amber-400/95">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{attention.reason}</span>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href={`/projects/${project.id}`}
              className="text-xs font-medium text-blue-400 hover:text-blue-300"
              onPointerDown={(e) => e.stopPropagation()}
            >
              Job →
            </Link>
            {project.customer_id ? (
              <Link
                href={`/sales/customers/${project.customer_id}`}
                className="text-xs font-medium text-blue-400/90 hover:text-blue-300"
                onPointerDown={(e) => e.stopPropagation()}
              >
                Account →
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function DraggableProjectCard({
  project,
  attention,
  formatUsd,
  disabled,
}: {
  project: DashboardProjectRow;
  attention: AttentionItem | undefined;
  formatUsd: (n: number) => string;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: dragIdProject(project.id),
      disabled,
      data: { kind: "project" as const, project },
    });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-40")}>
      <div {...listeners} {...attributes} className={cn(disabled && "cursor-not-allowed")}>
        <ProjectCardInner
          project={project}
          attention={attention}
          formatUsd={formatUsd}
        />
      </div>
    </div>
  );
}

function CustomerCardInner({
  customer,
  now,
  dragging,
}: {
  customer: CustomerRow;
  now: Date;
  dragging?: boolean;
}) {
  const bucket = (() => {
    const t = customer.follow_up_at ? new Date(customer.follow_up_at).getTime() : NaN;
    if (Number.isNaN(t)) return null as "overdue" | "week" | null;
    if (t < now.getTime()) return "overdue" as const;
    if (t <= now.getTime() + 7 * 86400000) return "week" as const;
    return null;
  })();

  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-700/90 bg-zinc-950/80 p-3 shadow-sm",
        dragging && "opacity-90 shadow-lg",
      )}
    >
      <div className="flex items-start gap-2">
        <User className="mt-0.5 size-4 shrink-0 text-zinc-500" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-medium text-zinc-100">
            {customer.legal_name}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Badge
              className={cn(
                "text-[10px]",
                customer.status === "prospect" && "bg-amber-500/15 text-amber-300",
                customer.status === "active" && "bg-emerald-500/15 text-emerald-300",
                customer.status === "inactive" && "bg-zinc-500/15 text-zinc-400",
              )}
            >
              {customer.status}
            </Badge>
            {bucket === "overdue" ? (
              <span className="text-[10px] text-red-400">Overdue</span>
            ) : bucket === "week" ? (
              <span className="text-[10px] text-amber-400">This week</span>
            ) : null}
          </div>
          <Link
            href={`/sales/customers/${customer.id}`}
            className="inline-block text-xs font-medium text-blue-400 hover:text-blue-300"
            onPointerDown={(e) => e.stopPropagation()}
          >
            Open account →
          </Link>
        </div>
      </div>
    </div>
  );
}

function DraggableCustomerCard({
  customer,
  now,
  disabled,
}: {
  customer: CustomerRow;
  now: Date;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: dragIdCustomer(customer.id),
      disabled,
      data: { kind: "customer" as const, customer },
    });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-40")}>
      <div {...listeners} {...attributes} className={cn(disabled && "cursor-not-allowed")}>
        <CustomerCardInner customer={customer} now={now} />
      </div>
    </div>
  );
}

export function SalesCommandBoard({
  projects,
  setProjects,
  customers,
  setCustomers,
  attentionByProjectId,
  formatUsd,
}: SalesCommandBoardProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<{
    kind: "project" | "customer";
    id: string;
  } | null>(null);

  const now = useMemo(() => new Date(), []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const touchCustomers = useMemo(() => {
    const list = customers.filter((c) => isTouchBaseCustomer(c, now));
    list.sort((a, b) => {
      const ka = touchBaseSortKey(a, now);
      const kb = touchBaseSortKey(b, now);
      if (ka[0] !== kb[0]) return ka[0] - kb[0];
      if (ka[1] !== kb[1]) return ka[1] - kb[1];
      return ka[2].localeCompare(kb[2]);
    });
    return list.slice(0, TOUCH_LIMIT);
  }, [customers, now]);

  const byColumn = useMemo(() => {
    const cols = {} as Record<SalesProjectColumn, DashboardProjectRow[]>;
    for (const c of SALES_PROJECT_COLUMNS) cols[c] = [];
    for (const p of projects) {
      cols[boardColumnForProject(p)].push(p);
    }
    const num = (n: string | number | null | undefined) => {
      const x = typeof n === "number" ? n : parseInt(String(n ?? ""), 10);
      return Number.isFinite(x) ? x : 0;
    };
    for (const k of SALES_PROJECT_COLUMNS) {
      cols[k].sort((a, b) => num(b.project_number) - num(a.project_number));
    }
    return cols;
  }, [projects]);

  const activeProject =
    active?.kind === "project"
      ? projects.find((p) => p.id === active.id)
      : undefined;
  const activeCustomer =
    active?.kind === "customer"
      ? customers.find((c) => c.id === active.id)
      : undefined;

  const onDragStart = useCallback((e: DragStartEvent) => {
    const parsed = parseDragId(e.active.id);
    if (parsed) setActive({ kind: parsed.kind, id: parsed.id });
  }, []);

  const onDragEnd = useCallback(
    async (e: DragEndEvent) => {
      const parsed = parseDragId(e.active.id);
      setActive(null);
      if (!parsed || !e.over) return;

      const overId = String(e.over.id);

      if (parsed.kind === "customer") {
        if (overId !== SALES_BOARD_DROP.qualify) return;
        const row = customers.find((c) => c.id === parsed.id);
        if (!row || row.status !== "prospect") return;

        setError(null);
        setBusyId(parsed.id);
        const prev = customers;
        setCustomers((cs) =>
          cs.map((c) => (c.id === parsed.id ? { ...c, status: "active" } : c)),
        );
        const { error: upErr } = await supabase
          .from("customers")
          .update({ status: "active" })
          .eq("id", parsed.id);
        setBusyId(null);
        if (upErr) {
          setCustomers(prev);
          setError(upErr.message);
        }
        return;
      }

      if (parsed.kind === "project") {
        const targetMove = dropIdToMoveTarget(overId);
        if (!targetMove) return;

        const row = projects.find((p) => p.id === parsed.id);
        if (!row) return;
        if (moveTargetFromRow(row) === targetMove) return;

        const nextLifecycle = rowAfterMoveToColumn(row, targetMove, new Date());
        const payload = pickProjectUpdatePayload(nextLifecycle);
        setError(null);
        setBusyId(parsed.id);
        const prev = projects;
        const nextRow = { ...row, ...nextLifecycle } as DashboardProjectRow;
        setProjects((ps) =>
          ps.map((p) => (p.id === parsed.id ? nextRow : p)),
        );

        const { error: upErr } = await supabase
          .from("projects")
          .update(payload)
          .eq("id", parsed.id);

        setBusyId(null);
        if (upErr) {
          setProjects(prev);
          setError(upErr.message);
        }
      }
    },
    [customers, projects, setCustomers, setProjects],
  );

  const onDragCancel = useCallback(() => setActive(null), []);

  const dragDisabled = busyId !== null;

  return (
    <section
      className="mt-10 rounded-2xl border border-zinc-800/90 bg-zinc-900/30 p-4 sm:p-6"
      aria-label="Sales command board"
    >
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Command board</h2>
          <p className="text-sm text-zinc-500">
            Drag accounts to <strong className="font-medium text-zinc-400">Qualify</strong>{" "}
            (prospects → active). Drag jobs between pipeline columns; changes save to Supabase.
          </p>
        </div>
      </div>

      {error ? (
        <p
          className="mb-4 rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="flex gap-3 overflow-x-auto pb-2">
          <ColumnShell
            dropId={SALES_BOARD_DROP.touch}
            title="Touch base"
            subtitle="Prospects & follow-ups"
            count={touchCustomers.length}
          >
            {touchCustomers.map((c) => (
              <DraggableCustomerCard
                key={c.id}
                customer={c}
                now={now}
                disabled={dragDisabled}
              />
            ))}
          </ColumnShell>

          <ColumnShell
            dropId={SALES_BOARD_DROP.qualify}
            title="Qualify"
            subtitle="Drop a prospect here → active"
            count={0}
            className="w-[min(100%,200px)]"
          >
            <p className="px-1 text-xs text-zinc-600">
              Prospect cards only. Drops update account status.
            </p>
          </ColumnShell>

          {PIPELINE_COLUMNS.map((col) => (
            <ColumnShell
              key={col.key}
              dropId={col.dropId}
              title={col.title}
              subtitle={col.subtitle}
              count={byColumn[col.key].length}
            >
              {byColumn[col.key].map((p) => (
                <DraggableProjectCard
                  key={p.id}
                  project={p}
                  attention={attentionByProjectId.get(p.id)}
                  formatUsd={formatUsd}
                  disabled={dragDisabled}
                />
              ))}
            </ColumnShell>
          ))}

          <LostColumn
            projects={byColumn.lost}
            attentionByProjectId={attentionByProjectId}
            formatUsd={formatUsd}
            dragDisabled={dragDisabled}
          />
        </div>

        <DragOverlay dropAnimation={null}>
          {activeProject ? (
            <ProjectCardInner
              project={activeProject}
              attention={attentionByProjectId.get(activeProject.id)}
              formatUsd={formatUsd}
              dragging
            />
          ) : activeCustomer ? (
            <CustomerCardInner customer={activeCustomer} now={now} dragging />
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}
