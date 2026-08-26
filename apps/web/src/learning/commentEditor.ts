import type { JSONContent } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { CommentSlashCommand } from "./commentSlashCommand";

const lowlight = createLowlight(common);

export type DiscussionEntryKind = "comment" | "question" | "note";
export type DiscussionVisibility = "public" | "private" | "unlisted";

export interface RichTextDraft {
  content: JSONContent;
  text: string;
}

export const createEmptyRichTextDraft = (): RichTextDraft => ({
  content: {
    type: "doc",
    content: [{ type: "paragraph" }],
  },
  text: "",
});

export const createReadOnlyRichTextExtensions = () => [
  StarterKit.configure({
    codeBlock: false,
    heading: { levels: [1, 2, 3] },
    link: false,
  }),
  Link.configure({
    autolink: true,
    linkOnPaste: true,
    openOnClick: false,
  }),
  CodeBlockLowlight.configure({
    lowlight,
    enableTabIndentation: true,
    tabSize: 2,
  }),
];

export const createCommentEditorExtensions = (placeholder?: string) => [
  ...createReadOnlyRichTextExtensions(),
  CommentSlashCommand,
  ...(placeholder
    ? [
        Placeholder.configure({
          placeholder,
          showOnlyCurrent: true,
        }),
      ]
    : []),
];

export function isRichTextDocument(value: unknown): value is JSONContent {
  if (!value || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;
  if (typeof node.type !== "string") return false;
  if (typeof node.text !== "undefined" && typeof node.text !== "string")
    return false;
  if (
    typeof node.content !== "undefined" &&
    (!Array.isArray(node.content) || !node.content.every(isRichTextDocument))
  )
    return false;
  return true;
}

export const isStoredRichTextDraft = (value: unknown): value is RichTextDraft =>
  Boolean(value) &&
  typeof value === "object" &&
  isRichTextDocument((value as RichTextDraft).content) &&
  typeof (value as RichTextDraft).text === "string";
