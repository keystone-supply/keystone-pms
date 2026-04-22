const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export function isDocumentWorkspaceV2Enabled(raw?: string | null): boolean {
  if (raw == null) {
    return false;
  }

  return ENABLED_VALUES.has(raw.trim().toLowerCase());
}
