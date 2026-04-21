"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { ArrowLeft, Save } from "lucide-react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { QuickLinksBar } from "@/components/dashboard/quick-links-bar";
import {
  CustomerAccountFields,
  type CustomerFormState,
} from "@/components/sales/customer-account-fields";
import { CustomerShippingPanel } from "@/components/sales/customer-shipping-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import {
  CUSTOMER_DETAIL_SELECT,
  datetimeLocalToIsoOrNull,
  isoToDatetimeLocal,
  type CustomerShippingRow,
  type CustomerWithShipping,
} from "@/lib/customerQueries";
import {
  aggregateDashboardMetrics,
  type DashboardProjectRow,
} from "@/lib/dashboardMetrics";
import { withProjectSelectFallback } from "@/lib/projectQueries";
import {
  PIPELINE_STAGE_LABELS,
  boardColumnForProject,
} from "@/lib/salesCommandBoardColumn";
import { cn } from "@/lib/utils";
import { canManageCrm } from "@/lib/auth/roles";
import { getSessionCapabilitySet } from "@/lib/auth/session-capabilities";

function trimOrNull(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

function rowToForm(c: CustomerWithShipping): CustomerFormState {
  return {
    legal_name: c.legal_name,
    account_code: c.account_code ?? "",
    contact_name: c.contact_name ?? "",
    contact_email: c.contact_email ?? "",
    contact_phone: c.contact_phone ?? "",
    billing_line1: c.billing_line1 ?? "",
    billing_line2: c.billing_line2 ?? "",
    billing_city: c.billing_city ?? "",
    billing_state: c.billing_state ?? "",
    billing_postal_code: c.billing_postal_code ?? "",
    billing_country: c.billing_country ?? "",
    ap_contact_name: c.ap_contact_name ?? "",
    ap_contact_phone: c.ap_contact_phone ?? "",
    ap_contact_email: c.ap_contact_email ?? "",
    payment_terms: c.payment_terms ?? "",
    status: c.status,
    notes: c.notes ?? "",
    follow_up_at: isoToDatetimeLocal(c.follow_up_at),
    follow_up_active: c.follow_up_active ?? false,
  };
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function statusBadgeClass(s: string): string {
  if (s === "active")
    return "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30";
  if (s === "prospect")
    return "bg-amber-500/10 text-amber-400 ring-amber-500/30";
  return "bg-zinc-500/10 text-zinc-400 ring-zinc-500/30";
}

export default function CustomerDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const { data: session, status } = useSession();
  const capabilities = getSessionCapabilitySet(session);

  const [customer, setCustomer] = useState<CustomerWithShipping | null>(null);
  const [form, setForm] = useState<CustomerFormState | null>(null);
  const [related, setRelated] = useState<DashboardProjectRow[]>([]);
  const [openQuotes, setOpenQuotes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadCustomer =
    useCallback(async (): Promise<CustomerWithShipping | null> => {
      if (!id) return null;
      const { data, error: qErr } = await supabase
        .from("customers")
        .select(CUSTOMER_DETAIL_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (qErr) throw qErr;
      if (!data) {
        setCustomer(null);
        setForm(null);
        return null;
      }
      const row = data as CustomerWithShipping;
      setCustomer(row);
      setForm(rowToForm(row));
      return row;
    }, [id]);

  const loadRelatedProjects = useCallback(
    async (customerId: string, legalName: string) => {
      const { data: byId } = await withProjectSelectFallback((select) =>
        supabase.from("projects").select(select).eq("customer_id", customerId),
      );
      const rows: DashboardProjectRow[] = [...((byId ?? []) as DashboardProjectRow[])];
      const seen = new Set(rows.map((r) => r.id));
      const safeName = legalName.replace(/[%_]/g, "").trim();
      if (safeName.length > 0) {
        const { data: byName } = await withProjectSelectFallback((select) =>
          supabase
            .from("projects")
            .select(select)
            .ilike("customer", `%${safeName}%`),
        );
        for (const r of (byName ?? []) as DashboardProjectRow[]) {
          if (!seen.has(r.id)) {
            rows.push(r);
            seen.add(r.id);
          }
        }
      }
      rows.sort((a, b) =>
        String(b.project_number ?? "").localeCompare(
          String(a.project_number ?? ""),
          undefined,
          { numeric: true },
        ),
      );
      setRelated(rows.slice(0, 50));
    },
    [],
  );

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const row = await loadCustomer();
      if (row) await loadRelatedProjects(id, row.legal_name);
      setLastUpdated(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load account.");
    } finally {
      setLoading(false);
    }
  }, [id, loadCustomer, loadRelatedProjects]);

  const reloadLocal = useCallback(async () => {
    if (!id) return;
    try {
      const row = await loadCustomer();
      if (row) await loadRelatedProjects(id, row.legal_name);
      setLastUpdated(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Refresh failed.");
    }
  }, [id, loadCustomer, loadRelatedProjects]);

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
      .channel(`customer-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "customers",
          filter: `id=eq.${id}`,
        },
        () => {
          void reloadLocal();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "customer_shipping_addresses",
          filter: `customer_id=eq.${id}`,
        },
        () => {
          void reloadLocal();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [status, id, reloadLocal]);

  const patch = (p: Partial<CustomerFormState>) =>
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
        ap_contact_name: trimOrNull(form.ap_contact_name),
        ap_contact_phone: trimOrNull(form.ap_contact_phone),
        ap_contact_email: trimOrNull(form.ap_contact_email),
        payment_terms: trimOrNull(form.payment_terms),
        status: form.status,
        notes: trimOrNull(form.notes),
        follow_up_at: datetimeLocalToIsoOrNull(form.follow_up_at),
        follow_up_active: form.follow_up_active,
      };
      const { error: uErr } = await supabase
        .from("customers")
        .update(payload)
        .eq("id", id);
      if (uErr) throw uErr;
      await reloadLocal();
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
        <p className="mb-6 text-lg text-zinc-300">Sign in to view this account.</p>
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
          Your role does not have permission to view customer accounts.
        </p>
        <Button variant="outline" onClick={() => signOut({ callbackUrl: "/" })}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  if (!id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
        Invalid account.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
        Loading account…
      </div>
    );
  }

  if (!customer || !form) {
    return (
      <div className="min-h-screen bg-zinc-950 px-6 py-16 text-white">
        <p className="mb-4 text-zinc-400">Account not found.</p>
        <Button variant="outline" asChild>
          <Link href="/projects">Back to projects</Link>
        </Button>
      </div>
    );
  }

  const shipping: CustomerShippingRow[] =
    customer.customer_shipping_addresses ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <DashboardHeader
          userName={session.user?.name}
          lastUpdated={lastUpdated}
          onSignOut={() => signOut({ callbackUrl: "/" })}
          title={customer.legal_name}
          subtitle="Account profile, ship-tos, and related jobs."
          backHref="/projects"
          backLabel="Projects"
        />

        <div className="mt-8">
          <QuickLinksBar
            openQuotesCount={openQuotes}
            activeHref="/projects"
            newProjectHref="/new-project?returnTo=%2Fprojects"
            capabilities={capabilities}
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="size-4" />
            Directory
          </Link>
          <Badge
            variant="outline"
            className={cn(
              "border-0 capitalize ring-1 ring-inset",
              statusBadgeClass(customer.status),
            )}
          >
            {customer.status}
          </Badge>
          {customer.account_code ? (
            <span className="font-mono text-sm text-zinc-400">
              {customer.account_code}
            </span>
          ) : null}
        </div>

        {error ? (
          <p className="mt-4 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
          <div className="space-y-8">
            <form
              onSubmit={handleSave}
              className="rounded-2xl border border-zinc-800/90 bg-zinc-900/50 p-6 sm:p-8"
            >
              <CustomerAccountFields value={form} onChange={patch} />
              <div className="mt-8 flex flex-wrap gap-3">
                <Button type="submit" disabled={saving} className="gap-2">
                  <Save className="size-4" />
                  {saving ? "Saving…" : "Save changes"}
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link href="/projects">Cancel</Link>
                </Button>
              </div>
            </form>

            <CustomerShippingPanel
              customerId={id}
              addresses={shipping}
              onRefresh={reloadLocal}
            />
          </div>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/50 p-5">
              <h3 className="text-sm font-semibold text-white">Related jobs</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Linked by <code className="text-zinc-400">customer_id</code> or
                name match on the job&apos;s customer field.
              </p>
              <ul className="mt-4 max-h-[420px] space-y-2 overflow-y-auto text-sm">
                {related.length === 0 ? (
                  <li className="text-zinc-500">No matching projects.</li>
                ) : (
                  related.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-col gap-0.5 rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3 py-2"
                    >
                      <Link
                        href={`/projects/${p.id}`}
                        className="font-mono text-xs font-semibold text-blue-400 hover:text-blue-300"
                      >
                        #{p.project_number}
                      </Link>
                      <span className="truncate text-xs text-zinc-400">
                        {p.project_name || "—"}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {formatUsd(p.invoiced_amount || 0)} invoiced ·{" "}
                        {PIPELINE_STAGE_LABELS[boardColumnForProject(p)]}
                      </span>
                    </li>
                  ))
                )}
              </ul>
              <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
                <Link href="/new-project?returnTo=%2Fprojects">New project</Link>
              </Button>
            </section>

            <section className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 p-5">
              <h3 className="text-sm font-semibold text-zinc-400">
                Link jobs to this account
              </h3>
              <p className="mt-2 text-xs text-zinc-500">
                Set <code className="text-zinc-400">customer_id</code> on project
                rows in Supabase (or add a picker on the job form later) so
                revenue rolls up without relying on name match.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
