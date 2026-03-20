/**
 * PiPad-inspired tape calculator (web). MVP scope — not PiPad feature parity:
 * - Multi-line expression tape with a live result column
 * - math.js: arithmetic, trig, logs, powers, combinatorics, matrices, etc.
 * - Assignments (e.g. `x = 12 * 0.25`) and reuse on later lines
 * - `ans` = previous line’s numeric result (finite real numbers only)
 * - `@N` = finite numeric result from tape line N (rows above only)
 * - Clear / copy tape; working tape is in-memory; saved copies persist in
 *   localStorage (this browser only) until removed
 *
 * Not included vs PiPad: currency tables, rich markup, full units engine, themes.
 */
"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import {
  Calculator,
  Copy,
  Download,
  ExternalLink,
  FunctionSquare,
  ListOrdered,
  Plus,
  Save,
  Sigma,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { QuickLinksBar } from "@/components/dashboard/quick-links-bar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  aggregateDashboardMetrics,
  type DashboardProjectRow,
} from "@/lib/dashboardMetrics";
import { PROJECT_SELECT } from "@/lib/projectQueries";
import {
  addSavedTape,
  buildTapeExportText,
  deleteSavedTape,
  loadSavedTapes,
  type SavedTapeRecord,
  tapeDisplayTitle,
  tapeExportFilename,
} from "@/lib/pipadTapeStorage";
import { supabase } from "@/lib/supabaseClient";
import { evaluateTapeLineExpressions } from "@/lib/tapeCalculator";

type TapeLine = { id: string; expr: string };

function newLine(): TapeLine {
  return { id: crypto.randomUUID(), expr: "" };
}

