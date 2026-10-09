/**
 * What a written quiz answer may not contain. Dependency-free, so the web
 * can check an answer as it is typed and the API can check it again when it
 * arrives: the rule is one rule in both places.
 *
 * An answer is stored through bound parameters and shown as text, so nothing
 * in it can run and nothing in it reaches a query as SQL. This rule is not
 * what keeps the platform safe; it is there so that someone pasting an
 * attack string is told, in plain words, that it is not accepted, instead of
 * having it quietly kept.
 *
 * It looks for the shapes an attack string has, not for code as such. A
 * query, a shell command or a function is an answer; a quote closed and
 * followed by a comment marker is someone trying a login form.
 */

/** Shown to the learner. Says what to do, and names no internals. */
export const UNSAFE_QUIZ_ANSWER_MESSAGE =
  "Your answer contains code that is not allowed here, such as a script tag or a database injection. Please remove it and explain your answer in your own words.";

const QUOTE = `['"\`]`;

/** Markup that runs or loads something in a page. */
const WEB_PATTERNS: readonly RegExp[] = [
  // Tags that exist to run script or pull in outside content. Written as a
  // browser reads a tag: the name straight after the bracket, then a space,
  // a slash or the closing bracket. That keeps code such as `i<base.length`
  // and prose such as "count < base" out of it.
  /<\/?(?:script|iframe|frame|frameset|object|embed|applet|svg|math|link|meta|base|style)(?=[\s>/]|$)/i,
  // An inline event handler inside a tag: `<img src=x onerror=...>`. A value
  // in braces is left alone: that is how React code is written
  // (`onClick={save}`), and an answer in a React lesson will have it.
  /<[a-z!/][^>]*[\s/"'`]on[a-z]{3,}\s*=(?!\s*\{)/i,
  // A script address written as code: `javascript:alert(1)`.
  /(?:javascript|vbscript):(?=\S)/i,
  // Server-side tags and XML entities.
  /<\?(?:php|=)/i,
  /<!ENTITY\b/i,
];

/** A script or HTML address where a page would follow it. */
const WEB_PATTERNS_COMPACT: readonly RegExp[] = [
  /(?:href|src|action|formaction|data)=["'`]?(?:javascript|vbscript|data:text\/html)/i,
  /\]\((?:javascript|vbscript|data:text\/html)/i,
];

/**
 * The shapes of a database injection. Each is something a query written as
 * an answer does not have: a string closed and then commented out, a
 * condition that compares a value with itself, a second statement hung on
 * a closing quote.
 */
const DATABASE_PATTERNS: readonly RegExp[] = [
  // `admin'--` : a closing quote run straight into a comment.
  new RegExp(`${QUOTE}--`),
  // `admin' --` or `admin' #` with nothing after it on the line. A comment
  // that says something (`'bob' -- filter by name`) is a comment.
  new RegExp(`${QUOTE}\\s*(?:--|#)[ \\t]*(?:$|\\n)`),
  // `'/**/OR/**/1=1` : comments standing in for spaces.
  new RegExp(`${QUOTE}\\s*/\\*.*?\\*/`),
  // `OR 1=1`, `' OR 'a'='a`, `') OR ('1'='1`, `|| 1=1` : always true.
  new RegExp(
    `(?:\\b(?:or|and)\\b|\\|\\|)\\s*\\(?\\s*${QUOTE}?(\\w+)${QUOTE}?\\s*=\\s*${QUOTE}?\\1(?!\\w)`,
    "i",
  ),
  // `" OR ""="` : the same with nothing between the quotes.
  /\b(?:or|and)\s+(['"])\1\s*=\s*\1/i,
  // `'; DROP TABLE users`, `1; DELETE FROM users` : a second statement hung
  // on the end of a value. Each is spelled as SQL spells it, so JavaScript
  // that follows a string (`"use strict"; update(x)`) is not taken for one.
  new RegExp(
    `(?:${QUOTE}|\\b\\d+)\\s*;\\s*(?:drop\\s+(?:table|database|schema|index|view|user)|truncate\\s+table|alter\\s+(?:table|user|database)|delete\\s+from|insert\\s+into|update\\s+\\w+\\s+set|create\\s+(?:table|user|database)|grant\\s+\\w+|exec(?:ute)?\\s+(?:xp_|sp_)|shutdown\\b)`,
    "i",
  ),
  // `' UNION SELECT ...` and `UNION SELECT NULL, 1, version()` : reading
  // another table through this one. A plain `a UNION SELECT b FROM y` is a
  // query and passes.
  new RegExp(`${QUOTE}\\s*\\)?\\s*union\\s+(?:all\\s+)?select\\b`, "i"),
  /\bunion\s+(?:all\s+)?select\s+(?:null\b|\d+\s*(?:,|--|#|$)|@@|(?:char|concat|version|user|database|current_user|group_concat|load_file)\s*\()/i,
  // Making the database wait, to find out whether it listened.
  new RegExp(
    `(?:\\b(?:or|and|select)\\s+|${QUOTE}\\s*;?\\s*)(?:pg_sleep|sleep|benchmark)\\s*\\(`,
    "i",
  ),
  /\bpg_sleep\s*\(/i,
  /\bwaitfor\s+delay\b/i,
  // Reaching the server through the database.
  /\bxp_cmdshell\b/i,
  /\bload_file\s*\(/i,
  /\binto\s+(?:out|dump)file\b/i,
  // The same idea for a document database: `{"$gt": ""}`, `$where: ...`.
  /\$(?:gt|gte|ne)["']?\s*:\s*(?:""|'')/i,
  /\$where["']?\s*:/i,
];

/** Probes aimed at the server itself. */
const SERVER_PATTERNS: readonly RegExp[] = [
  // System files that only an attack asks for.
  /\/etc\/(?:passwd|shadow)\b/i,
  /\b(?:boot|win)\.ini\b/i,
  // `rm -rf /` : everything, not a folder.
  /\brm\s+-[a-z]*r[a-z]*\s+(?:--no-preserve-root\s+)?\/(?:\*|\s|$)/i,
  // `{{7*7}}`, `${7*7}`, `<%= 7*7 %>` : arithmetic sent to see whether a
  // template engine works it out. Ordinary template code (`${name}`,
  // `{{ title }}`) is not arithmetic on two numbers.
  /(?:\{\{|[$#]\{|<%=?)\s*\d+\s*[*+]\s*\d+\s*(?:\}\}|\}|%>)/,
  /\$\{jndi:/i,
  // The address cloud machines answer their own secrets on.
  /\b169\.254\.169\.254\b/,
];

const NAMED_ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
  colon: ":",
  tab: " ",
  newline: " ",
};

const fromCodePoint = (value: number) =>
  Number.isFinite(value) && value >= 0 && value <= 0x10ffff
    ? String.fromCodePoint(value)
    : "";

/** One pass of the encodings a payload hides behind: `%27`, `&#39;`, `&lt;`. */
function decodeOnce(text: string): string {
  return text
    .replace(/%([0-9a-f]{2})/gi, (_, hex: string) =>
      fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#x([0-9a-f]{1,6});?/gi, (_, hex: string) =>
      fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d{1,7});?/g, (_, digits: string) =>
      fromCodePoint(Number.parseInt(digits, 10)),
    )
    .replace(
      /&(lt|gt|amp|quot|apos|colon|tab|newline);?/gi,
      (_, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? "",
    );
}

/** Curly quotes, as a phone keyboard or a pasted document writes them. */
const straightenQuotes = (text: string) =>
  text.replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"');

export function hasUnsafeQuizAnswerContent(value: string): boolean {
  if (!value) return false;

  // Decoded twice, for a payload encoded twice. Invisible characters are
  // dropped first: they are used to split a word a filter is looking for.
  const visible = value.replace(/\p{Cf}/gu, "");
  const decoded = straightenQuotes(
    decodeOnce(decodeOnce(visible)).replace(/\p{Cf}/gu, ""),
  );
  // Control characters read as spaces; a browser ignores tabs and line
  // breaks inside an address, so those are checked with none at all.
  const spaced = decoded.replace(/[^\P{Cc}\n]/gu, " ");
  const compact = decoded.replace(/[\s\p{Cc}]/gu, "");

  return (
    WEB_PATTERNS.some((pattern) => pattern.test(spaced)) ||
    WEB_PATTERNS_COMPACT.some((pattern) => pattern.test(compact)) ||
    DATABASE_PATTERNS.some((pattern) => pattern.test(spaced)) ||
    SERVER_PATTERNS.some((pattern) => pattern.test(spaced))
  );
}
