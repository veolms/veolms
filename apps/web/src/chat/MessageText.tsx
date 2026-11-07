import type { ReactNode } from "react";

/**
 * Message text as WhatsApp shows it: links become links, @names are
 * highlighted, and *bold*, _italic_, ~strike~ and `code` are formatted.
 * Plain text only: nothing is ever rendered as HTML.
 */

const TOKEN =
  /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])|(@[\p{L}\p{N}_.-]+(?:\s[\p{Lu}][\p{L}]+)?)|(`[^`\n]+`)|(\*[^*\n]+\*)|(_[^_\n]+_)|(~[^~\n]+~)/gu;

export function MessageText({
  text,
  mentionsMe = false,
}: {
  text: string;
  mentionsMe?: boolean;
}) {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    const [whole, url, mention, code, bold, italic, strike] = match;
    if (url) {
      parts.push(
        <a
          key={key++}
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="break-all text-(--accent-ink) underline underline-offset-2"
        >
          {url}
        </a>,
      );
    } else if (mention) {
      parts.push(
        <span key={key++} className="font-semibold text-(--accent-ink)">
          {mention}
        </span>,
      );
    } else if (code) {
      parts.push(
        <code
          key={key++}
          className="rounded bg-[color-mix(in_srgb,var(--text)_10%,transparent)] px-1 font-mono text-[0.88em]"
        >
          {code.slice(1, -1)}
        </code>,
      );
    } else if (bold) {
      parts.push(<strong key={key++}>{bold.slice(1, -1)}</strong>);
    } else if (italic) {
      parts.push(<em key={key++}>{italic.slice(1, -1)}</em>);
    } else if (strike) {
      parts.push(<s key={key++}>{strike.slice(1, -1)}</s>);
    } else {
      parts.push(whole);
    }
    last = index + whole.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return (
    <span
      className={
        mentionsMe
          ? "rounded-sm bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
          : undefined
      }
    >
      {parts}
    </span>
  );
}
