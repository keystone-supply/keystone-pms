const RIVERSIDE_TIME_ZONE = "America/Denver";

export function formatRiversideDateWithMt(raw: string | Date | null | undefined): string {
  if (raw == null || raw === "") return "—";
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: RIVERSIDE_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
  return `${formatted} MT`;
}

export function formatRiversideDateTimeWithMt(raw: string | Date | null | undefined): string {
  if (raw == null || raw === "") return "—";
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: RIVERSIDE_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
  return `${formatted} MT`;
}

export function formatRiversideTimeWithMt(raw: string | Date | null | undefined): string {
  if (raw == null || raw === "") return "—";
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: RIVERSIDE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${formatted} MT`;
}

export function riversideYear(raw: string | Date | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RIVERSIDE_TIME_ZONE,
    year: "numeric",
  }).formatToParts(d);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "");
  return Number.isFinite(year) ? year : null;
}
