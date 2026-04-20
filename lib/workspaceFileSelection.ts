export type PendingFileUrlSync = {
  file: string | null;
  expiresAtMs: number;
};

type ShouldSkipUrlFileSelectionSyncInput = {
  pending: PendingFileUrlSync | null;
  searchFile: string | null;
  nowMs: number;
};

type ShouldSkipUrlFileSelectionSyncResult = {
  skip: boolean;
  pending: PendingFileUrlSync | null;
};

export function shouldSkipUrlFileSelectionSync(
  input: ShouldSkipUrlFileSelectionSyncInput,
): ShouldSkipUrlFileSelectionSyncResult {
  const pending = input.pending;
  if (!pending) {
    return { skip: false, pending: null };
  }
  if (input.nowMs > pending.expiresAtMs) {
    return { skip: false, pending: null };
  }
  if (input.searchFile === pending.file) {
    return { skip: true, pending: null };
  }
  return { skip: true, pending };
}
