export function buildPdfPageNumbers(pageCount: number | null): number[] {
  if (!pageCount || pageCount < 1) {
    return [1];
  }
  return Array.from({ length: pageCount }, (_, index) => index + 1);
}

export type PdfPreviewRenderConfig = {
  canvasBackground: "rgba(255,255,255,1)";
  renderTextLayer: false;
  renderAnnotationLayer: true;
};

export function getPdfPreviewRenderConfig(): PdfPreviewRenderConfig {
  return {
    canvasBackground: "rgba(255,255,255,1)",
    renderTextLayer: false,
    renderAnnotationLayer: true,
  };
}

export function getPdfPreviewPageClassName(): string {
  return "overflow-hidden rounded-lg border border-zinc-700 bg-white";
}

const PDF_PREVIEW_DEFAULT_WIDTH = 900;
const PDF_PREVIEW_CONTAINER_GUTTER = 24;
const PDF_PREVIEW_MIN_WIDTH = 280;

export function getPdfPreviewPageWidth(containerWidth: number | null): number {
  if (!containerWidth || !Number.isFinite(containerWidth)) {
    return PDF_PREVIEW_DEFAULT_WIDTH;
  }
  const availableWidth = Math.floor(containerWidth - PDF_PREVIEW_CONTAINER_GUTTER);
  if (availableWidth <= PDF_PREVIEW_MIN_WIDTH) {
    return PDF_PREVIEW_MIN_WIDTH;
  }
  return Math.min(PDF_PREVIEW_DEFAULT_WIDTH, availableWidth);
}
