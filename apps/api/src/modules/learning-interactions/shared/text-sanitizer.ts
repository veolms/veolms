/**
 * Extracts and sanitizes plain text from Markdown and HTML content server-side.
 */
export function extractPlainText(content: string): string {
  if (!content) return "";

  return content
    // Remove HTML tags
    .replace(/<[^>]*>/g, " ")
    // Remove markdown images ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Remove markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Remove markdown headers
    .replace(/^#{1,6}\s+/gm, "")
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, " ")
    // Remove inline code
    .replace(/`([^`]+)`/g, "$1")
    // Remove bold / italics
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    // Remove blockquotes
    .replace(/^>\s+/gm, "")
    // Remove extra whitespaces
    .replace(/\s+/g, " ")
    .trim();
}
