import {
  mergeAttributes,
  Node as TiptapNode,
  type JSONContent,
} from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";

const lowlight = createLowlight(common);

const DiscussionVideo = TiptapNode.create({
  name: "discussionVideo",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      title: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "video[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "video",
      mergeAttributes(
        {
          class: "my-3 max-h-96 w-full rounded-xl bg-black object-contain",
          controls: "",
          playsinline: "",
          preload: "metadata",
        },
        HTMLAttributes,
      ),
    ];
  },
});

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

export const createRichTextDraftFromText = (text: string): RichTextDraft => ({
  content: {
    type: "doc",
    content: text.split(/\r?\n/).map((line) => ({
      type: "paragraph",
      ...(line ? { content: [{ type: "text", text: line }] } : {}),
    })),
  },
  text,
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
  Highlight.configure({
    multicolor: false,
    HTMLAttributes: {
      class:
        "rounded-sm bg-[color-mix(in_srgb,var(--warning,#f6bd5c)_34%,transparent)] px-0.5 text-inherit",
    },
  }),
  Image.configure({
    allowBase64: true,
    inline: false,
    HTMLAttributes: {
      class: "my-3 max-h-96 max-w-full rounded-xl object-contain",
      loading: "lazy",
    },
  }),
  DiscussionVideo,
  CodeBlockLowlight.configure({
    lowlight,
    enableTabIndentation: true,
    tabSize: 2,
  }),
];

export const createCommentEditorExtensions = (placeholder?: string) => [
  ...createReadOnlyRichTextExtensions(),
  ...(placeholder
    ? [
        Placeholder.configure({
          placeholder,
          showOnlyCurrent: true,
        }),
      ]
    : []),
];

export const getRichTextAttachmentCount = (content: JSONContent): number =>
  (content.type === "image" || content.type === "discussionVideo" ? 1 : 0) +
  (content.content ?? []).reduce(
    (count, child) => count + getRichTextAttachmentCount(child),
    0,
  );

export const hasRichTextDraftContent = (draft: RichTextDraft): boolean =>
  Boolean(draft.text.trim()) || getRichTextAttachmentCount(draft.content) > 0;

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
