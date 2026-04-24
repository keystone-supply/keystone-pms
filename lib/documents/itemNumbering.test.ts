import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildHierarchicalItemNumbers } from "@/lib/documents/itemNumbering";

describe("buildHierarchicalItemNumbers", () => {
  it("builds nested item numbers from depth sequence", () => {
    assert.deepEqual(
      buildHierarchicalItemNumbers([0, 1, 2, 1, 0, 1]),
      ["1", "1.1", "1.1.1", "1.2", "2", "2.1"],
    );
  });

  it("resets nested counters when returning to higher levels", () => {
    assert.deepEqual(
      buildHierarchicalItemNumbers([0, 1, 0, 1, 2]),
      ["1", "1.1", "2", "2.1", "2.1.1"],
    );
  });
});
