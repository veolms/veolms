import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import type {
  DynamicImportLanguageRegistration,
  HighlighterCore,
} from "@shikijs/core";
import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DiscussionContent } from "./types";
import type { DiscussionAttachmentItem } from "../discussion-attachments";
import { LinkPreviewCard } from "../LinkPreviewCard";
import {
  extractFirstUrl,
  useLinkPreview,
} from "../../services/learning-interactions";

const MENTION_PATTERN = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,30})(?=[^A-Za-z0-9_]|$)/g;

export function renderContentWithMentions(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const regex = new RegExp(MENTION_PATTERN.source, "g");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const prefix = match[1] ?? "";
    const username = match[2];
    const matchStart = match.index;
    const mentionStart = matchStart + prefix.length;
    const matchEnd = match.index + match[0].length;

    if (mentionStart > lastIndex) {
      parts.push(text.slice(lastIndex, mentionStart));
    }

    parts.push(
      <span
        key={`mention-${mentionStart}-${username}`}
        data-mention={username}
        className="inline-flex items-center rounded bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-1 py-0.5 font-medium text-(--accent)"
      >
        @{username}
      </span>,
    );

    lastIndex = matchEnd;
  }

  if (lastIndex === 0) {
    return text;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

export function highlightMentionsInNode(node: React.ReactNode): React.ReactNode {
  if (typeof node === "string") {
    return renderContentWithMentions(node);
  }
  if (Array.isArray(node)) {
    return React.Children.map(node, (child) => highlightMentionsInNode(child));
  }
  if (React.isValidElement(node)) {
    const props = node.props as {
      children?: React.ReactNode;
      node?: { tagName?: string };
    };
    const tagName = props?.node?.tagName?.toLowerCase();
    if (
      tagName === "code" ||
      tagName === "pre" ||
      tagName === "a" ||
      tagName === "img" ||
      tagName === "video" ||
      node.type === "code" ||
      node.type === "a" ||
      node.type === "pre" ||
      node.type === "img" ||
      node.type === "video"
    ) {
      return node;
    }
    if (props && props.children) {
      return React.cloneElement(
        node as React.ReactElement<Record<string, unknown>>,
        undefined,
        highlightMentionsInNode(props.children),
      );
    }
  }
  return node;
}

interface DiscussionMarkdownProps {
  content: DiscussionContent;
  label: string;
  /** Linked attachments allow safe suppression of legacy generated Markdown. */
  linkedAttachments?: readonly DiscussionAttachmentItem[];
  className?: string;
}

export function DiscussionMarkdown({
  content,
  label,
  linkedAttachments,
  className = "",
}: DiscussionMarkdownProps) {
  const isGeneratedAttachmentMarkdown = (
    url: string | undefined,
    label: string | undefined,
  ) =>
    Boolean(
      url &&
        label &&
        linkedAttachments?.some(
          (attachment) =>
            attachment.fileUrl === url && attachment.fileName === label,
        ),
    );

  const rawText =
    typeof content === "string"
      ? content
      : content.plainText || content.markdown || "";
  const detectedUrl = extractFirstUrl(rawText);
  const { data: linkPreview } = useLinkPreview(detectedUrl);

  return (
    <div
      role="document"
      aria-label={label}
      className={`max-w-[72ch] text-sm leading-6 text-(--text-secondary) sm:text-[15px] ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={safeMarkdownUrl}
        components={{
          a: ({ href, children }) => {
            const linkLabel = flattenMarkdownText(children);
            if (isGeneratedAttachmentMarkdown(href, linkLabel)) return null;
            return (
              <a
                href={href}
                target={href?.startsWith("#") ? undefined : "_blank"}
                rel={href?.startsWith("#") ? undefined : "noopener noreferrer"}
                className="font-medium text-(--accent-ink,var(--accent)) underline decoration-[color-mix(in_srgb,var(--accent)_45%,transparent)] underline-offset-2 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
              >
                {children}
              </a>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-3 border-(--accent) pl-4 text-(--muted)">
              {highlightMentionsInNode(children)}
            </blockquote>
          ),
          code: ({ className: codeClassName, children }) => {
            const code = String(children).replace(/\n$/, "");
            const language = /language-([^\s]+)/.exec(codeClassName ?? "")?.[1];
            if (!language && !code.includes("\n")) {
              return (
                <code className="rounded bg-[color-mix(in_srgb,var(--text)_9%,transparent)] px-1.5 py-0.5 font-mono text-[0.9em] text-(--text)">
                  {children}
                </code>
              );
            }
            return <HighlightedCodeBlock code={code} language={language} />;
          },
          h1: ({ children }) => (
            <h1 className="my-3 text-xl font-bold tracking-tight text-(--text) sm:text-2xl">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="my-2.5 text-lg font-bold tracking-tight text-(--text) sm:text-xl">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="my-2 text-base font-semibold text-(--text) sm:text-lg">
              {children}
            </h3>
          ),
          hr: () => (
            <hr className="my-4 border-t [border-color:color-mix(in_srgb,var(--text)_12%,transparent)]" />
          ),
          img: ({ src, alt }) => {
            if (!src) return null;
            const attachmentLabel = alt?.toLowerCase().startsWith("video:")
              ? alt.slice(6).trim()
              : alt;
            if (isGeneratedAttachmentMarkdown(src, attachmentLabel)) {
              return null;
            }
            if (alt?.toLowerCase().startsWith("video:")) {
              return (
                <video
                  src={src}
                  title={alt.slice(6).trim() || "Attached video"}
                  controls
                  playsInline
                  preload="metadata"
                  className="my-3 max-h-96 w-full rounded-xl bg-black object-contain"
                />
              );
            }
            return (
              <img
                src={src}
                alt={alt ?? ""}
                loading="lazy"
                className="my-3 max-h-96 max-w-full rounded-xl object-contain"
              />
            );
          },
          li: ({ children }) => <li className="pl-1">{highlightMentionsInNode(children)}</li>,
          ol: ({ children }) => (
            <ol className="my-2 list-decimal space-y-1 pl-6">{children}</ol>
          ),
          p: ({ children }) => (
            <p className="my-1.5 first:mt-0 last:mb-0">{highlightMentionsInNode(children)}</p>
          ),
          pre: ({ children }) => <>{children}</>,
          table: ({ children }) => (
            <div className="my-3 max-w-full overflow-x-auto rounded-lg shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_12%,transparent)]">
              <table className="w-full border-collapse text-left text-sm">
                {children}
              </table>
            </div>
          ),
          td: ({ children }) => (
            <td className="border-t px-3 py-2 [border-color:color-mix(in_srgb,var(--text)_10%,transparent)]">
              {highlightMentionsInNode(children)}
            </td>
          ),
          th: ({ children }) => (
            <th className="border-b px-3 py-2 font-semibold text-(--text) [border-color:color-mix(in_srgb,var(--text)_14%,transparent)]">
              {children}
            </th>
          ),
          ul: ({ children }) => (
            <ul className="my-2 list-disc space-y-1 pl-6">{children}</ul>
          ),
        }}
      >
        {content.markdown}
      </ReactMarkdown>

      {linkPreview && (
        <div className="mt-3">
          <LinkPreviewCard preview={linkPreview} compact />
        </div>
      )}
    </div>
  );
}

function flattenMarkdownText(node: React.ReactNode): string | undefined {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    const parts = node
      .map(flattenMarkdownText)
      .filter((part): part is string => part !== undefined);
    return parts.length > 0 ? parts.join("") : undefined;
  }
  return undefined;
}

interface HighlightedCodeBlockProps {
  code: string;
  language?: string;
}

interface HighlightedToken {
  content: string;
  color?: string;
  fontStyle?: number;
}

function HighlightedCodeBlock({ code, language }: HighlightedCodeBlockProps) {
  const theme = useResolvedCodeTheme();
  const [tokens, setTokens] = useState<HighlightedToken[][] | null>(null);
  const [copied, setCopied] = useState(false);
  const resolvedLanguage = resolveLanguage(language);

  useEffect(() => {
    let active = true;
    if (!resolvedLanguage) {
      setTokens(null);
      return undefined;
    }

    void highlightCode(code, resolvedLanguage, theme).then((nextTokens) => {
      if (active) setTokens(nextTokens);
    });
    return () => {
      active = false;
    };
  }, [code, resolvedLanguage, theme]);

  const copyCode = async () => {
    await navigator.clipboard?.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group/code relative my-3 overflow-hidden rounded-xl bg-[color-mix(in_srgb,var(--canvas)_82%,#111827)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_10%,transparent)]">
      <div className="flex h-9 items-center justify-between border-b px-3 [border-color:color-mix(in_srgb,var(--text)_8%,transparent)]">
        <span className="font-mono text-[11px] uppercase tracking-wide text-(--muted)">
          {language || "text"}
        </span>
        <button
          type="button"
          onClick={copyCode}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-(--accent)"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-w-full overflow-x-auto p-3 font-mono text-[13px] leading-6 [scrollbar-width:thin]">
        <code>
          {(tokens ?? fallbackTokens(code)).map((line, lineIndex) => (
            <span key={lineIndex} className="block min-h-6">
              {line.map((token, tokenIndex) => (
                <span
                  key={tokenIndex}
                  style={{
                    color: token.color,
                    fontStyle: token.fontStyle === 1 ? "italic" : undefined,
                    fontWeight: token.fontStyle === 2 ? 700 : undefined,
                  }}
                >
                  {token.content}
                </span>
              ))}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

type DiscussionShikiLanguage = keyof typeof DISCUSSION_LANGUAGE_LOADERS;

const SUPPORTED_LANGUAGES = new Map<string, DiscussionShikiLanguage>([
  ["bash", "bash"],
  ["c", "c"],
  ["cpp", "cpp"],
  ["c++", "cpp"],
  ["csharp", "csharp"],
  ["cs", "csharp"],
  ["css", "css"],
  ["dockerfile", "dockerfile"],
  ["go", "go"],
  ["html", "html"],
  ["java", "java"],
  ["javascript", "javascript"],
  ["js", "javascript"],
  ["jsx", "jsx"],
  ["json", "json"],
  ["markdown", "markdown"],
  ["md", "markdown"],
  ["php", "php"],
  ["python", "python"],
  ["py", "python"],
  ["rust", "rust"],
  ["rs", "rust"],
  ["ruby", "ruby"],
  ["rb", "ruby"],
  ["scss", "scss"],
  ["shell", "shellscript"],
  ["sh", "shellscript"],
  ["sql", "sql"],
  ["tsx", "tsx"],
  ["typescript", "typescript"],
  ["ts", "typescript"],
  ["swift", "swift"],
  ["toml", "toml"],
  ["xml", "xml"],
  ["yaml", "yaml"],
  ["yml", "yaml"],
] as const);

const DISCUSSION_LANGUAGE_LOADERS = {
  bash: () => import("@shikijs/langs/bash"),
  c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  css: () => import("@shikijs/langs/css"),
  dockerfile: () => import("@shikijs/langs/dockerfile"),
  go: () => import("@shikijs/langs/go"),
  html: () => import("@shikijs/langs/html"),
  java: () => import("@shikijs/langs/java"),
  javascript: () => import("@shikijs/langs/javascript"),
  json: () => import("@shikijs/langs/json"),
  jsx: () => import("@shikijs/langs/jsx"),
  markdown: () => import("@shikijs/langs/markdown"),
  php: () => import("@shikijs/langs/php"),
  python: () => import("@shikijs/langs/python"),
  rust: () => import("@shikijs/langs/rust"),
  ruby: () => import("@shikijs/langs/ruby"),
  scss: () => import("@shikijs/langs/scss"),
  shellscript: () => import("@shikijs/langs/shellscript"),
  sql: () => import("@shikijs/langs/sql"),
  tsx: () => import("@shikijs/langs/tsx"),
  typescript: () => import("@shikijs/langs/typescript"),
  swift: () => import("@shikijs/langs/swift"),
  toml: () => import("@shikijs/langs/toml"),
  xml: () => import("@shikijs/langs/xml"),
  yaml: () => import("@shikijs/langs/yaml"),
} satisfies Record<string, DynamicImportLanguageRegistration>;

function resolveLanguage(language?: string) {
  return language ? SUPPORTED_LANGUAGES.get(language.toLowerCase()) : undefined;
}

const tokenCache = new Map<string, HighlightedToken[][]>();
const languageLoads = new Map<DiscussionShikiLanguage, Promise<void>>();
let highlighterPromise: Promise<HighlighterCore> | null = null;

async function highlightCode(
  code: string,
  language: DiscussionShikiLanguage,
  theme: string,
) {
  const key = `${theme}\0${language}\0${code}`;
  const cached = tokenCache.get(key);
  if (cached) return cached;
  try {
    const highlighter = await getDiscussionHighlighter();
    if (!highlighter.getLoadedLanguages().includes(language)) {
      let load = languageLoads.get(language);
      if (!load) {
        load = DISCUSSION_LANGUAGE_LOADERS[language]().then(
          ({ default: lang }) => highlighter.loadLanguage(lang),
        );
        languageLoads.set(language, load);
      }
      await load;
    }
    const result = highlighter.codeToTokens(code, {
      lang: language,
      theme,
    });
    const highlighted = result.tokens as HighlightedToken[][];
    tokenCache.set(key, highlighted);
    return highlighted;
  } catch {
    return code.split("\n").map((line) => [{ content: line }]);
  }
}

function getDiscussionHighlighter() {
  highlighterPromise ??= Promise.all([
    import("@shikijs/core"),
    import("@shikijs/engine-javascript"),
    import("@shikijs/themes/github-dark"),
    import("@shikijs/themes/github-light"),
  ]).then(
    ([
      { createHighlighterCore },
      { createJavaScriptRegexEngine },
      dark,
      light,
    ]) =>
      createHighlighterCore({
        engine: createJavaScriptRegexEngine(),
        langs: [],
        themes: [dark.default, light.default],
      }),
  );
  return highlighterPromise;
}

function fallbackTokens(code: string): HighlightedToken[][] {
  return code
    .split("\n")
    .map((line) => [{ content: line, color: "currentColor" }]);
}

function useResolvedCodeTheme() {
  const [theme, setTheme] = useState(() =>
    typeof document !== "undefined" &&
    document.documentElement.dataset.theme === "light"
      ? "github-light"
      : "github-dark",
  );

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() =>
      setTheme(root.dataset.theme === "light" ? "github-light" : "github-dark"),
    );
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  return theme;
}

function safeMarkdownUrl(url: string) {
  const trimmed = url.trim();
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(trimmed)) return trimmed;
  return "";
}
