"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import {
  buildPdfPageNumbers,
  getPdfPreviewPageClassName,
  getPdfPreviewPageWidth,
  getPdfPreviewRenderConfig,
} from "@/lib/files/pdfPreview";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type WorkspacePreviewPaneProps = {
  draftWatermark: boolean;
  zoomPercent: number;
  pdfBlob: Blob | null;
  loading: boolean;
  error: string | null;
  focusedLineNo: number | null;
  zoomMin?: number;
  zoomMax?: number;
  onLineLinkClick: (lineNo: number) => void;
  onDraftWatermarkChange: (nextValue: boolean) => void;
  onZoomPercentChange: (nextValue: number) => void;
};

export function WorkspacePreviewPane({
  draftWatermark,
  zoomPercent,
  pdfBlob,
  loading,
  error,
  focusedLineNo,
  zoomMin = 50,
  zoomMax = 200,
  onLineLinkClick,
  onDraftWatermarkChange,
  onZoomPercentChange,
}: WorkspacePreviewPaneProps) {
  const [pageCount, setPageCount] = useState<number | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const highlightedLinksRef = useRef<HTMLAnchorElement[]>([]);
  const [viewportWidth, setViewportWidth] = useState<number | null>(null);
  const basePageWidth = getPdfPreviewPageWidth(viewportWidth);
  const zoomScale = zoomPercent / 100;
  const pageWidth = Math.max(240, Math.floor(basePageWidth * zoomScale));
  const pdfRenderConfig = getPdfPreviewRenderConfig();
  const pdfPageClassName = getPdfPreviewPageClassName();

  useEffect(() => {
    if (!viewportRef.current) return;
    const node = viewportRef.current;
    const updateWidth = () => setViewportWidth(node.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = viewportRef.current;
    if (!container) return;
    for (const link of highlightedLinksRef.current) {
      link.style.outline = "";
      link.style.background = "";
      link.style.borderRadius = "";
    }
    highlightedLinksRef.current = [];
    if (!focusedLineNo) return;
    const hrefMatcher = new RegExp(`docline:(?:\\/\\/)?${focusedLineNo}(?:\\D|$)`, "i");
    let frame = 0;
    let attempts = 0;
    const maxAttempts = 24;
    const tryScroll = () => {
      attempts += 1;
      const links = Array.from(container.querySelectorAll("a[href]")) as HTMLAnchorElement[];
      const matched = links.filter((link) => hrefMatcher.test(link.getAttribute("href") ?? ""));
      const target = matched[0];
      if (target) {
        for (const link of matched) {
          link.style.outline = "2px solid rgba(59,130,246,0.8)";
          link.style.background = "rgba(59,130,246,0.18)";
          link.style.borderRadius = "4px";
        }
        highlightedLinksRef.current = matched;
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (attempts < maxAttempts) {
        frame = window.requestAnimationFrame(tryScroll);
      }
    };
    frame = window.requestAnimationFrame(tryScroll);
    return () => {
      window.cancelAnimationFrame(frame);
      for (const link of highlightedLinksRef.current) {
        link.style.outline = "";
        link.style.background = "";
        link.style.borderRadius = "";
      }
      highlightedLinksRef.current = [];
    };
  }, [focusedLineNo, pdfBlob]);

  const handlePreviewClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = anchor.getAttribute("href") ?? "";
    const match = href.match(/docline:(?:\/\/)?(\d+)/i);
    if (!match) return;
    const lineNo = Number.parseInt(match[1], 10);
    if (!Number.isFinite(lineNo)) return;
    event.preventDefault();
    onLineLinkClick(lineNo);
  };

  return (
    <section className="flex h-full flex-col rounded-2xl border border-zinc-800 bg-zinc-900/80">
      <header className="space-y-3 border-b border-zinc-800 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">Preview</h3>
          <p className="text-xs text-zinc-500">Live PDF preview powered by the production renderer.</p>
          {focusedLineNo ? (
            <p className="mt-1 inline-flex rounded-md border border-blue-500/60 bg-blue-950/30 px-2 py-0.5 text-[11px] text-blue-200">
              Selected line: {focusedLineNo}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={draftWatermark}
              onChange={(event) => onDraftWatermarkChange(event.target.checked)}
            />
            Show draft watermark
          </label>
          <label className="grid gap-1 text-xs text-zinc-500">
            <span>Zoom: {zoomPercent}%</span>
            <input
              type="range"
              min={zoomMin}
              max={zoomMax}
              value={zoomPercent}
              onChange={(event) => onZoomPercentChange(parseInt(event.target.value, 10))}
            />
          </label>
        </div>
      </header>

      <div
        ref={viewportRef}
        className="relative flex flex-1 items-center justify-center p-4"
        onClick={handlePreviewClick}
      >
        <div className="relative h-full min-h-72 w-full overflow-auto rounded-xl border border-zinc-800 bg-zinc-950/60 p-2">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
              Updating preview…
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center text-sm text-red-400">{error}</div>
          ) : pdfBlob ? (
            <div className="mx-auto w-fit max-w-full">
              <Document
                file={pdfBlob}
                onLoadSuccess={({ numPages }) => setPageCount(numPages)}
                onLoadError={() => {
                  setPageCount(null);
                }}
              >
                <div className="space-y-3">
                  {buildPdfPageNumbers(pageCount).map((pageNumber) => (
                    <Page
                      key={pageNumber}
                      pageNumber={pageNumber}
                      width={pageWidth}
                      className={pdfPageClassName}
                      {...pdfRenderConfig}
                    />
                  ))}
                </div>
              </Document>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
              Start editing to generate a preview.
            </div>
          )}
          {draftWatermark ? (
            <span className="pointer-events-none absolute inset-0 m-auto h-fit w-fit rotate-[-20deg] text-5xl font-semibold tracking-[0.35em] text-zinc-700/60">
              DRAFT
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
