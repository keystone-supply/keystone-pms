"use client";

type OpenPrintWindowOptions = {
  url: string;
  mimeType?: string | null;
  title?: string;
  framePrintDelayMs?: number;
  fallbackPrintDelayMs?: number;
  onSettled?: () => void;
};

type OpenPdfPrintWindowOptions = {
  url: string;
  initialDelayMs?: number;
  fallbackDelayMs?: number;
  settleTimeoutMs?: number;
  onSettled?: () => void;
};

export const PDF_PRINT_TIMING = {
  initialDelayMs: 1400,
  fallbackDelayMs: 5200,
  settleTimeoutMs: 12000,
} as const;

export function openPdfPrintWindow({
  url,
  initialDelayMs = PDF_PRINT_TIMING.initialDelayMs,
  fallbackDelayMs = PDF_PRINT_TIMING.fallbackDelayMs,
  settleTimeoutMs = PDF_PRINT_TIMING.settleTimeoutMs,
  onSettled,
}: OpenPdfPrintWindowOptions): boolean {
  const printWindow = window.open(url, "_blank");
  if (!printWindow) return false;

  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    onSettled?.();
  };
  const tryPrint = () => {
    if (settled) return;
    try {
      printWindow.focus();
      printWindow.print();
    } finally {
      finish();
    }
  };

  printWindow.addEventListener("load", () => window.setTimeout(tryPrint, initialDelayMs), {
    once: true,
  });
  window.setTimeout(tryPrint, fallbackDelayMs);
  window.setTimeout(finish, settleTimeoutMs);
  return true;
}

export function openPrintWindow({
  url,
  mimeType,
  title = "Print preview",
  framePrintDelayMs = 500,
  fallbackPrintDelayMs = 3500,
  onSettled,
}: OpenPrintWindowOptions): boolean {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;

  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    onSettled?.();
  };

  const printShellWindow = () => {
    if (settled) return;
    try {
      printWindow.focus();
      printWindow.print();
    } finally {
      finish();
    }
  };

  const doc = printWindow.document;
  doc.open();
  doc.write(`<!doctype html><html><head><title>${title}</title></head><body></body></html>`);
  doc.close();
  doc.body.style.margin = "0";
  doc.body.style.backgroundColor = "#ffffff";

  if (mimeType?.startsWith("image/")) {
    const image = doc.createElement("img");
    image.src = url;
    image.style.width = "100%";
    image.style.height = "auto";
    image.style.display = "block";
    image.addEventListener("load", () => window.setTimeout(printShellWindow, 100), {
      once: true,
    });
    image.addEventListener("error", printShellWindow, { once: true });
    doc.body.append(image);
  } else {
    const frame = doc.createElement("iframe");
    frame.src = url;
    frame.style.width = "100vw";
    frame.style.height = "100vh";
    frame.style.border = "0";
    frame.addEventListener(
      "load",
      () => {
        window.setTimeout(() => {
          if (settled) return;
          try {
            frame.contentWindow?.focus();
            frame.contentWindow?.print();
            finish();
          } catch {
            printShellWindow();
          }
        }, framePrintDelayMs);
      },
      { once: true },
    );
    doc.body.append(frame);
  }

  window.setTimeout(() => {
    if (!settled) printShellWindow();
  }, fallbackPrintDelayMs);
  window.setTimeout(finish, fallbackPrintDelayMs + 3000);
  return true;
}
