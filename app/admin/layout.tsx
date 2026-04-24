"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { QuickLinksBar } from "@/components/dashboard/quick-links-bar";
import { canManageUsers } from "@/lib/auth/roles";
import { getSessionCapabilitySet } from "@/lib/auth/session-capabilities";
import { cn } from "@/lib/utils";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const capabilities = getSessionCapabilitySet(session);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-100">
        Loading admin…
      </div>
    );
  }
  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-8 text-center text-zinc-200">
        Sign in to access admin user management.
      </div>
    );
  }
  if (!canManageUsers(capabilities)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-8 text-center text-zinc-200">
        Your account does not have permission to manage users.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-[132rem] px-4 py-8 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 lg:py-10">
        <DashboardHeader
          userName={session?.user?.name}
          lastUpdated={null}
          onSignOut={() => signOut({ callbackUrl: "/" })}
          title="Admin users"
          subtitle="Manage identity, capability scopes, and per-project access with the same Keystone dashboard controls."
          showLastUpdated={false}
        />

        <div className="mt-8">
          <QuickLinksBar
            openQuotesCount={0}
            activeHref={pathname}
            newProjectHref="/new-project?returnTo=%2Fadmin%2Fusers"
            capabilities={capabilities}
          />
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-3">
          <Link
            href="/admin/users"
            className={cn(
              "rounded-lg px-3 py-2 text-sm transition-colors",
              pathname === "/admin/users"
                ? "bg-zinc-700 text-white"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white",
            )}
          >
            Users
          </Link>
          <Link
            href="/admin/users/new"
            className={cn(
              "rounded-lg px-3 py-2 text-sm transition-colors",
              pathname === "/admin/users/new"
                ? "bg-zinc-700 text-white"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white",
            )}
          >
            New user
          </Link>
          <p className="ml-auto text-xs text-zinc-500">
            Role and project access changes apply immediately after save.
          </p>
        </div>

        <div className="mt-8">
          <div className="rounded-3xl border border-zinc-800/90 bg-zinc-900/55 p-5 sm:p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
