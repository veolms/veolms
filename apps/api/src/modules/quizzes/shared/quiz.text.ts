/**
 * A typed quiz answer is free text: any language, any symbols, code.
 *
 * It is never refused for what it says. A course on HTML or SQL has answers
 * that read like an attack, and a filter that turned those away would turn
 * away the right answer. What keeps the platform safe is that the answer is
 * only ever handled as text: stored through bound parameters, sent back as a
 * JSON string, shown as text and never as markup.
 *
 * What is removed here is what is not text a person typed and can break or
 * mislead a layer that handles it.
 */

/** Tabs and line breaks. A short answer is a single line. */
const LINE_WHITESPACE = /[\t\n\v\f\r\u0085\u2028\u2029]/g;

/**
 * NUL and the other control characters. PostgreSQL refuses NUL in `text` and
 * `jsonb`: one in an answer failed the save of every answer sent with it.
 */
const CONTROL_CHARACTERS = /\p{Cc}/gu;

/** Half of a surrogate pair: not a character, and refused by `jsonb` too. */
const LONE_SURROGATES = /\p{Cs}/gu;

/**
 * Characters that are invisible and change how the text around them is
 * drawn: direction overrides and isolates, the zero-width space, the word
 * joiner, the byte-order mark. They let an answer be shown as something
 * other than what was stored. The joiners that Indic scripts and emoji
 * need (U+200C, U+200D) are not among them.
 */
const DISPLAY_SPOOFING_CHARACTERS =
  /[\u200B\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/g;

/** Every invisible formatting character, joiners included. */
const FORMAT_CHARACTERS = /\p{Cf}/gu;

/** A typed answer as it is stored. */
export function cleanQuizTextAnswer(value: string): string {
  return value
    .replace(LINE_WHITESPACE, " ")
    .replace(CONTROL_CHARACTERS, "")
    .replace(LONE_SURROGATES, "")
    .replace(DISPLAY_SPOOFING_CHARACTERS, "")
    .normalize("NFC")
    .trim();
}

/**
 * The form two answers are compared in: what the learner typed and what the
 * author accepts. Letter case, runs of spaces and invisible characters do
 * not decide whether an answer is right, so a pasted answer carrying a
 * zero-width space, or "é" typed as two code points, still matches.
 */
export function comparableQuizText(value: string): string {
  return cleanQuizTextAnswer(value)
    .replace(FORMAT_CHARACTERS, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}
