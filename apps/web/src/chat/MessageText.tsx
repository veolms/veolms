import type { ReactNode } from "react";

import { HighlightedCodeBlock } from "../components/code/HighlightedCodeBlock";
import { cn } from "../lib/utils";

/**
 * Message text as WhatsApp shows it: links become links, @names are
 * highlighted, and *bold*, _italic_, ~strike~ and `code` are formatted;
 * a ```fenced block``` shows as code with a Copy button (for a class
 * of programmers, the thing most often sent).
 *
 * Markdown pasted in (from notes, a README, an AI's answer) reads as it
 * was meant to as well: [text](link) links, **bold**, # headings and
 * | tables |. Those used to show as raw pipes, brackets and asterisks.
 * Plain text only: nothing is ever rendered as HTML.
 */

const TOKEN =
  /(\[[^\]\n]+\]\([^\s()]+\))|(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])|(@[\p{L}\p{N}_.-]+(?:\s[\p{Lu}][\p{L}]+)?)|(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(_[^_\n]+_)|(~[^~\n]+~)/gu;
const MARKDOWN_LINK = /^\[([^\]\n]+)\]\(([^\s()]+)\)$/;

// A language name only counts on the fence's own line ("```js" + newline);
// "```const x = 1```" on one line is all code.
const FENCE = /```(?:([\w+#.-]+)?[ \t]*\n)?([\s\S]*?)```/g;

type OnMention = (name: string, anchor: HTMLElement) => void;

export function MessageText({
  text,
  mentionsMe = false,
  onMention,
}: {
  text: string;
  mentionsMe?: boolean;
  /** An @name was clicked (shows that person's card). */
  onMention?: OnMention;
}) {
  const blocks: ReactNode[] = [];
  let at = 0;
  for (const match of text.matchAll(FENCE)) {
    const index = match.index ?? 0;
    // The line breaks around a block belong to the block, not the text.
    const before = text.slice(at, index).replace(/\n$/, "");
    if (before)
      blocks.push(<Lines key={`t${at}`} text={before} onMention={onMention} />);
    blocks.push(
      <HighlightedCodeBlock
        key={`c${index}`}
        className="my-1.5 text-left"
        language={(match[1] ?? "").trim()}
        code={(match[2] ?? "").replace(/\n$/, "")}
      />,
    );
    at = index + match[0].length;
    if (text[at] === "\n") at += 1;
  }
  if (at < text.length)
    blocks.push(
      <Lines key={`t${at}`} text={text.slice(at)} onMention={onMention} />,
    );
  return (
    <span
      className={
        mentionsMe
          ? "rounded-sm bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
          : undefined
      }
    >
      {blocks}
    </span>
  );
}

