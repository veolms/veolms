/**
 * The only way section renderers write HTML. Every interpolated value is
 * escaped unless it is already `Html` (made by `html` itself), so creator
 * text can never become markup.
 */

const HTML_BRAND = Symbol("html");

export interface Html {
  readonly [HTML_BRAND]: true;
  readonly value: string;
}

type Part = Html | string | number | null | undefined | false | readonly Part[];

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"'`]/gu, (character) => ESCAPES[character]!);
}

function isHtml(value: unknown): value is Html {
  return typeof value === "object" && value !== null && HTML_BRAND in value;
}

function toText(part: Part): string {
  if (part === null || part === undefined || part === false) return "";
  if (Array.isArray(part)) return part.map(toText).join("");
  if (isHtml(part)) return part.value;
  return escapeHtml(String(part));
}

/** Markup that is trusted because our code wrote it. */
export function raw(value: string): Html {
  return { [HTML_BRAND]: true, value };
}

export function html(strings: TemplateStringsArray, ...parts: Part[]): Html {
  let result = strings[0] ?? "";
  parts.forEach((part, index) => {
    result += toText(part) + (strings[index + 1] ?? "");
  });
  return raw(result);
}

/** Plain text with its line breaks kept. */
export function lines(value: string): Html {
  return raw(
    value
      .split(/\r?\n/u)
      .map((line) => escapeHtml(line))
      .join("<br>"),
  );
}

/** Joins classes, skipping empty ones. */
export function classes(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(" ");
}
