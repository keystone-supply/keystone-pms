import Link from "next/link";
import {
  Briefcase,
  FolderOpen,
  LayoutDashboard,
  Layers,
  Package,
  Plus,
  Scale,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  canAccessSales,
  canCreateProjects,
  canManageUsers,
  canRunNesting,
  type AppCapabilitySet,
} from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

/** Active nav: blue border glow + KPI-style bottom accent (via-blue ~ metric cards). */
const quickLinkActiveClassName = cn(
  "relative z-[1] overflow-hidden border-blue-400/90 bg-blue-500/15 text-blue-50",
  "shadow-[inset_0_1px_0_0_rgba(191,219,254,0.22),0_0_0_1px_rgba(96,165,250,0.5),0_6px_22px_-6px_rgba(59,130,246,0.48)]",
  "after:pointer-events-none after:absolute after:inset-x-2 after:bottom-0 after:z-[2] after:h-px after:bg-gradient-to-r after:from-transparent after:via-blue-400/70 after:to-transparent",
);

export function QuickLinksBar({
  openQuotesCount,
  activeHref,
  newProjectHref = "/new-project",
  capabilities,
}: {
  openQuotesCount: number;
  /** Highlights the matching nav link. Use `"/"` on the home dashboard (Dashboard control refreshes the page). */
  activeHref?: string;
  /** e.g. `/new-project?returnTo=%2Fprojects` so Back returns to jobs list. */
  newProjectHref?: string;
  capabilities?: AppCapabilitySet;
}) {
  const onDashboard = activeHref === "/";
  const showSales = capabilities == null ? true : canAccessSales(capabilities);
  const showNewProject = capabilities == null ? true : canCreateProjects(capabilities);
  const showNest = capabilities == null ? true : canRunNesting(capabilities);
  const showAdmin = capabilities == null ? false : canManageUsers(capabilities);

  return (
    <nav
      aria-label="Quick actions"
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-3"
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {onDashboard ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("gap-2", quickLinkActiveClassName)}
            aria-current="page"
            onClick={() => window.location.reload()}
          >
            <LayoutDashboard className="size-4" />
            Dashboard
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link href="/" className="gap-2">
              <LayoutDashboard className="size-4" />
              Dashboard
            </Link>
          </Button>
        )}
        <Button variant="outline" size="sm" asChild>
          <Link
            href="/projects"
            className={cn(
              "gap-2",
              activeHref === "/projects" && quickLinkActiveClassName,
            )}
            aria-current={activeHref === "/projects" ? "page" : undefined}
          >
            <FolderOpen className="size-4" />
            All projects
            {openQuotesCount > 0 ? (
              <Badge
                variant="destructive"
                className="ml-1 min-w-5 justify-center px-1.5"
              >
                {openQuotesCount}
              </Badge>
            ) : null}
          </Link>
        </Button>
        {showSales ? (
          <Button variant="outline" size="sm" asChild>
            <Link
              href="/sales"
              className={cn(
                "gap-2",
                activeHref === "/sales" && quickLinkActiveClassName,
              )}
              aria-current={activeHref === "/sales" ? "page" : undefined}
            >
              <Briefcase className="size-4" />
              Sales
            </Link>
          </Button>
        ) : null}
        {showNest ? (
          <Button variant="outline" size="sm" asChild>
            <Link
              href="/nest-remnants"
              className={cn(
                "gap-2",
                activeHref === "/nest-remnants" && quickLinkActiveClassName,
              )}
              aria-current={activeHref === "/nest-remnants" ? "page" : undefined}
            >
              <span className="relative inline-flex">
                <Layers className="size-4 text-violet-300" />
                <Package className="size-4 -ml-1 text-cyan-300" />
              </span>
              Nest &amp; remnants
            </Link>
          </Button>
        ) : null}
        <Button variant="outline" size="sm" asChild>
          <Link
            href="/weight-calc"
            className={cn(
              "gap-2",
              (activeHref === "/weight-calc" || activeHref === "/pipad-calc") &&
                quickLinkActiveClassName,
            )}
            aria-current={
              activeHref === "/weight-calc" || activeHref === "/pipad-calc"
                ? "page"
                : undefined
            }
          >
            <Scale className="size-4" />
            Shop calc
          </Link>
        </Button>
        {showAdmin ? (
          <Button variant="outline" size="sm" asChild>
            <Link
              href="/admin/users"
              className={cn(
                "gap-2",
                activeHref?.startsWith("/admin") && quickLinkActiveClassName,
              )}
              aria-current={activeHref?.startsWith("/admin") ? "page" : undefined}
            >
              Admin users
            </Link>
          </Button>
        ) : null}
      </div>
      {showNewProject ? (
        <div className="flex w-full shrink-0 justify-end sm:w-auto sm:justify-start">
          <Button variant="secondary" size="sm" asChild>
            <Link href={newProjectHref} className="gap-2">
              <Plus className="size-4" />
              New project
            </Link>
          </Button>
        </div>
      ) : null}
    </nav>
  );
}
