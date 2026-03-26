"use client";

import { useState } from "react";
import { Plus, Trash2, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CustomerShippingRow } from "@/lib/customerQueries";
import { supabase } from "@/lib/supabaseClient";

const inputBase =
  "w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100";

type Draft = {
  label: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
};

const emptyDraft = (): Draft => ({
  label: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "",
});

export function CustomerShippingPanel({
  customerId,
  addresses,
  onRefresh,
}: {
  customerId: string;
  addresses: CustomerShippingRow[];
  onRefresh: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearOthersDefault = async () => {
    await supabase
      .from("customer_shipping_addresses")
      .update({ is_default: false })
      .eq("customer_id", customerId);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const isFirst = addresses.length === 0;
      if (draft.line1.trim() === "") {
        setError("Ship-to line 1 is required.");
        return;
      }
      const { error: insErr } = await supabase
        .from("customer_shipping_addresses")
        .insert({
          customer_id: customerId,
          label: draft.label.trim() || null,
          line1: draft.line1.trim(),
          line2: draft.line2.trim() || null,
          city: draft.city.trim() || null,
          state: draft.state.trim() || null,
          postal_code: draft.postal_code.trim() || null,
          country: draft.country.trim() || null,
          is_default: isFirst,
        });
      if (insErr) throw insErr;
      setDraft(emptyDraft());
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not add address.");
    } finally {
      setBusy(false);
    }
  };

  const setDefault = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await clearOthersDefault();
      const { error: u } = await supabase
        .from("customer_shipping_addresses")
        .update({ is_default: true })
        .eq("id", id);
      if (u) throw u;
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this shipping address?")) return;
    setBusy(true);
    setError(null);
    try {
      const { error: d } = await supabase
        .from("customer_shipping_addresses")
        .delete()
        .eq("id", id);
      if (d) throw d;
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/50 p-6">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Shipping addresses
      </h3>
      {error ? (
        <p className="mb-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="mb-6 space-y-3">
        {addresses.length === 0 ? (
          <li className="text-sm text-zinc-500">No ship-tos yet.</li>
        ) : (
          addresses.map((a) => (
            <li
              key={a.id}
              className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-white">
                    {a.label || "Ship-to"}
                  </span>
                  {a.is_default ? (
                    <span className="rounded-md bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-300 ring-1 ring-blue-500/30">
                      Default
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-zinc-400">
                  {[a.line1, a.line2].filter(Boolean).join(", ")}
                  <br />
                  {[a.city, a.state, a.postal_code].filter(Boolean).join(", ")}
                  {a.country ? ` · ${a.country}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {!a.is_default ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => setDefault(a.id)}
                    className="gap-1"
                  >
                    <Star className="size-3.5" />
                    Default
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => remove(a.id)}
                  className="gap-1 text-red-400 hover:text-red-300"
                >
                  <Trash2 className="size-3.5" />
                  Remove
                </Button>
              </div>
            </li>
          ))
        )}
      </ul>

      <form onSubmit={handleAdd} className="space-y-3 border-t border-zinc-800 pt-6">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Add ship-to
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-zinc-600">Label</label>
            <input
              value={draft.label}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
              className={inputBase}
              placeholder="Main plant"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-zinc-600">Line 1</label>
            <input
              value={draft.line1}
              onChange={(e) => setDraft((d) => ({ ...d, line1: e.target.value }))}
              className={inputBase}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-zinc-600">Line 2</label>
            <input
              value={draft.line2}
              onChange={(e) => setDraft((d) => ({ ...d, line2: e.target.value }))}
              className={inputBase}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-600">City</label>
            <input
              value={draft.city}
              onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
              className={inputBase}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-600">State</label>
            <input
              value={draft.state}
              onChange={(e) => setDraft((d) => ({ ...d, state: e.target.value }))}
              className={inputBase}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-600">Postal</label>
            <input
              value={draft.postal_code}
              onChange={(e) =>
                setDraft((d) => ({ ...d, postal_code: e.target.value }))
              }
              className={inputBase}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-600">Country</label>
            <input
              value={draft.country}
              onChange={(e) =>
                setDraft((d) => ({ ...d, country: e.target.value }))
              }
              className={inputBase}
            />
          </div>
        </div>
        <Button type="submit" size="sm" disabled={busy} className="gap-2">
          <Plus className="size-4" />
          Add address
        </Button>
      </form>
    </section>
  );
}
