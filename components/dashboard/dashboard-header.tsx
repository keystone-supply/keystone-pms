import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, LogOut, Users } from "lucide-react";

type DashboardHeaderProps = {
  userName: string | null | undefined;
  lastUpdated: Date | null;
  onSignOut: () => void;
  /** Defaults to “Operations dashboard”. */
  title?: string;
  /** Defaults to dashboard subtitle copy. */
  subtitle?: string;
  /** When false, hides the “Last updated …” line. */
  showLastUpdated?: boolean;
  /** Optional back navigation (e.g. dashboard from sub-pages). */
  backHref?: string;
  backLabel?: string;
};

function formatUpdated(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

const DEFAULT_TITLE = "Operations dashboard";
const DEFAULT_SUBTITLE =
  "Fabrication & manufacturing metrics at a glance — drill into projects and tools as you need detail.";

export function DashboardHeader({
  userName,
  lastUpdated,
  onSignOut,
  title = DEFAULT_TITLE,
  subtitle = DEFAULT_SUBTITLE,
  showLastUpdated = true,
  backHref,
  backLabel = "Back",
}: DashboardHeaderProps) {
  return (
    <header className="flex flex-col gap-6 border-b border-zinc-800/90 pb-8 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <Image
          src="/logo.png"
          alt="Keystone Supply"
          width={220}
          height={108}
          priority
          className="h-auto w-48 shrink-0 rounded-2xl opacity-95 shadow-[0_12px_40px_-16px_rgba(59,130,246,0.45)] sm:w-56"
        />
        <div>
          {backHref ? (
            <Link
              href={backHref}
              className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
            >
              <ArrowLeft className="size-4 shrink-0" aria-hidden />
              {backLabel}
            </Link>
          ) : null}
          <p className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-sm font-semibold uppercase tracking-[0.2em] text-transparent">
            Keystone PMS
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-500">{subtitle}</p>
          {showLastUpdated ? (
            <p className="mt-2 text-xs text-zinc-600">
              Last updated {formatUpdated(lastUpdated)}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/90 px-4 py-2 text-sm font-medium text-zinc-200">
          <Users className="size-4 text-zinc-500" aria-hidden />
          <span className="max-w-[12rem] truncate">
            {userName ?? "User"}
          </span>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:border-rose-500/40 hover:text-rose-300"
          title="Sign out"
        >
          <LogOut className="size-4" aria-hidden />
          Sign out
        </button>
      </div>
    </header>
  );
}
