"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { ArrowLeft, Save } from "lucide-react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { QuickLinksBar } from "@/components/dashboard/quick-links-bar";
import {
  VendorAccountFields,
  type VendorFormState,
} from "@/components/sales/vendor-account-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import {
  VENDOR_DETAIL_SELECT,
  type VendorRow,
} from "@/lib/vendorQueries";
import {
  aggregateDashboardMetrics,
  type DashboardProjectRow,
} from "@/lib/dashboardMetrics";
import { withProjectSelectFallback } from "@/lib/projectQueries";
import { cn } from "@/lib/utils";
import { canManageCrm } from "@/lib/auth/roles";
import { getSessionCapabilitySet } from "@/lib/auth/session-capabilities";

function trimOrNull(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

function rowToForm(v: VendorRow): VendorFormState {
  return {
    legal_name: v.legal_name,
    account_code: v.account_code ?? "",
    contact_name: v.contact_name ?? "",
    contact_email: v.contact_email ?? "",
    contact_phone: v.contact_phone ?? "",
    billing_line1: v.billing_line1 ?? "",
    billing_line2: v.billing_line2 ?? "",
    billing_city: v.billing_city ?? "",
    billing_state: v.billing_state ?? "",
    billing_postal_code: v.billing_postal_code ?? "",
    billing_country: v.billing_country ?? "",
    payment_terms: v.payment_terms ?? "",
    status: v.status,
    notes: v.notes ?? "",
  };
}

function statusBadgeClass(s: string): string {
  if (s === "active")
    return "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30";
  return "bg-zinc-500/10 text-zinc-400 ring-zinc-500/30";
}

export default function VendorDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const { data: session, status } = useSession();
  const capabilities = getSessionCapabilitySet(session);

  const [vendor, setVendor] = useState<VendorRow | null>(null);
  const [form, setForm] = useState<VendorFormState | null>(null);
  const [openQuotes, setOpenQuotes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadVendor = useCallback(async (): Promise<VendorRow | null> => {
    if (!id) return null;
    const { data, error: qErr } = await supabase
      .from("vendors")
      .select(VENDOR_DETAIL_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (qErr) throw qErr;
    if (!data) {
      setVendor(null);
      setForm(null);
      return null;
    }
    const row = data as VendorRow;
    setVendor(row);
    setForm(rowToForm(row));
    return row;
  }, [id]);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      await loadVendor();
      setLastUpdated(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load vendor.");
    } finally {
      setLoading(false);
    }
  }, [id, loadVendor]);

  useEffect(() => {
    if (status !== "authenticated" || !id) return;
    void refresh();
  }, [status, id, refresh]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    void withProjectSelectFallback((select) =>
      supabase.from("projects").select(select),
    ).then(({ data, error: e }) => {
        if (cancelled || e || !data) return;
        setOpenQuotes(
          aggregateDashboardMetrics(data as DashboardProjectRow[]).openQuotes,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated" || !id) return;
    const ch = supabase
      .channel(`vendor-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vendors",
          filter: `id=eq.${id}`,
        },
        () => {
          void loadVendor().then(() => setLastUpdated(new Date()));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [status, id, loadVendor]);

  const patch = (p: Partial<VendorFormState>) =>
    setForm((f) => (f ? { ...f, ...p } : f));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !form) return;
    setError(null);
    if (!form.legal_name.trim()) {
      setError("Legal name is required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        legal_name: form.legal_name.trim(),
        account_code: trimOrNull(form.account_code),
        contact_name: trimOrNull(form.contact_name),
        contact_email: trimOrNull(form.contact_email),
        contact_phone: trimOrNull(form.contact_phone),
        billing_line1: trimOrNull(form.billing_line1),
        billing_line2: trimOrNull(form.billing_line2),
        billing_city: trimOrNull(form.billing_city),
        billing_state: trimOrNull(form.billing_state),
        billing_postal_code: trimOrNull(form.billing_postal_code),
        billing_country: trimOrNull(form.billing_country),
        payment_terms: trimOrNull(form.payment_terms),
        status: form.status,
        notes: trimOrNull(form.notes),
      };
      const { error: upErr } = await supabase
        .from("vendors")
        .update(payload)
        .eq("id", id);
      if (upErr) throw upErr;
      await loadVendor();
      setLastUpdated(new Date());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-white">
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center text-zinc-400">
        <p className="mb-6 text-lg text-zinc-300">Sign in to view this vendor.</p>
        <button
          type="button"
          onClick={() => signIn()}
          className="rounded-2xl bg-blue-600 px-8 py-3 text-sm font-medium text-white hover:bg-blue-700"
        >
          Sign in
        </button>
      </div>
    );
  }

  if (!canManageCrm(capabilities)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6 text-center text-zinc-400">
        <p className="mb-2 text-lg text-zinc-200">CRM access required.</p>
        <p className="mb-6 text-sm text-zinc-500">
          Your role does not have permission to view vendor records.
        </p>
        <Button variant="outline" onClick={() => signOut({ callbackUrl: "/" })}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <DashboardHeader
          userName={session.user?.name}
          lastUpdated={lastUpdated}
          onSignOut={() => signOut({ callbackUrl: "/" })}
          title={
            loading
              ? "Vendor"
              : vendor
                ? vendor.legal_name
                : "Vendor not found"
          }
          subtitle="RFQ and purchase order counterparties."
          backHref="/projects"
          backLabel="Projects"
          showLastUpdated={!!vendor && !loading}
        />

        <div className="mt-8">
          <QuickLinksBar
            openQuotesCount={openQuotes}
            activeHref="/projects"
            newProjectHref="/new-project?returnTo=%2Fprojects"
            capabilities={capabilities}
          />
        </div>

        <div className="mt-8">
          <Link
            href="/projects"
            className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="size-4" />
            Back to projects
          </Link>

          {loading ? (
            <p className="text-zinc-400">Loading…</p>
          ) : !vendor || !form ? (
            <p className="text-zinc-400">This vendor could not be found.</p>
          ) : (
            <>
              <div className="mb-6 flex flex-wrap items-center gap-3">
                <Badge
                  variant="outline"
                  className={cn(
                    "border-0 capitalize ring-1 ring-inset",
                    statusBadgeClass(vendor.status),
                  )}
                >
                  {vendor.status}
                </Badge>
                {vendor.account_code ? (
                  <span className="font-mono text-sm text-zinc-400">
                    {vendor.account_code}
                  </span>
                ) : null}
              </div>

              {error ? (
                <p className="mb-4 text-sm text-red-400" role="alert">
                  {error}
                </p>
              ) : null}

              <form
                onSubmit={handleSave}
                className="rounded-2xl border border-zinc-800/90 bg-zinc-900/50 p-6 sm:p-8"
              >
                <VendorAccountFields value={form} onChange={patch} />
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button type="submit" disabled={saving} className="gap-2">
                    <Save className="size-4" />
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                  <Button type="button" variant="outline" asChild>
                    <Link href="/projects">Back to projects</Link>
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
