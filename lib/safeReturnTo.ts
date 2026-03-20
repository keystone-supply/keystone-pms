/** Next.js internal path only — blocks protocol-relative and external URLs. */
export function safeReturnToPath(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "/";
  let path: string;
  try {
    path = decodeURIComponent(raw).trim();
  } catch {
    return "/";
  }
  if (!path.startsWith("/") || path.startsWith("//")) return "/";
  return path;
}
