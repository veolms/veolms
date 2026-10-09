/**
 * What a written quiz answer may not contain. Dependency-free, so the web
 * can check an answer as it is typed and the API can check it again when it
 * arrives: the rule is one rule in both places.
 *
 * An answer is stored and shown as text, so nothing in it can run. This
 * rule is not what keeps the platform safe; it is there so that someone
 * pasting an attack payload is told, in plain words, that it is not
 * accepted, instead of having it quietly kept.
 *
 * It looks only for markup whose purpose is to run or load something in a
 * page. Ordinary code is left alone: an answer about loops, queries or
 * functions is an answer.
 */

/** Shown to the learner. Says what to do, and names no internals. */
export const UNSAFE_QUIZ_ANSWER_MESSAGE =
  "Your answer contains web code that cannot be submitted, such as a script tag. Please remove it and explain it in your own words.";

/**
 * Tags that exist to run script or pull in outside content. Written as a
 * browser reads a tag: the name straight after the bracket, then a space, a
 * slash or the closing bracket. That keeps code such as `i<base.length` and
 * prose such as "count < base" out of it.
 */
const ACTIVE_TAG =
  /<\/?(?:script|iframe|frame|frameset|object|embed|applet|svg|math|link|meta|base|style)(?=[\s>/]|$)/i;

/**
 * An inline event handler inside a tag: `<img src=x onerror=...>`. A value in
 * braces is left alone: that is how React code is written (`onClick={save}`),
 * and an answer in a React lesson will have it.
 */
const EVENT_HANDLER = /<[a-z!/][^>]*[\s/"'`]on[a-z]{3,}\s*=(?!\s*\{)/i;

/** A script address written as code: `javascript:alert(1)`. */
const SCRIPT_ADDRESS = /(?:javascript|vbscript):(?=\S)/i;

/** A script or HTML address where a page would follow it. */
const SCRIPT_ADDRESS_IN_ATTRIBUTE =
  /(?:href|src|action|formaction|data)=["'`]?(?:javascript|vbscript|data:text\/html)/i;
const SCRIPT_ADDRESS_IN_LINK = /\]\((?:javascript|vbscript|data:text\/html)/i;

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

/** One pass of the encodings a payload hides behind: `%3C`, `&#60;`, `&lt;`. */
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

export function hasUnsafeQuizAnswerContent(value: string): boolean {
  if (!value) return false;

  // Decoded twice, for a payload encoded twice. Invisible characters are
  // dropped first: they are used to split a word a filter is looking for.
  const visible = value.replace(/\p{Cf}/gu, "");
  const decoded = decodeOnce(decodeOnce(visible)).replace(/\p{Cf}/gu, "");
  // A browser ignores tabs and line breaks inside an address.
  const compact = decoded.replace(/[\s\p{Cc}]/gu, "");

  return (
    ACTIVE_TAG.test(decoded) ||
    EVENT_HANDLER.test(decoded.replace(/\p{Cc}/gu, " ")) ||
    SCRIPT_ADDRESS.test(decoded) ||
    SCRIPT_ADDRESS_IN_ATTRIBUTE.test(compact) ||
    SCRIPT_ADDRESS_IN_LINK.test(compact)
  );
}
