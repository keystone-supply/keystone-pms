"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, UserPlus } from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import {
  CUSTOMER_LIST_SELECT,
  type CustomerRow,
} from "@/lib/customerQueries";
import { safeReturnToPath } from "@/lib/safeReturnTo";

const controlFocus =
  "text-white focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/30";

const inputBase = `w-full rounded-xl border border-zinc-700 bg-zinc-900/80 uppercase placeholder:text-zinc-600 ${controlFocus}`;

export type CustomerSearchComboboxProps = {
  value: string;
  customerId: string | null;
  onCustomerChange: (nameUpper: string) => void;
  onCustomerIdChange: (id: string | null) => void;
  cozy?: boolean;
  /** Path passed to new-customer page as `returnTo` (must be a same-origin path). */
  returnToAfterNewCustomer: string;
};

function norm(s: string): string {
  return s.trim().toUpperCase();
}

export function CustomerSearchCombobox({
  value,
  customerId,
  onCustomerChange,
  onCustomerIdChange,
  cozy = true,
  returnToAfterNewCustomer,
}: CustomerSearchComboboxProps) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const inputPad = cozy ? "px-5 py-4 pr-11 text-lg" : "px-4 py-3 pr-10 text-lg";

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("customers")
      .select(CUSTOMER_LIST_SELECT)
      .order("legal_name", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setCustomers((data ?? []) as CustomerRow[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      const name = c.legal_name.toLowerCase();
      const code = (c.account_code ?? "").toLowerCase();
      const contact = (c.contact_name ?? "").toLowerCase();
      return (
        name.includes(q) || code.includes(q) || contact.includes(q)
      );
    });
  }, [customers, value]);

  const newCustomerHref = `/sales/customers/new?returnTo=${encodeURIComponent(safeReturnToPath(returnToAfterNewCustomer))}`;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = useCallback(
    (c: CustomerRow) => {
      onCustomerChange(norm(c.legal_name));
      onCustomerIdChange(c.id);
      setOpen(false);
    },
    [onCustomerChange, onCustomerIdChange],
  );

  const onInputChange = (raw: string) => {
    setActiveIndex(0);
    onCustomerChange(raw.toUpperCase());
    onCustomerIdChange(null);
  };

  const openList = () => {
    setActiveIndex(0);
    setOpen(true);
  };

  const safeActiveIndex = Math.min(
    activeIndex,
    Math.max(0, filtered.length - 1),
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setActiveIndex(0);
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(Math.min(safeActiveIndex + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(Math.max(safeActiveIndex - 1, 0));
    } else if (e.key === "Enter" && filtered.length > 0) {
      e.preventDefault();
      const c = filtered[safeActiveIndex];
      if (c) pick(c);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          required
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={value}
          onChange={(e) => onInputChange(e.target.value)}
          onFocus={() => openList()}
          onKeyDown={onKeyDown}
          className={`${inputBase} ${inputPad}`}
          placeholder={cozy ? "SEARCH OR TYPE CUSTOMER" : undefined}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Show customer list"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
          onClick={() => {
            setOpen((o) => {
              const next = !o;
              if (next) setActiveIndex(0);
              return next;
            });
            inputRef.current?.focus();
          }}
        >
          <ChevronDown className={`size-5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {customerId ? (
        <p className="mt-1 text-[11px] text-emerald-500/90">
          Linked to CRM account ·{" "}
          <Link
            href={`/sales/customers/${customerId}`}
            className="text-sky-400 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Sales
          </Link>
        </p>
      ) : null}
      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
        >
          {loading ? (
            <p className="px-4 py-3 text-sm text-zinc-500">Loading accounts…</p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-500">
              No matches. Type a name or add an account below.
            </p>
          ) : (
            filtered.map((c, idx) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={idx === safeActiveIndex}
                className={`flex w-full flex-col items-start px-4 py-2.5 text-left text-sm hover:bg-zinc-800 ${
                  idx === safeActiveIndex ? "bg-zinc-800" : ""
                }`}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  pick(c);
                }}
              >
                <span className="font-medium text-zinc-100">{c.legal_name}</span>
                <span className="text-xs text-zinc-500">
                  {[c.account_code, c.billing_city, c.billing_state]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </span>
              </button>
            ))
          )}
          <div className="sticky bottom-0 border-t border-zinc-700 bg-zinc-900/95 backdrop-blur">
            <Link
              href={newCustomerHref}
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-sky-400 hover:bg-zinc-800 hover:text-sky-300"
              onClick={() => setOpen(false)}
            >
              <UserPlus className="size-4 shrink-0" />
              Create new customer…
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
