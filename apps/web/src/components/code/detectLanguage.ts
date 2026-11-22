/**
 * The language of a code block that does not say (older comments imported
 * from ProCodrr, and "```" without a name in chat), guessed from the code
 * itself so it is coloured like a labelled one. Each language needs clear
 * signs of itself; prose or anything unclear stays plain text.
 */

type Rule = {
  language: string;
  /** One of these settles it on its own. */
  strong?: RegExp[];
  /** Hints: at least two must match. */
  weak?: RegExp[];
};

const RULES: Rule[] = [
  { language: "php", strong: [/<\?php/] },
  {
    language: "cpp",
    strong: [/^\s*#include\s*[<"]/m, /\bstd::\w+/, /\bcout\s*<</],
  },
  {
    language: "java",
    strong: [
      /\bpublic\s+(static\s+)?(class|void|int|String)\b/,
      /System\.out\.println/,
    ],
  },
  {
    language: "go",
    strong: [/^package\s+\w+\s*$/m, /\bfmt\.Print/],
    weak: [/\bfunc\s+\w+\s*\(/, /:=/],
  },
  {
    language: "python",
    strong: [
      /^\s*def\s+\w+\s*\(.*\)\s*(->\s*[\w[\], ]+)?:\s*$/m,
      /^\s*elif\b.*:\s*$/m,
    ],
    weak: [
      /^\s*(from\s+[\w.]+\s+)?import\s+[\w., ]+\s*$/m,
      /\bprint\(/,
      /^\s*(for|while|if|with|class)\b.*:\s*$/m,
      /\bself\./,
      /\bNone\b|\bTrue\b|\bFalse\b/,
    ],
  },
  {
    language: "sql",
    strong: [
      /^\s*(SELECT\s+[\s\S]+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+(TABLE|INDEX|DATABASE))\b/im,
    ],
  },
  {
    language: "html",
    strong: [/^\s*<!doctype html/i, /<html[\s>]/i],
    weak: [
      /<\/(div|span|p|a|ul|li|body|head|section|button|h[1-6])>/i,
      /<(div|span|p|a|ul|li|img|input|button|section|h[1-6])(\s[^>]*)?>/i,
    ],
  },
  {
    language: "typescript",
    strong: [
      /^\s*(export\s+)?interface\s+\w+/m,
      /^\s*(export\s+)?type\s+\w+(<[^>]*>)?\s*=/m,
      /\b(const|let|var)\s+\w+\s*:\s*(string|number|boolean|unknown|any|\w+\[\])\b/,
      /\)\s*:\s*(string|number|boolean|void|Promise<[^>]+>)\s*(=>|\{)/,
    ],
  },
  {
    language: "javascript",
    weak: [
      /\b(const|let|var)\s+[\w{[]/,
      /=>/,
      /\bfunction\b\s*\w*\s*\(/,
      /\bconsole\.\w+\(/,
      /\brequire\(\s*["'`]/,
      /^\s*import\s+[\w{*][\s\S]*?\s+from\s+["'`]/m,
      /^\s*export\s+(default|const|function|class)\b/m,
      /\b(document|window)\.\w+/,
      /\.then\(|\basync\b|\bawait\b/,
      /\bmodule\.exports\b/,
      /\.(map|filter|forEach|reduce|on)\(/,
      /;\s*$/m,
    ],
  },
  {
    language: "css",
    strong: [/^\s*@media\b/m],
    weak: [
      /^\s*[.#]?[\w-]+(\s*[,>+~]\s*[.#]?[\w-]+)*\s*\{\s*$/m,
      /^\s*[\w-]+\s*:\s*[^;{}]+;\s*$/m,
      /\b(color|margin|padding|display|font-size|background|border|width|height)\s*:/,
    ],
  },
  {
    language: "bash",
    strong: [/^\s*#!\/(usr\/)?bin\/(env\s+)?(ba)?sh/m],
    weak: [
      /^\s*\$\s+\w/m,
      /^\s*(npm|npx|pnpm|yarn|git|cd|ls|mkdir|sudo|curl|node|docker|apt|brew)\s/m,
      /\s&&\s/,
    ],
  },
];

/** Shiki's id for a guessed language, or undefined when unsure. */
export function detectLanguage(code: string): string | undefined {
  const text = code.trim();
  if (text.length < 8) return undefined;

  if (/^[[{]/.test(text) && /[\]}]$/.test(text)) {
    try {
      JSON.parse(text);
      return "json";
    } catch {
      // Not JSON: JavaScript objects and the like are checked below.
    }
  }

  for (const rule of RULES) {
    if (rule.strong?.some((pattern) => pattern.test(text))) {
      return withJsx(rule.language, text);
    }
  }
  let best: { language: string; score: number } | null = null;
  for (const rule of RULES) {
    const score = (rule.weak ?? []).filter((pattern) =>
      pattern.test(text),
    ).length;
    if (score >= 2 && (!best || score > best.score)) {
      best = { language: rule.language, score };
    }
  }
  return best ? withJsx(best.language, text) : undefined;
}

/** JavaScript or TypeScript that returns markup is JSX / TSX. */
function withJsx(language: string, text: string): string {
  const markup =
    /return\s*\(?\s*<[A-Za-z]|=>\s*\(?\s*<[A-Za-z]|<\/[A-Za-z][\w.]*>/.test(
      text,
    );
  if (!markup) return language;
  if (language === "javascript") return "jsx";
  if (language === "typescript") return "tsx";
  return language;
}

/** Short names shown on a block, as people write them after "```". */
const SHORT_NAMES: Record<string, string> = {
  javascript: "js",
  typescript: "ts",
  python: "py",
  shellscript: "sh",
  bash: "bash",
};

export function languageLabel(language: string): string {
  return SHORT_NAMES[language] ?? language;
}
