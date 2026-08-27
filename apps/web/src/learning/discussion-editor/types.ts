export type DiscussionEntryKind = "comment" | "question" | "note";
export type DiscussionVisibility = "public" | "private" | "unlisted";

export interface DiscussionContent {
  format: "markdown";
  markdown: string;
  plainText: string;
}

export type DiscussionDraft = DiscussionContent;

export const createDiscussionDraft = (markdown = ""): DiscussionDraft => ({
  format: "markdown",
  markdown,
  plainText: markdownToPlainText(markdown),
});

export const createEmptyDiscussionDraft = (): DiscussionDraft =>
  createDiscussionDraft();

export const hasDiscussionDraftContent = (draft: DiscussionDraft): boolean =>
  Boolean(draft.plainText.trim()) ||
  getDiscussionAttachmentCount(draft.markdown) > 0;

export const getDiscussionAttachmentCount = (markdown: string): number =>
  Array.from(
    markdown.matchAll(/!\[[^\]]*\]\((?:<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g),
  ).length;

export function isDiscussionContent(
  value: unknown,
): value is DiscussionContent {
  if (!value || typeof value !== "object") return false;
  const content = value as Partial<DiscussionContent>;
  return (
    content.format === "markdown" &&
    typeof content.markdown === "string" &&
    typeof content.plainText === "string"
  );
}

export const isStoredDiscussionDraft = isDiscussionContent;

export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/!\[video:\s*([^\]]*)\]\([^)]+\)/gi, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-+*]\s+|\d+[.)]\s+)/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/==(.*?)==/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\\([\\`*{}\[\]()#+\-.!_>])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
