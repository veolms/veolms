/**
 * Discussion text parsing and serialization utilities
 */
export function extractPlainText(content: string): string {
  if (!content) return "";

  return content
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/^>\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeCursor<T = Record<string, unknown>>(cursor: string): T | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
