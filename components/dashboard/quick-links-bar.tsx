import Link from "next/link";
import {
  FolderOpen,
  Layers,
  Package,
  Plus,
  Scale,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function QuickLinksBar({
  openQuotesCount,
  activeHref,
  newProjectHref = "/new-project",
}: {
  openQuotesCount: number;
  /** Highlights the matching nav link (e.g. `/projects`). */
  activeHref?: string;
  /** e.g. `/new-project?returnTo=%2Fprojects` so Back returns to jobs list. */
  newProjectHref?: string;
}) {
  return (
    <nav
      aria-label="Quick actions"
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-3"
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link
            href="/projects"
            className={cn(
              "relative gap-2",
              activeHref === "/projects" &&
                "border-blue-500/50 bg-blue-500/10 text-blue-200",
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
        <Button variant="outline" size="sm" asChild>
          <Link
            href="/nest-remnants"
            className={cn(
              "gap-2",
              activeHref === "/nest-remnants" &&
                "border-blue-500/50 bg-blue-500/10 text-blue-200",
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
        <Button variant="outline" size="sm" asChild>
          <Link
            href="/weight-calc"
            className={cn(
              "gap-2",
              activeHref === "/weight-calc" &&
                "border-blue-500/50 bg-blue-500/10 text-blue-200",
            )}
            aria-current={activeHref === "/weight-calc" ? "page" : undefined}
          >
            <Scale className="size-4" />
            Weight calc
          </Link>
        </Button>
      </div>
      <div className="flex w-full shrink-0 justify-end sm:w-auto sm:justify-start">
        <Button variant="secondary" size="sm" asChild>
          <Link href={newProjectHref} className="gap-2">
            <Plus className="size-4" />
            New project
          </Link>
        </Button>
      </div>
    </nav>
  );
}