export default function PiPadCalcPage() {
  const { data: session, status } = useSession();
  const [openQuotesCount, setOpenQuotesCount] = useState(0);
  const [lines, setLines] = useState<TapeLine[]>(() => [newLine()]);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [savedTapes, setSavedTapes] = useState<SavedTapeRecord[]>([]);

  const fetchOpenQuotesCount = useCallback(async () => {
    const { data, error } = await supabase
      .from("projects")
      .select(PROJECT_SELECT);
    if (error || !data) return;
    setOpenQuotesCount(
      aggregateDashboardMetrics(data as DashboardProjectRow[]).openQuotes,
    );
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetchOpenQuotesCount();
  }, [status, fetchOpenQuotesCount]);

  useEffect(() => {
    if (status !== "authenticated") return;
    setSavedTapes(loadSavedTapes());
  }, [status]);

  const evals = useMemo(
    () => evaluateTapeLineExpressions(lines.map((l) => l.expr)),
    [lines],
  );

  const lastNumericLine = useMemo(() => {
    for (let i = evals.length - 1; i >= 0; i--) {
      const e = evals[i];
      if (!e.display || e.error) continue;
      if (e.display === "true" || e.display === "false") continue;
      return { index: i + 1, display: e.display };
    }
    return null;
  }, [evals]);

  const updateExpr = useCallback((id: string, expr: string) => {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, expr } : l)),
    );
  }, []);

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, newLine()]);
  }, []);

  const insertLineAfter = useCallback((afterId: string) => {
    const line = newLine();
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.id === afterId);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx + 1), line, ...prev.slice(idx + 1)];
    });
    queueMicrotask(() => {
      document.getElementById(`expr-${line.id}`)?.focus();
    });
  }, []);

  const removeLine = useCallback((id: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)));
  }, []);

  const clearTape = useCallback(() => {
    setLines([newLine()]);
  }, []);

  const saveTape = useCallback(() => {
    const snapshot = lines.map((l) => ({ expr: l.expr }));
    setSavedTapes(addSavedTape(snapshot));
    setCopyHint("Saved tape to this browser.");
    setTimeout(() => setCopyHint(null), 2500);
  }, [lines]);

  const removeSavedTape = useCallback((id: string) => {
    if (!window.confirm("Remove this saved tape from this browser?")) return;
    setSavedTapes(deleteSavedTape(id));
  }, []);

  const exportSavedTape = useCallback((record: SavedTapeRecord) => {
    const content = buildTapeExportText(record.lines);
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = tapeExportFilename(record.lines);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setCopyHint("Downloaded tape as .txt.");
    setTimeout(() => setCopyHint(null), 2500);
  }, []);

  const copyResults = useCallback(async () => {
    const text = lines
      .map((l, i) => {
        const e = evals[i];
        const r = e.error
          ? `=(error)`
          : e.display
            ? `=${e.display}`
            : "";
        return `${l.expr}\t${r}`;
      })
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint("Copied tape (expression → =result columns).");
      setTimeout(() => setCopyHint(null), 2500);
    } catch {
      setCopyHint("Could not copy — try again or copy manually.");
      setTimeout(() => setCopyHint(null), 2500);
    }
  }, [lines, evals]);

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
        <p className="mb-6 text-lg text-zinc-300">
          Sign in to use the tape calculator.
        </p>
        <button
          type="button"
          onClick={() => signIn("azure-ad")}
          className="rounded-2xl bg-blue-600 px-8 py-3 text-sm font-medium text-white hover:bg-blue-700"
        >
          Sign in with Microsoft
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <DashboardHeader
          userName={session?.user?.name}
          lastUpdated={null}
          onSignOut={() => signOut({ callbackUrl: "/" })}
          title="Tape calculator"
          subtitle="PiPad-style multi-line math in the browser (assignments, ans, math.js). Mac users can also open the native PiPad app."
          showLastUpdated={false}
          backHref="/"
          backLabel="Dashboard"
        />

        <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200/90">
          The working tape is held in memory — it resets when you refresh — but
          you can save copies to this browser (sidebar) and export them as
          <span className="font-mono text-amber-100/95"> .txt</span> files.
          Press <span className="font-mono text-amber-100/95">Enter</span> in a
          row to add the next line and focus it. Start a line with{" "}
          <span className="font-mono text-amber-100/95">#label </span> to skip
          a short note before the math (e.g.{" "}
          <span className="font-mono text-amber-100/95">#test 3*3</span>
          ).{" "}
          <span className="font-mono text-amber-100/95">@N</span> (e.g.{" "}
          <span className="font-mono text-amber-100/95">@1*3</span>) uses the
          finite numeric result from tape line{" "}
          <span className="font-mono text-amber-100/95">N</span> (only lines
          above the current row). Use{" "}
          <span className="font-mono text-amber-100/95">ans</span> for the
          previous line&apos;s numeric result.
        </div>

        <div className="mt-8">
          <QuickLinksBar
            openQuotesCount={openQuotesCount}
            activeHref="/pipad-calc"
            newProjectHref="/new-project?returnTo=%2Fpipad-calc"
          />
        </div>

        <section
          aria-label="Calculator snapshot"
          className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <KpiCard
            label="Lines"
            value={lines.length}
            hint="Rows on the tape"
            icon={ListOrdered}
          />
          <KpiCard
            label="Last result"
            value={lastNumericLine?.display ?? "—"}
            hint={
              lastNumericLine
                ? `Line ${lastNumericLine.index}`
                : "Evaluate an expression to see a value"
            }
            icon={Sigma}
          />
          <KpiCard
            label="Errors"
            value={evals.filter((e) => e.error).length}
            hint="Lines that failed to evaluate"
            icon={Calculator}
          />
          <KpiCard
            label="Mode"
            value="math.js"
            hint="See mathjs.org for functions"
            icon={FunctionSquare}
          />
        </section>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={addLine}>
                <Plus className="mr-1 size-4" aria-hidden />
                Add line
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={clearTape}>
                <Trash2 className="mr-1 size-4" aria-hidden />
                Clear tape
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={saveTape}>
                <Save className="mr-1 size-4" aria-hidden />
                Save tape
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void copyResults()}
              >
                <Copy className="mr-1 size-4" aria-hidden />
                Copy tape
              </Button>
              {copyHint ? (
                <span className="text-xs text-zinc-400">{copyHint}</span>
              ) : null}
            </div>

            <div className="overflow-x-auto rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-xl">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="w-10 text-zinc-500">#</TableHead>
                    <TableHead className="text-zinc-300">Expression</TableHead>
                    <TableHead className="w-[min(40%,280px)] text-zinc-300">
                      Result
                    </TableHead>
                    <TableHead className="w-12 text-right text-zinc-500">
                      <span className="sr-only">Remove</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, index) => {
                    const e = evals[index];
                    return (
                      <TableRow
                        key={line.id}
                        className="border-zinc-800/80 hover:bg-zinc-900/60"
                      >
                        <TableCell className="align-middle font-mono text-xs text-zinc-500">
                          {index + 1}
                        </TableCell>
                        <TableCell className="align-middle py-2">
                          <label htmlFor={`expr-${line.id}`} className="sr-only">
                            Expression line {index + 1}
                          </label>
                          <input
                            id={`expr-${line.id}`}
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            value={line.expr}
                            onChange={(ev) =>
                              updateExpr(line.id, ev.target.value)
                            }
                            onKeyDown={(ev) => {
                              if (ev.key !== "Enter" || ev.shiftKey) return;
                              ev.preventDefault();
                              insertLineAfter(line.id);
                            }}
                            className="w-full min-w-[12rem] rounded-lg border border-zinc-700/80 bg-zinc-950/80 px-3 py-2 font-mono text-sm text-zinc-100 outline-none ring-blue-500/40 placeholder:text-zinc-600 focus:border-blue-500/50 focus:ring-2"
                            placeholder="e.g. sqrt(16) or x = 3 * 12"
                          />
                        </TableCell>
                        <TableCell className="align-middle">
                          {e?.error ? (
                            <span className="text-sm text-red-400" title={e.error}>
                              {e.error}
                            </span>
                          ) : (
                            <span className="font-mono text-sm text-emerald-200/95">
                              {e?.display ?? ""}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="align-middle text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                            onClick={() => removeLine(line.id)}
                            aria-label={`Remove line ${index + 1}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <p className="text-xs text-zinc-500">
              Examples: <code className="text-zinc-400">sin(pi/2)</code>,{" "}
              <code className="text-zinc-400">381 mm to inch</code>,{" "}
              <code className="text-zinc-400">sqrt(ans)</code> after a numeric
              line, <code className="text-zinc-400">#note 2+2</code> (label is
              ignored for the result),{" "}
              <code className="text-zinc-400">@1*3</code> after line 1 is
              numeric.
            </p>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-violet-500/25 bg-violet-500/5 p-5 text-sm text-violet-100/90 shadow-xl">
              <h2 className="flex items-center gap-2 text-base font-semibold text-violet-100">
                <ExternalLink className="size-4 shrink-0 text-violet-300" />
                Open in PiPad
              </h2>
              <p className="mt-3 leading-relaxed text-violet-200/85">
                The PiPad app runs only on macOS. If it&apos;s installed, a
                <code className="mx-1 rounded bg-violet-950/60 px-1.5 py-0.5 font-mono text-xs text-violet-200">
                  pipad://
                </code>
                link can launch it from here. Your browser may ask for
                confirmation. This does not sync lines with the web tape.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" asChild>
                  <a href="pipad://">Launch PiPad</a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href="calc://">calc://</a>
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-700/80 bg-zinc-900/40 p-5 text-sm text-zinc-200 shadow-xl">
              <h2 className="text-base font-semibold text-zinc-100">
                Saved tapes
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                Stored in this browser only until you delete them. Each name is
                line 1 of that tape.
              </p>
              {savedTapes.length === 0 ? (
                <p className="mt-4 text-xs text-zinc-500">
                  No saved tapes yet — use &quot;Save tape&quot; on the working
                  tape.
                </p>
              ) : (
                <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                  {savedTapes.map((tape) => {
                    const title = tapeDisplayTitle(tape.lines);
                    const short =
                      title.length > 48
                        ? `${title.slice(0, 45)}…`
                        : title;
                    return (
                      <li
                        key={tape.id}
                        className="flex items-start gap-2 rounded-lg border border-zinc-800/90 bg-zinc-950/50 px-3 py-2"
                      >
                        <span
                          className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-300"
                          title={title}
                        >
                          {short}
                        </span>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-zinc-400 hover:bg-zinc-800 hover:text-emerald-300"
                            onClick={() => exportSavedTape(tape)}
                            aria-label={`Export ${short}`}
                          >
                            <Download className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-zinc-400 hover:bg-zinc-800 hover:text-red-300"
                            onClick={() => removeSavedTape(tape.id)}
                            aria-label={`Delete ${short}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
