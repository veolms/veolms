import type { Editor, Range } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export type CommentBlockCommandId =
  | "text"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "bullet-list"
  | "numbered-list"
  | "quote"
  | "code-block"
  | "divider";

export interface CommentBlockCommand {
  id: CommentBlockCommandId;
  label: string;
  description: string;
  keywords: readonly string[];
}

export const COMMENT_BLOCK_COMMANDS = [
  {
    id: "text",
    label: "Text",
    description: "Start writing with plain text",
    keywords: ["paragraph", "plain"],
  },
  {
    id: "heading-1",
    label: "Heading 1",
    description: "Large section heading",
    keywords: ["title", "h1"],
  },
  {
    id: "heading-2",
    label: "Heading 2",
    description: "Medium section heading",
    keywords: ["subtitle", "h2"],
  },
  {
    id: "heading-3",
    label: "Heading 3",
    description: "Small section heading",
    keywords: ["subtitle", "h3"],
  },
  {
    id: "bullet-list",
    label: "Bulleted list",
    description: "Create a simple bulleted list",
    keywords: ["unordered", "ul", "points"],
  },
  {
    id: "numbered-list",
    label: "Numbered list",
    description: "Create a list with numbering",
    keywords: ["ordered", "ol", "steps"],
  },
  {
    id: "quote",
    label: "Quote",
    description: "Capture a quote or callout",
    keywords: ["blockquote", "citation"],
  },
  {
    id: "code-block",
    label: "Code block",
    description: "Write highlighted source code",
    keywords: ["snippet", "syntax", "programming"],
  },
  {
    id: "divider",
    label: "Divider",
    description: "Separate sections with a line",
    keywords: ["separator", "horizontal rule", "hr"],
  },
] as const satisfies readonly CommentBlockCommand[];

export function filterCommentBlockCommands(
  query: string,
): readonly CommentBlockCommand[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return COMMENT_BLOCK_COMMANDS;

  return COMMENT_BLOCK_COMMANDS.filter((command) =>
    [command.label, command.description, ...command.keywords]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery),
  );
}

export function runCommentBlockCommand({
  editor,
  commandId,
  range,
}: {
  editor: Editor;
  commandId: CommentBlockCommandId;
  range?: Range;
}): boolean {
  let chain = editor.chain().focus();
  if (range) chain = chain.deleteRange(range);

  chain = chain.clearNodes();

  switch (commandId) {
    case "text":
      return chain.setParagraph().run();
    case "heading-1":
      return chain.setHeading({ level: 1 }).run();
    case "heading-2":
      return chain.setHeading({ level: 2 }).run();
    case "heading-3":
      return chain.setHeading({ level: 3 }).run();
    case "bullet-list":
      return chain.toggleBulletList().run();
    case "numbered-list":
      return chain.toggleOrderedList().run();
    case "quote":
      return chain.setBlockquote().run();
    case "code-block":
      return chain.setCodeBlock().run();
    case "divider":
      return chain.setHorizontalRule().run();
  }
}

export function isCommentBlockCommandActive(
  editor: Editor,
  commandId: CommentBlockCommandId,
): boolean {
  switch (commandId) {
    case "text":
      return editor.isActive("paragraph");
    case "heading-1":
      return editor.isActive("heading", { level: 1 });
    case "heading-2":
      return editor.isActive("heading", { level: 2 });
    case "heading-3":
      return editor.isActive("heading", { level: 3 });
    case "bullet-list":
      return editor.isActive("bulletList");
    case "numbered-list":
      return editor.isActive("orderedList");
    case "quote":
      return editor.isActive("blockquote");
    case "code-block":
      return editor.isActive("codeBlock");
    case "divider":
      return editor.isActive("horizontalRule");
  }
}

export function getBlockTextSelectionPosition(
  node: ProseMirrorNode,
  nodePosition: number,
): number {
  let selectionOffset = 1;
  let currentNode = node;

  while (!currentNode.isTextblock && currentNode.childCount > 0) {
    currentNode = currentNode.child(0);
    selectionOffset += 1;
  }

  return nodePosition + selectionOffset;
}
