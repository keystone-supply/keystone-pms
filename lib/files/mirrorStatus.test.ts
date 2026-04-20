import test from "node:test";
import assert from "node:assert/strict";

import { deriveMirrorStatusPatch } from "./mirrorStatus";

test("returns stale when etag changed for existing mirrored file", () => {
  const patch = deriveMirrorStatusPatch({
    isFolder: false,
    etagChanged: true,
  });

  assert.deepEqual(patch, {
    mirror_status: "stale",
    mirror_error: null,
  });
});

test("preserves status when file metadata changed but etag is unchanged", () => {
  const patch = deriveMirrorStatusPatch({
    isFolder: false,
    etagChanged: false,
  });

  assert.equal(patch, null);
});

test("forces folders to not_mirrored", () => {
  const patch = deriveMirrorStatusPatch({
    isFolder: true,
    etagChanged: false,
  });

  assert.deepEqual(patch, {
    mirror_status: "not_mirrored",
    mirror_error: null,
  });
});
