import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import type {
  DynamicImportLanguageRegistration,
  HighlighterCore,
} from "@shikijs/core";
import { useEffect, useMemo, useState } from "react";

import { cn } from "../../lib/utils";
import { detectLanguage, languageLabel } from "./detectLanguage";

/**
 * A fenced code block with syntax colours (Shiki, loaded on first use, one
 * language at a time) and a Copy button. Discussions and chat both show
 * code with it, so the two look and colour code the same way.
 */

interface HighlightedCodeBlockProps {
  code: string;
  language?: string;
  /** Spacing and alignment where it is shown (default: a discussion post's). */
  className?: string;
}

interface HighlightedToken {
  content: string;
  color?: string;
  fontStyle?: number;
}

export function HighlightedCodeBlock({
  code,
  language,
  className = "my-3",
}: HighlightedCodeBlockProps) {
  const theme = useResolvedCodeTheme();
  const [tokens, setTokens] = useState<HighlightedToken[][] | null>(null);
  const [copied, setCopied] = useState(false);
  // A block without a language name is coloured by what it looks like.
  const detected = useMemo(
    () => (language ? undefined : detectLanguage(code)),
    [code, language],
  );
  const resolvedLanguage = resolveLanguage(language || detected);
  const label =
    language ||
    (detected && resolvedLanguage ? languageLabel(detected) : "text");

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
    <div
      className={cn(
        "group/code relative overflow-hidden rounded-xl bg-[color-mix(in_srgb,var(--canvas)_82%,#111827)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_10%,transparent)]",
        className,
      )}
    >
      <div className="flex h-9 items-center justify-between border-b px-3 [border-color:color-mix(in_srgb,var(--text)_8%,transparent)]">
        <span className="font-mono text-[11px] uppercase tracking-wide text-(--muted)">
          {label}
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
      <pre className="max-w-full overflow-x-auto p-3 font-mono text-[13px] leading-6 [overflow-wrap:normal] [scrollbar-width:thin]">
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
