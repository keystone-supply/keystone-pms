import test from "node:test";
import assert from "node:assert/strict";

import { isDocumentWorkspaceV2Enabled } from "./workspaceFeatureFlag";

test("returns true for accepted truthy values", () => {
  assert.equal(isDocumentWorkspaceV2Enabled("1"), true);
  assert.equal(isDocumentWorkspaceV2Enabled("true"), true);
  assert.equal(isDocumentWorkspaceV2Enabled("yes"), true);
  assert.equal(isDocumentWorkspaceV2Enabled("on"), true);
});

test("treats values case-insensitively and trims whitespace", () => {
  assert.equal(isDocumentWorkspaceV2Enabled("  TRUE  "), true);
  assert.equal(isDocumentWorkspaceV2Enabled("\tYes\n"), true);
  assert.equal(isDocumentWorkspaceV2Enabled(" On "), true);
});

test("returns false for undefined, empty, falsey, and unknown values", () => {
  assert.equal(isDocumentWorkspaceV2Enabled(undefined), false);
  assert.equal(isDocumentWorkspaceV2Enabled(null), false);
  assert.equal(isDocumentWorkspaceV2Enabled(""), false);
  assert.equal(isDocumentWorkspaceV2Enabled("   "), false);
  assert.equal(isDocumentWorkspaceV2Enabled("0"), false);
  assert.equal(isDocumentWorkspaceV2Enabled("false"), false);
  assert.equal(isDocumentWorkspaceV2Enabled("random"), false);
});
