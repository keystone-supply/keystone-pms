type MirrorStatusPatch =
  | {
      mirror_status: "not_mirrored" | "stale";
      mirror_error: null;
    }
  | null;

type DeriveMirrorStatusPatchInput = {
  isFolder: boolean;
  etagChanged: boolean;
};

export function deriveMirrorStatusPatch(
  input: DeriveMirrorStatusPatchInput,
): MirrorStatusPatch {
  if (input.isFolder) {
    return {
      mirror_status: "not_mirrored",
      mirror_error: null,
    };
  }
  if (input.etagChanged) {
    return {
      mirror_status: "stale",
      mirror_error: null,
    };
  }
  return null;
}
