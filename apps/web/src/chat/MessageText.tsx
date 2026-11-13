import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { useState, type ReactNode } from "react";

/**
 * Message text as WhatsApp shows it: links become links, @names are
 * highlighted, and *bold*, _italic_, ~strike~ and `code` are formatted;
 * a ```fenced block``` shows as code with a Copy button (for a class
 * of programmers, the thing most often sent).
 * Plain text only: nothing is ever rendered as HTML.
 */

const TOKEN =
  /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])|(@[\p{L}\p{N}_.-]+(?:\s[\p{Lu}][\p{L}]+)?)|(`[^`\n]+`)|(\*[^*\n]+\*)|(_[^_\n]+_)|(~[^~\n]+~)/gu;

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
      <CodeBlock
        key={`c${index}`}
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

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="my-1 block overflow-hidden rounded-lg bg-[#0d1117] text-left text-slate-100">
      <span className="flex items-center justify-between px-3 py-1 text-[0.7rem] text-slate-400">
        <span>{language || "code"}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[0.7rem] text-slate-300 hover:text-white"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </span>
      <code className="block overflow-x-auto px-3 pb-2.5 font-mono text-[0.82em] leading-relaxed whitespace-pre">
        {code}
      </code>
    </span>
  );
}

const LIST_LINE = /^([-*]|\d{1,3}\.) (.*)$/;
const QUOTE_LINE = /^> (.*)$/;

/**
 * WhatsApp's block formats, line by line: "- " and "* " bullets, "1. "
 * numbered items (with a hanging indent, the number as typed) and "> "
 * quotes; other lines stay plain text.
 */
const NEWLINE = "\n";

function Lines({ text, onMention }: { text: string; onMention?: OnMention }) {
  const lines = text.split(NEWLINE);
  if (!lines.some((line) => LIST_LINE.test(line) || QUOTE_LINE.test(line))) {
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
  for (const line of lines) {
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

function Inline({ text, onMention }: { text: string; onMention?: OnMention }) {
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
