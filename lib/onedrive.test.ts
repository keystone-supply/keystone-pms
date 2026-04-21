import assert from "node:assert/strict";
import { test } from "node:test";

import { buildVersionedPdfFilename } from "@/lib/onedrive";

test("buildVersionedPdfFilename applies explicit revision index", () => {
  assert.equal(
    buildVersionedPdfFilename("101363_Q-Job-03.29.2026.pdf", 0),
    "101363_Q-Job-03.29.2026 (v0).pdf",
  );
  assert.equal(
    buildVersionedPdfFilename("101363_Q-Job-03.29.2026 (v88).pdf", 3),
    "101363_Q-Job-03.29.2026 (v3).pdf",
  );
});
