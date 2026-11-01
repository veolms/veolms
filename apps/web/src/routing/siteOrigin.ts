/**
 * The public address of the site, from the optional `VITE_SITE_URL` setting:
 * the scheme and host a visitor types, such as `https://academy.example.com`.
 *
 * A page built ahead of time cannot ask the browser where it is served, so
 * without this its share tags carry no address. Returns the origin with no
 * trailing slash, or `undefined` when the setting is empty or is not a plain
 * http(s) origin (a path, a query or credentials make it something else).
 * No imports and no `import.meta`: the build configuration reads it too.
 */
export function parseSiteOrigin(
  value: string | null | undefined,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  if (url.username || url.password || url.search || url.hash) return undefined;
  if (!/^\/*$/u.test(url.pathname)) return undefined;
  return url.origin;
}
