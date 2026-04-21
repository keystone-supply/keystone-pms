const RIVERSIDE_TIME_ZONE = "America/Denver";

export function formatRiversideDateLong(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: RIVERSIDE_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

export function formatRiversideDateStampMdY(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RIVERSIDE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  return `${month}.${day}.${year}`;
}

export function formatRiversideDateStampYmd(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RIVERSIDE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  return `${year}${month}${day}`;
}
