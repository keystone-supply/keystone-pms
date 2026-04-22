"use client";

import { useEffect, useRef, useState } from "react";

import { fetchLogoDataUrl } from "@/lib/documents/buildProjectDocumentPdf";
import { generateProjectDocumentPdfBuffer } from "@/lib/documents/composePdfInput";
import type { ProjectDocumentDraftMeta, ProjectDocumentKind } from "@/lib/documentTypes";
import type { CustomerShippingRow, CustomerWithShipping } from "@/lib/customerQueries";
import type { ProjectRow } from "@/lib/projectTypes";
import type { VendorRow } from "@/lib/vendorQueries";

type UseLivePreviewOptions = {
  enabled: boolean;
  debounceMs?: number;
  kind: ProjectDocumentKind;
  documentNumber: string;
  project: ProjectRow;
  meta: ProjectDocumentDraftMeta;
  vendor: VendorRow | null;
  customer: CustomerWithShipping | null;
  defaultShipTo: CustomerShippingRow | null;
  revisionIndex?: number;
};

type UseLivePreviewResult = {
  blob: Blob | null;
  loading: boolean;
  error: string | null;
};

function createPdfBlob(buffer: ArrayBuffer | Uint8Array): Blob {
  const source = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const byteCopy = new Uint8Array(source.byteLength);
  byteCopy.set(source);
  return new Blob([byteCopy.buffer], { type: "application/pdf" });
}

export function useLivePreview({
  enabled,
  debounceMs = 500,
  kind,
  documentNumber,
  project,
  meta,
  vendor,
  customer,
  defaultShipTo,
  revisionIndex = 0,
}: UseLivePreviewOptions): UseLivePreviewResult {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      generationRef.current += 1;
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;

    const timeoutId = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void (async () => {
        try {
          const logoDataUrl = await fetchLogoDataUrl(kind);
          if (generationRef.current !== generation) return;

          const buffer = await generateProjectDocumentPdfBuffer({
            kind,
            documentNumber,
            issuedDate: new Date(),
            logoDataUrl,
            project,
            meta,
            vendor,
            customer,
            defaultShipTo,
            revisionIndex,
          });

          if (generationRef.current !== generation) return;
          setBlob(createPdfBlob(buffer));
          setLoading(false);
        } catch (previewError: unknown) {
          if (generationRef.current !== generation) return;
          setError(previewError instanceof Error ? previewError.message : "Preview generation failed.");
          setLoading(false);
        }
      })();
    }, debounceMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    customer,
    debounceMs,
    defaultShipTo,
    documentNumber,
    enabled,
    kind,
    meta,
    project,
    revisionIndex,
    vendor,
  ]);

  return {
    blob: enabled ? blob : null,
    loading: enabled ? loading : false,
    error: enabled ? error : null,
  };
}
