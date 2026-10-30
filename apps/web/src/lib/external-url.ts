/**
 * A profile link a person typed, made safe to put in an `href`: a bare
 * domain ("github.com/name") gets `https://`, as the profile settings
 * preview shows it, and anything that is not http or https is dropped.
 */
export function safeExternalUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}
