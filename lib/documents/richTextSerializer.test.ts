import assert from "node:assert/strict";
import { test } from "node:test";

import {
  serializeRichTextForPdf,
  toPlainTextFromRich,
  type SerializedRichTextDocument,
} from "@/lib/documents/richTextSerializer";

const sampleRichDoc = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Hello " },
        { type: "text", text: "World", marks: [{ type: "bold" }] },
        { type: "text", text: " color", marks: [{ type: "textStyle", attrs: { color: "#ff0000" } }] },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Item " },
                {
                  type: "text",
                  text: "A",
                  marks: [{ type: "highlight", attrs: { color: "#fff59d" } }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

test("toPlainTextFromRich returns readable text from rich doc", () => {
  const plain = toPlainTextFromRich(sampleRichDoc);
  assert.equal(plain, "Hello World color\n- Item A");
});

test("toPlainTextFromRich is robust for malformed input", () => {
  assert.equal(toPlainTextFromRich(null), "");
  assert.equal(toPlainTextFromRich("not-json"), "");
  assert.equal(toPlainTextFromRich({ type: "doc", content: "bad" }), "");
});

test("serializeRichTextForPdf emits stable typed blocks", () => {
  const serialized = serializeRichTextForPdf(sampleRichDoc);

  const expected: SerializedRichTextDocument = {
    version: 1,
    blocks: [
      {
        type: "paragraph",
        segments: [
          { text: "Hello ", marks: [] },
          { text: "World", marks: [{ kind: "bold" }] },
          { text: " color", marks: [{ kind: "color", value: "#ff0000" }] },
        ],
      },
      {
        type: "bullet_list",
        items: [
          {
            segments: [
              { text: "Item ", marks: [] },
              { text: "A", marks: [{ kind: "highlight", value: "#fff59d" }] },
            ],
          },
        ],
      },
    ],
  };

  assert.deepEqual(serialized, expected);
});

test("serializeRichTextForPdf returns empty document for malformed input", () => {
  const serialized = serializeRichTextForPdf({ type: "doc", content: 42 });
  assert.deepEqual(serialized, { version: 1, blocks: [] });
});
