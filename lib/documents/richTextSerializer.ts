export type SerializedRichMark =
  | { kind: "bold" }
  | { kind: "italic" }
  | { kind: "highlight"; value?: string }
  | { kind: "color"; value: string };

export type SerializedRichSegment = {
  text: string;
  marks: SerializedRichMark[];
};

export type SerializedRichParagraphBlock = {
  type: "paragraph";
  segments: SerializedRichSegment[];
};

export type SerializedRichBulletListItem = {
  segments: SerializedRichSegment[];
};

export type SerializedRichBulletListBlock = {
  type: "bullet_list";
  items: SerializedRichBulletListItem[];
};

export type SerializedRichTextBlock = SerializedRichParagraphBlock | SerializedRichBulletListBlock;

export type SerializedRichTextDocument = {
  version: 1;
  blocks: SerializedRichTextBlock[];
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function asNodeArray(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function normalizedText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value;
}

function parseRichInput(richJson: unknown): unknown {
  if (typeof richJson === "string") {
    try {
      return JSON.parse(richJson) as unknown;
    } catch {
      return null;
    }
  }
  return richJson;
}

function dedupeMarks(marks: SerializedRichMark[]): SerializedRichMark[] {
  const seen = new Set<string>();
  const deduped: SerializedRichMark[] = [];
  for (const mark of marks) {
    const key =
      mark.kind === "color"
        ? `${mark.kind}:${mark.value.toLowerCase()}`
        : mark.kind === "highlight"
          ? `${mark.kind}:${mark.value?.toLowerCase() ?? "default"}`
          : mark.kind;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(mark);
  }
  return deduped;
}

function marksFromNode(node: JsonRecord): SerializedRichMark[] {
  const rawMarks = asNodeArray(node.marks);
  const marks: SerializedRichMark[] = [];

  for (const mark of rawMarks) {
    const markType = typeof mark.type === "string" ? mark.type : "";
    if (markType === "bold") {
      marks.push({ kind: "bold" });
      continue;
    }
    if (markType === "italic") {
      marks.push({ kind: "italic" });
      continue;
    }
    if (markType === "highlight") {
      const attrs = isRecord(mark.attrs) ? mark.attrs : null;
      const rawColor = attrs && typeof attrs.color === "string" ? attrs.color.trim() : "";
      marks.push(rawColor ? { kind: "highlight", value: rawColor } : { kind: "highlight" });
      continue;
    }
    if (markType === "color" || markType === "textStyle") {
      const attrs = isRecord(mark.attrs) ? mark.attrs : null;
      const rawColor = attrs && typeof attrs.color === "string" ? attrs.color.trim() : "";
      if (rawColor) {
        marks.push({ kind: "color", value: rawColor });
      }
    }
  }

  return dedupeMarks(marks);
}

function collectSegments(node: JsonRecord): SerializedRichSegment[] {
  const nodeType = typeof node.type === "string" ? node.type : "";
  if (nodeType === "text") {
    const text = normalizedText(node.text);
    if (!text) return [];
    return [{ text, marks: marksFromNode(node) }];
  }

  const childNodes = asNodeArray(node.content);
  if (!childNodes.length) return [];

  const segments: SerializedRichSegment[] = [];
  for (const childNode of childNodes) {
    segments.push(...collectSegments(childNode));
  }
  return segments;
}

function paragraphFromNode(node: JsonRecord): SerializedRichParagraphBlock {
  return {
    type: "paragraph",
    segments: collectSegments(node),
  };
}

function listItemFromNode(node: JsonRecord): SerializedRichBulletListItem {
  return {
    segments: collectSegments(node),
  };
}

function blocksFromNode(node: JsonRecord): SerializedRichTextBlock[] {
  const nodeType = typeof node.type === "string" ? node.type : "";

  if (nodeType === "doc") {
    const blocks: SerializedRichTextBlock[] = [];
    for (const childNode of asNodeArray(node.content)) {
      blocks.push(...blocksFromNode(childNode));
    }
    return blocks;
  }

  if (nodeType === "paragraph") {
    return [paragraphFromNode(node)];
  }

  if (nodeType === "bulletList") {
    const items = asNodeArray(node.content)
      .filter((childNode) => childNode.type === "listItem")
      .map((childNode) => listItemFromNode(childNode))
      .filter((item) => item.segments.length > 0);
    return items.length ? [{ type: "bullet_list", items }] : [];
  }

  if (nodeType === "listItem") {
    const item = listItemFromNode(node);
    return item.segments.length ? [{ type: "bullet_list", items: [item] }] : [];
  }

  // Keep parser resilient by recursively inspecting unknown container nodes.
  const childNodes = asNodeArray(node.content);
  if (!childNodes.length) return [];
  const blocks: SerializedRichTextBlock[] = [];
  for (const childNode of childNodes) {
    blocks.push(...blocksFromNode(childNode));
  }
  return blocks;
}

function plainTextFromBlock(block: SerializedRichTextBlock): string {
  if (block.type === "paragraph") {
    return block.segments.map((segment) => segment.text).join("");
  }
  return block.items.map((item) => `- ${item.segments.map((segment) => segment.text).join("")}`).join("\n");
}

export function serializeRichTextForPdf(richJson: unknown): SerializedRichTextDocument {
  const parsed = parseRichInput(richJson);
  if (!isRecord(parsed)) {
    return { version: 1, blocks: [] };
  }
  return {
    version: 1,
    blocks: blocksFromNode(parsed),
  };
}

export function toPlainTextFromRich(richJson: unknown): string {
  const serialized = serializeRichTextForPdf(richJson);
  return serialized.blocks.map(plainTextFromBlock).filter(Boolean).join("\n");
}
