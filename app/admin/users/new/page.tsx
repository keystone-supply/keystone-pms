"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { APP_CAPABILITIES } from "@/lib/auth/roles";
import { apiJson } from "@/app/admin/users/actions";

export default function NewAdminUserPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authProvider, setAuthProvider] = useState<"credentials" | "azure_ad">("azure_ad");
  const [password, setPassword] = useState("");
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>(["read_projects"]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setSaving(true);
        setError(null);
        void apiJson<{ userId: string }>("/api/admin/users", {
          method: "POST",
          body: JSON.stringify({
            email,
            displayName,
            authProvider,
            password: authProvider === "credentials" ? password : undefined,
            capabilities: selectedCapabilities,
          }),
        })
          .then((payload) => router.push(`/admin/users/${payload.userId}`))
          .catch((err) => setError(err instanceof Error ? err.message : "Could not create user."))
          .finally(() => setSaving(false));
      }}
    >
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3 text-xs text-zinc-400">
        Use Azure AD for SSO users; use credentials only for local app-only accounts.
      </div>

      {error ? (
        <p className="rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/45 p-5">
        <h2 className="mb-4 text-base font-semibold text-white">Identity</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-zinc-200">
            Email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-200">
            Display name
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-200">
            Auth provider
            <select
              value={authProvider}
              onChange={(event) =>
                setAuthProvider(event.target.value as "credentials" | "azure_ad")
              }
              className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
            >
              <option value="azure_ad">azure_ad</option>
              <option value="credentials">credentials</option>
            </select>
          </label>
          {authProvider === "credentials" ? (
            <label className="flex flex-col gap-1 text-sm text-zinc-200">
              Password
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2"
                required
              />
            </label>
          ) : null}
        </div>
      </section>

      <fieldset className="rounded-2xl border border-zinc-800/90 bg-zinc-900/45 p-5">
        <legend className="px-2 text-sm font-medium text-zinc-300">Capabilities</legend>
        <p className="mb-3 text-xs text-zinc-500">
          Start with baseline read scopes, then tighten write and admin capabilities as needed.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {APP_CAPABILITIES.map((capability) => {
            const checked = selectedCapabilities.includes(capability);
            return (
              <label key={capability} className="flex items-center gap-2 text-sm text-zinc-200">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    setSelectedCapabilities((prev) =>
                      event.target.checked
                        ? [...prev, capability]
                        : prev.filter((item) => item !== capability),
                    );
                  }}
                />
                {capability}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create user"}
        </button>
        <Link
          href="/admin/users"
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
