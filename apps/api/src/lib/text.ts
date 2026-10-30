/**
 * Shortens text to at most `maxLength` UTF-16 code units — the unit zod's
 * `.max()` and JavaScript's `.length` count — ending with an ellipsis when
 * anything was cut.
 *
 * Response schemas are stricter than what several writers can produce
 * (a notification title is "New reply on " + a 255-character thread title;
 * SQL `left(text, 500)` counts code points, so one emoji makes the result
 * 501 units long). A value one unit over its schema limit does not get
 * trimmed by the serializer: it turns the whole response into a 500. Clamp
 * with this wherever such a value is produced or presented.
 */
export function clampText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 1) return value.slice(0, Math.max(0, maxLength));

  let cut = value.slice(0, maxLength - 1);
  // Never end on the first half of a surrogate pair.
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}
