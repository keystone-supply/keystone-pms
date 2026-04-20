import test from "node:test";
import assert from "node:assert/strict";

import { shouldSkipUrlFileSelectionSync } from "./workspaceFileSelection";

test("does not skip when there is no pending local update", () => {
  const outcome = shouldSkipUrlFileSelectionSync({
    pending: null,
    searchFile: "file-a",
    nowMs: 1_000,
  });

  assert.deepEqual(outcome, {
    skip: false,
    pending: null,
  });
});

test("skips while waiting for URL to catch up to pending local file", () => {
  const outcome = shouldSkipUrlFileSelectionSync({
    pending: { file: "file-b", expiresAtMs: 2_000 },
    searchFile: "file-a",
    nowMs: 1_500,
  });

  assert.deepEqual(outcome, {
    skip: true,
    pending: { file: "file-b", expiresAtMs: 2_000 },
  });
});

test("clears pending once URL catches up to local file", () => {
  const outcome = shouldSkipUrlFileSelectionSync({
    pending: { file: "file-b", expiresAtMs: 2_000 },
    searchFile: "file-b",
    nowMs: 1_600,
  });

  assert.deepEqual(outcome, {
    skip: true,
    pending: null,
  });
});

test("stops skipping after pending sync timeout", () => {
  const outcome = shouldSkipUrlFileSelectionSync({
    pending: { file: "file-b", expiresAtMs: 1_200 },
    searchFile: "file-a",
    nowMs: 1_500,
  });

  assert.deepEqual(outcome, {
    skip: false,
    pending: null,
  });
});