const LIST_LINE = /^([-*]|\d{1,3}\.) (.*)$/;
const QUOTE_LINE = /^> (.*)$/;
const HEADING_LINE = /^(#{1,4}) +(.*)$/;
/** A row of a Markdown table: "| a | b |" (the outer pipes may be left off). */
const TABLE_ROW = /^\s*\|.*\|\s*$|^[^|\n]*\|[^|\n]*\|/;
/** The line under a table's header: "|---|:--:|". */
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;

function tableCells(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|")) row = row.slice(0, -1);
  return row.split("|").map((cell) => cell.trim());
}

/** Whether a table starts at `index`: its header, then its rule line. */
function startsTable(lines: string[], index: number): boolean {
  return (
    TABLE_ROW.test(lines[index] ?? "") &&
    TABLE_RULE.test(lines[index + 1] ?? "")
  );
}

/**
 * WhatsApp's block formats, line by line: "- " and "* " bullets, "1. "
 * numbered items (with a hanging indent, the number as typed) and "> "
 * quotes; other lines stay plain text.
 */
const NEWLINE = "\n";

function Lines({ text, onMention }: { text: string; onMention?: OnMention }) {
  const lines = text.split(NEWLINE);
  if (
    !lines.some(
      (line, index) =>
        LIST_LINE.test(line) ||
        QUOTE_LINE.test(line) ||
        HEADING_LINE.test(line) ||
        startsTable(lines, index),
    )
  ) {
    return <Inline text={text} onMention={onMention} />;
  }
  const out: ReactNode[] = [];
  let plain: string[] = [];
  let quote: string[] = [];
  const flushPlain = () => {
    if (plain.length === 0) return;
    out.push(
      <Inline
        key={out.length}
        text={plain.join(NEWLINE)}
        onMention={onMention}
      />,
    );
    plain = [];
  };
  const flushQuote = () => {
    if (quote.length === 0) return;
    out.push(
      <span
        key={out.length}
        className="my-0.5 block border-0 border-l-[3px] border-solid border-(--chat-line-strong) pl-2 text-(--text-secondary)"
      >
        <Inline text={quote.join(NEWLINE)} onMention={onMention} />
      </span>,
    );
    quote = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (startsTable(lines, index)) {
      flushQuote();
      flushPlain();
      const header = tableCells(line);
      const rows: string[][] = [];
      let next = index + 2;
      while (next < lines.length && TABLE_ROW.test(lines[next] ?? "")) {
        rows.push(tableCells(lines[next] ?? ""));
        next += 1;
      }
      index = next - 1;
      out.push(
        <MessageTable
          key={out.length}
          header={header}
          rows={rows}
          onMention={onMention}
        />,
      );
      continue;
    }
    const heading = HEADING_LINE.exec(line);
    if (heading) {
      flushQuote();
      flushPlain();
      out.push(
        <span
          key={out.length}
          className={cn(
            "mt-1 block",
            heading[1] === "#" ? "text-[1.08em] font-bold" : "font-semibold",
          )}
        >
          <Inline text={heading[2] ?? ""} onMention={onMention} />
        </span>,
      );
      continue;
    }
    const listed = LIST_LINE.exec(line);
    const quoted = listed ? null : QUOTE_LINE.exec(line);
    if (quoted) {
      flushPlain();
      quote.push(quoted[1] ?? "");
      continue;
    }
    flushQuote();
    if (listed) {
      flushPlain();
      const bullet = listed[1] === "-" || listed[1] === "*";
      out.push(
        <span key={out.length} className="relative block pl-5">
          <span
            aria-hidden={bullet ? "true" : undefined}
            className="absolute left-0 w-4 text-right tabular-nums"
          >
            {bullet ? "•" : listed[1]}
          </span>
          <Inline text={listed[2] ?? ""} onMention={onMention} />
        </span>,
      );
      continue;
    }
    plain.push(line);
  }
  flushQuote();
  flushPlain();
  return <>{out}</>;
}

/**
 * A Markdown table in a message, a line under each row, scrolled sideways
 * inside the bubble when it is wider than the bubble.
 */
function MessageTable({
  header,
  rows,
  onMention,
}: {
  header: string[];
  rows: string[][];
  onMention?: OnMention;
}) {
  return (
    <span className="my-1.5 block max-w-full overflow-x-auto whitespace-normal [scrollbar-width:thin]">
      <table className="w-max min-w-full border-collapse text-left text-[0.92em] leading-snug">
        <thead>
          <tr>
            {header.map((cell, column) => (
              <th
                key={column}
                className="border-0 border-b border-solid border-(--chat-line-strong) px-2 py-1 font-semibold"
              >
                <Inline text={cell} onMention={onMention} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {header.map((_, column) => (
                <td
                  key={column}
                  className="border-0 border-b border-solid border-[color-mix(in_srgb,var(--text)_8%,transparent)] px-2 py-1 align-top"
                >
                  <Inline text={row[column] ?? ""} onMention={onMention} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </span>
  );
}

function Inline({ text, onMention }: { text: string; onMention?: OnMention }) {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    const [
      whole,
      markdownLink,
      url,
      mention,
      code,
      strong,
      bold,
      italic,
      strike,
    ] = match;
    const linked = markdownLink ? MARKDOWN_LINK.exec(markdownLink) : null;
    if (linked) {
      const [, label = "", href = ""] = linked;
      // Only a web address opens; a path on someone's computer (a file in
      // their project) is shown as its words.
      parts.push(
        /^https?:\/\//.test(href) ? (
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={href}
            className="text-(--accent-ink) underline underline-offset-2"
          >
            {label}
          </a>
        ) : (
          <span key={key++} title={href} className="font-medium">
            {label}
          </span>
        ),
      );
    } else if (url) {
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
        onMention && mention !== "@all" && mention !== "@everyone" ? (
          <button
            key={key++}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onMention(mention.slice(1), event.currentTarget);
            }}
            className="inline cursor-pointer border-0 bg-transparent p-0 font-semibold text-(--accent-ink) hover:underline"
          >
            {mention}
          </button>
        ) : (
          <span key={key++} className="font-semibold text-(--accent-ink)">
            {mention}
          </span>
        ),
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
    } else if (strong) {
      parts.push(<strong key={key++}>{strong.slice(2, -2)}</strong>);
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
  return <>{parts}</>;
}
