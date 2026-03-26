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
import {
  boardColumnForProject,
  dropIdToProjectColumn,
  isTouchBaseCustomer,
  rowAfterMoveToColumn,
  SALES_BOARD_DROP,
  touchBaseSortKey,
} from "@/lib/salesBoard";
import { cn } from "@/lib/utils";

const TOUCH_LIMIT = 20;

/** Scroll viewport height: fits ~3–4 cards (project rows) before vertical scroll. */
const COLUMN_BODY_MAX_H = "max-h-[36rem]";
const COLUMN_BODY_MIN_H = "min-h-[9rem]";

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
        "flex w-[min(100%,280px)] shrink-0 flex-col rounded-2xl border border-zinc-800/90 bg-zinc-900/40",
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
          </div>
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
    const cols: Record<
      "quoted_pending" | "won_wip" | "done" | "no_bid",
      DashboardProjectRow[]
    > = {
      quoted_pending: [],
      won_wip: [],
      done: [],
      no_bid: [],
    };
    for (const p of projects) {
      cols[boardColumnForProject(p)].push(p);
    }
    const num = (n: string | number | null | undefined) => {
      const x = typeof n === "number" ? n : parseInt(String(n ?? ""), 10);
      return Number.isFinite(x) ? x : 0;
    };
    for (const k of Object.keys(cols) as (keyof typeof cols)[]) {
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
        const targetCol = dropIdToProjectColumn(overId);
        if (!targetCol) return;

        const row = projects.find((p) => p.id === parsed.id);
        if (!row) return;
        const fromCol = boardColumnForProject(row);
        if (fromCol === targetCol) return;

        const nextLifecycle = rowAfterMoveToColumn(row, targetCol);
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

          <ColumnShell
            dropId={SALES_BOARD_DROP.quoted_pending}
            title="Quoted"
            subtitle="Pending approval"
            count={byColumn.quoted_pending.length}
          >
            {byColumn.quoted_pending.map((p) => (
              <DraggableProjectCard
                key={p.id}
                project={p}
                attention={attentionByProjectId.get(p.id)}
                formatUsd={formatUsd}
                disabled={dragDisabled}
              />
            ))}
          </ColumnShell>

          <ColumnShell
            dropId={SALES_BOARD_DROP.won_wip}
            title="Won (WIP)"
            subtitle="Accepted, in flight"
            count={byColumn.won_wip.length}
          >
            {byColumn.won_wip.map((p) => (
              <DraggableProjectCard
                key={p.id}
                project={p}
                attention={attentionByProjectId.get(p.id)}
                formatUsd={formatUsd}
                disabled={dragDisabled}
              />
            ))}
          </ColumnShell>

          <ColumnShell
            dropId={SALES_BOARD_DROP.done}
            title="Done"
            subtitle="Complete / done"
            count={byColumn.done.length}
          >
            {byColumn.done.map((p) => (
              <DraggableProjectCard
                key={p.id}
                project={p}
                attention={attentionByProjectId.get(p.id)}
                formatUsd={formatUsd}
                disabled={dragDisabled}
              />
            ))}
          </ColumnShell>

          <ColumnShell
            dropId={SALES_BOARD_DROP.no_bid}
            title="No bid"
            subtitle="Rejected / cancelled"
            count={byColumn.no_bid.length}
          >
            {byColumn.no_bid.map((p) => (
              <DraggableProjectCard
                key={p.id}
                project={p}
                attention={attentionByProjectId.get(p.id)}
                formatUsd={formatUsd}
                disabled={dragDisabled}
              />
            ))}
          </ColumnShell>
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
