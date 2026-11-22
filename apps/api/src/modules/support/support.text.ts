/** Markdown from the comment editor, as plain text for titles and search. */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/`([^`]*)`/gu, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gmu, "")
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/gu, "$1")
    .replace(/[ \t]+/gu, " ")
    .trim();
}

export function snippetFrom(plainText: string, length: number): string {
  const flat = plainText.replace(/\s+/gu, " ").trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

export function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}
