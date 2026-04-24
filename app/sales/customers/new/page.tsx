"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { ArrowLeft, Save } from "lucide-react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { QuickLinksBar } from "@/components/dashboard/quick-links-bar";
import {
  CustomerAccountFields,
  emptyCustomerFormState,
  type CustomerFormState,
} from "@/components/sales/customer-account-fields";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { datetimeLocalToIsoOrNull } from "@/lib/customerQueries";
import {
  aggregateDashboardMetrics,
  type DashboardProjectRow,
} from "@/lib/dashboardMetrics";
import { withProjectSelectFallback } from "@/lib/projectQueries";
import { safeReturnToPath } from "@/lib/safeReturnTo";
import { canManageCrm } from "@/lib/auth/roles";
import { getSessionCapabilitySet } from "@/lib/auth/session-capabilities";

function trimOrNull(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

function NewCustomerPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const capabilities = getSessionCapabilitySet(session);
  const [form, setForm] = useState<CustomerFormState>(emptyCustomerFormState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openQuotes, setOpenQuotes] = useState(0);

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

  const patch = (p: Partial<CustomerFormState>) =>
    setForm((f) => ({ ...f, ...p }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.legal_name.trim()) {
      setError("Legal name is required.");
      return;
    }
    setBusy(true);
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
      const { data, error: insErr } = await supabase
        .from("customers")
        .insert(payload)
        .select("id")
        .single();
      if (insErr) throw insErr;
      if (!data?.id) throw new Error("No id returned");
      const rawReturn = searchParams.get("returnTo");
      if (rawReturn != null && rawReturn !== "") {
        router.push(safeReturnToPath(rawReturn));
      } else {
        router.push(`/sales/customers/${data.id}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not create account.");
    } finally {
      setBusy(false);
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
        <p className="mb-6 text-lg text-zinc-300">Sign in to add a customer.</p>
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
          Your role does not have permission to create customer records.
        </p>
        <Button variant="outline" onClick={() => signOut({ callbackUrl: "/" })}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-[70rem] px-4 py-8 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <DashboardHeader
          userName={session.user?.name}
          lastUpdated={null}
          showLastUpdated={false}
          onSignOut={() => signOut({ callbackUrl: "/" })}
          title="New customer account"
          subtitle="Create the legal entity record; add ship-tos on the next screen."
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

        <div className="mt-8">
          <Link
            href="/projects"
            className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="size-4" />
            Back to directory
          </Link>

          {error ? (
            <p className="mb-4 text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}

          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-zinc-800/90 bg-zinc-900/50 p-6 sm:p-8"
          >
            <CustomerAccountFields
              value={form}
              onChange={patch}
              showLegalRequired
            />
            <div className="mt-8 flex flex-wrap gap-3">
              <Button type="submit" disabled={busy} className="gap-2">
                <Save className="size-4" />
                {busy ? "Saving…" : "Create account"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/projects">Cancel</Link>
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function NewCustomerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
          Loading…
        </div>
      }
    >
      <NewCustomerPageInner />
    </Suspense>
  );
}
