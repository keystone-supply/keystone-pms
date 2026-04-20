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
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="mb-4 flex items-center justify-end">
        <Link href="/" className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs hover:bg-zinc-700">
          Back to dashboard
        </Link>
      </div>
      {error ? <p className="mb-3 text-sm text-red-300">{error}</p> : null}
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-zinc-400">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Provider</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2">Caps</th>
              <th className="px-3 py-2">Projects</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-zinc-800">
                <td className="px-3 py-2 font-mono text-xs">{user.email}</td>
                <td className="px-3 py-2">{user.display_name ?? "—"}</td>
                <td className="px-3 py-2">{user.auth_provider}</td>
                <td className="px-3 py-2">{user.is_active ? "yes" : "no"}</td>
                <td className="px-3 py-2">{user.capabilityCount}</td>
                <td className="px-3 py-2">{user.projectAccessCount}</td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs hover:bg-zinc-700"
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
