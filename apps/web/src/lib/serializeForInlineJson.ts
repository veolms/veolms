/**
 * Serializes data for an inline JSON script without allowing the value to
 * terminate the surrounding HTML script element.
 */
export function serializeForInlineJson(value: unknown): string {
  return (JSON.stringify(value) ?? "null")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}
