"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiJson } from "@/app/admin/users/actions";

type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  auth_provider: "credentials" | "azure_ad";
  is_active: boolean;
  capabilityCount: number;
  projectAccessCount: number;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiJson<{ users: UserRow[] }>("/api/admin/users")
      .then((payload) => setUsers(payload.users))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load users."));
  }, []);

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3 text-xs text-zinc-400">
        Assign broad permissions with capabilities first, then tighten write access per project.
      </div>

      {error ? (
        <p className="rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-zinc-800/90 bg-zinc-900/45">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-950/40 text-zinc-400">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Caps</th>
              <th className="px-4 py-3">Projects</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-t border-zinc-800 text-zinc-200 transition-colors hover:bg-zinc-900/70"
              >
                <td className="px-4 py-3 font-mono text-xs">{user.email}</td>
                <td className="px-4 py-3">{user.display_name ?? "—"}</td>
                <td className="px-4 py-3">{user.auth_provider}</td>
                <td className="px-4 py-3">{user.is_active ? "yes" : "no"}</td>
                <td className="px-4 py-3">{user.capabilityCount}</td>
                <td className="px-4 py-3">{user.projectAccessCount}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="rounded-lg border border-blue-500/35 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-500/20"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
