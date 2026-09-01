import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import type {
  DynamicImportLanguageRegistration,
  HighlighterCore,
} from "@shikijs/core";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DiscussionContent } from "./types";

interface DiscussionMarkdownProps {
  content: DiscussionContent;
  label: string;
  className?: string;
}

export function DiscussionMarkdown({
  content,
  label,
  className = "",
}: DiscussionMarkdownProps) {
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
          a: ({ href, children }) => (
            <a
              href={href}
              target={href?.startsWith("#") ? undefined : "_blank"}
              rel={href?.startsWith("#") ? undefined : "noopener noreferrer"}
              className="font-medium text-(--accent-ink,var(--accent)) underline decoration-[color-mix(in_srgb,var(--accent)_45%,transparent)] underline-offset-2 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-3 border-(--accent) pl-4 text-(--muted)">
              {children}
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
            <h1 className="mt-5 mb-2 text-xl font-bold leading-tight text-(--text)">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-4 mb-2 text-lg font-bold leading-tight text-(--text)">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-4 mb-1.5 text-base font-semibold text-(--text)">
              {children}
            </h3>
          ),
          hr: () => (
            <hr className="my-4 border-0 border-t [border-color:color-mix(in_srgb,var(--text)_12%,transparent)]" />
          ),
          img: ({ src, alt }) => {
            if (!src) return null;
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
          li: ({ children }) => <li className="pl-1">{children}</li>,
          ol: ({ children }) => (
            <ol className="my-2 list-decimal space-y-1 pl-6">{children}</ol>
          ),
          p: ({ children }) => (
            <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>
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
              {children}
            </td>
          ),
          th: ({ children }) => (
            <th className="bg-(--hover) px-3 py-2 font-semibold text-(--text)">
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
    </div>
  );
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
