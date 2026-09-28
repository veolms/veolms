import { toString as mdastToString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type {
  ChapterInput,
  DescriptionChapterDeclaration,
  ParseChaptersOptions,
} from "./chapterTypes.ts";

interface MarkdownNode {
  type: string;
  children?: readonly MarkdownNode[];
  position?: {
    start?: { line?: number; offset?: number };
    end?: { line?: number; offset?: number };
  };
  value?: string;
}

const SEMANTIC_CHAPTER_PATTERN =
  /^\s*(\d+:\d{2}(?::\d{2})?)\s+([\s\S]*?\S)\s*$/;

const markdownParser = unified().use(remarkParse).use(remarkGfm);

/** Parses a chapter timestamp in MM:SS or HH:MM:SS form. */
export function parseChapterTimestamp(timestamp: string): number | null {
  const parts = timestamp.split(":");
  if (parts.length !== 2 && parts.length !== 3) {
    return null;
  }

  const values = parts.map((part) => {
    if (!/^\d+$/.test(part)) {
      return Number.NaN;
    }

    return Number(part);
  });

  if (values.some((value) => !Number.isSafeInteger(value))) {
    return null;
  }

  if (values.length === 2) {
    const minutes = values[0];
    const seconds = values[1];
    if (minutes === undefined || seconds === undefined || seconds >= 60) {
      return null;
    }

    return minutes * 60 + seconds;
  }

  const hours = values[0];
  const minutes = values[1];
  const seconds = values[2];
  if (
    hours === undefined ||
    minutes === undefined ||
    seconds === undefined ||
    minutes >= 60 ||
    seconds >= 60
  ) {
    return null;
  }

  return hours * 3_600 + minutes * 60 + seconds;
}

function isEligibleBlock(node: MarkdownNode | undefined): boolean {
  return node?.type === "paragraph" || node?.type === "heading";
}

function leadingEligibleBlock(node: MarkdownNode | undefined): MarkdownNode | null {
  if (!node) return null;
  if (isEligibleBlock(node)) return node;

  if (node.type === "list") {
    return null;
  }

  if (node.type === "blockquote") {
    const firstChild = node.children?.[0];
    return firstChild && isEligibleBlock(firstChild) ? firstChild : null;
  }

  return null;
}

function eligibleBlocks(root: MarkdownNode): MarkdownNode[] {
  const blocks: MarkdownNode[] = [];

  for (const node of root.children ?? []) {
    if (isEligibleBlock(node)) {
      blocks.push(node);
      continue;
    }

    if (node.type === "list") {
      for (const item of node.children ?? []) {
        if (item.type !== "listItem") continue;
        const leading = leadingEligibleBlock(item.children?.[0]);
        if (leading) blocks.push(leading);
      }
      continue;
    }

    const leading = leadingEligibleBlock(node);
    if (leading) blocks.push(leading);
  }

  return blocks;
}

function firstSemanticInline(node: MarkdownNode): MarkdownNode | null {
  for (const child of node.children ?? []) {
    if (child.type === "text") {
      if (child.value?.trim()) return child;
      continue;
    }

    if (
      child.type === "strong" ||
      child.type === "emphasis" ||
      child.type === "delete"
    ) {
      const nested = firstSemanticInline(child);
      if (nested) return nested;
      continue;
    }

    return child;
  }

  return null;
}

function containsUnsafeOrAmbiguousContent(node: MarkdownNode): boolean {
  if (node.type === "html" || node.type === "break" || node.type === "image") {
    return true;
  }

  return (node.children ?? []).some(containsUnsafeOrAmbiguousContent);
}

function startsWithLinkOrInlineCode(node: MarkdownNode): boolean {
  const firstInline = firstSemanticInline(node);
  return (
    firstInline?.type === "link" || firstInline?.type === "inlineCode"
  );
}

function extractChapterCandidate(semanticText: string): ChapterInput | null {
  const match = SEMANTIC_CHAPTER_PATTERN.exec(semanticText);
  if (!match) return null;

  const timestamp = match[1];
  const title = match[2]
    ?.trim()
    .replace(/^(?:-|–|—)(?=\s|$)\s*/, "")
    .trim();
  if (!timestamp || !title || /^[\s*_~`]+$/.test(title)) return null;

  const startTime = parseChapterTimestamp(timestamp);
  if (startTime === null) return null;

  return { title, startTime };
}

function extractChapterCandidates(
  block: MarkdownNode,
  description: string,
): ChapterInput[] {
  const startOffset = block.position?.start?.offset;
  const endOffset = block.position?.end?.offset;
  const sourceText =
    startOffset !== undefined && endOffset !== undefined
      ? description.slice(startOffset, endOffset)
      : mdastToString(block as Parameters<typeof mdastToString>[0]);

  return sourceText
    .split(/\r?\n/)
    .map((line) => {
      let lineRoot: MarkdownNode;
      try {
        lineRoot = markdownParser.parse(line) as unknown as MarkdownNode;
      } catch {
        return null;
      }

      const lineBlock = eligibleBlocks(lineRoot)[0];
      if (
        !lineBlock ||
        containsUnsafeOrAmbiguousContent(lineBlock) ||
        startsWithLinkOrInlineCode(lineBlock)
      ) {
        return null;
      }

      const semanticText = mdastToString(
        lineBlock as Parameters<typeof mdastToString>[0],
      ).trim();
      return extractChapterCandidate(semanticText);
    })
    .filter((candidate): candidate is ChapterInput => candidate !== null);
}

function isPlainTextChapterLine(
  root: MarkdownNode,
  block: MarkdownNode,
): boolean {
  return (
    root.children?.length === 1 &&
    root.children[0] === block &&
    block.type === "paragraph" &&
    (block.children ?? []).every((child) => child.type === "text")
  );
}

function extractChapterDeclarations(
  block: MarkdownNode,
  description: string,
): DescriptionChapterDeclaration[] {
  const startOffset = block.position?.start?.offset;
  const endOffset = block.position?.end?.offset;
  const startLine = block.position?.start?.line;
  const sourceText =
    startOffset !== undefined && endOffset !== undefined
      ? description.slice(startOffset, endOffset)
      : mdastToString(block as Parameters<typeof mdastToString>[0]);
  const lines = sourceText.split(/\r?\n/);
  const declarations: DescriptionChapterDeclaration[] = [];
  let lineOffset = 0;

  const advanceLineOffset = (line: string) => {
    const newlineOffset = lineOffset + line.length;
    const newlineLength = sourceText.startsWith("\r\n", newlineOffset)
      ? 2
      : sourceText[newlineOffset] === "\n"
        ? 1
        : 0;
    lineOffset += line.length + newlineLength;
  };

  for (const [lineIndex, line] of lines.entries()) {
    let lineRoot: MarkdownNode;
    try {
      lineRoot = markdownParser.parse(line) as unknown as MarkdownNode;
    } catch {
      advanceLineOffset(line);
      continue;
    }

    const lineBlock = eligibleBlocks(lineRoot)[0];
    if (
      !lineBlock ||
      containsUnsafeOrAmbiguousContent(lineBlock) ||
      startsWithLinkOrInlineCode(lineBlock)
    ) {
      advanceLineOffset(line);
      continue;
    }

    const semanticText = mdastToString(
      lineBlock as Parameters<typeof mdastToString>[0],
    ).trim();
    const candidate = extractChapterCandidate(semanticText);
    const firstInline = firstSemanticInline(lineBlock);
    const timestamp = SEMANTIC_CHAPTER_PATTERN.exec(semanticText)?.[1];
    const timestampOffset = timestamp
      ? (firstInline?.value ?? "").indexOf(timestamp)
      : -1;
    const lineStart = (startOffset ?? 0) + lineOffset;
    const inlineStart = firstInline?.position?.start?.offset ?? 0;

    if (
      candidate &&
      timestamp &&
      startOffset !== undefined &&
      startLine !== undefined &&
      timestampOffset >= 0
    ) {
      const timestampStart = lineStart + inlineStart + timestampOffset;
      declarations.push({
        ...candidate,
        declarationId: `description-${lineStart}-${lineStart + line.length}`,
        sourceStart: lineStart,
        sourceEnd: lineStart + line.length,
        timestampStart,
        timestampEnd: timestampStart + timestamp.length,
        lineStart: startLine + lineIndex,
        lineEnd: startLine + lineIndex,
        isPlainText: isPlainTextChapterLine(lineRoot, lineBlock),
      });
    }

    advanceLineOffset(line);
  }

  return declarations;
}

/**
 * Returns source metadata using the same Markdown interpretation as the
 * production chapter parser. The existing parser output remains unchanged.
 */
export function parseChapterDeclarationsFromDescription(
  description: string,
): DescriptionChapterDeclaration[] {
  let root: MarkdownNode;

  try {
    root = markdownParser.parse(description) as unknown as MarkdownNode;
  } catch {
    return [];
  }

  return eligibleBlocks(root).flatMap((block) =>
    extractChapterDeclarations(block, description),
  );
}

/**
 * Parses Markdown blocks into unnormalized chapter candidates.
 *
 * Only eligible leading block content is considered. Markdown formatting in
 * the timestamp and title is resolved semantically, while linked or inline
 * code timestamps remain non-chapter content by design.
 */
export function parseChaptersFromDescription(
  description: string,
  _options: ParseChaptersOptions = {},
): ChapterInput[] {
  let root: MarkdownNode;

  try {
    root = markdownParser.parse(description) as unknown as MarkdownNode;
  } catch {
    return [];
  }

  return eligibleBlocks(root).flatMap((block) =>
    extractChapterCandidates(block, description),
  );
}
