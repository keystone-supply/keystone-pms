"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

import { canManageUsers } from "@/lib/auth/roles";
import { getSessionCapabilitySet } from "@/lib/auth/session-capabilities";

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
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Admin / Users</h1>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/users"
              className={`rounded-lg px-3 py-2 text-sm ${pathname === "/admin/users" ? "bg-zinc-700" : "bg-zinc-800 hover:bg-zinc-700"}`}
            >
              Users
            </Link>
            <Link
              href="/admin/users/new"
              className={`rounded-lg px-3 py-2 text-sm ${pathname === "/admin/users/new" ? "bg-zinc-700" : "bg-zinc-800 hover:bg-zinc-700"}`}
            >
              New user
            </Link>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
