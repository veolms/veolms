/**
 * Clears other services' leftover cookies when a browser carries too many
 * for this site.
 *
 * Cookies set for the whole domain (".procodrr.com") go with every API call
 * too. Some learners' Chrome profiles still hold large cookies from the
 * site's earlier platform and its chat and analytics tools, and past about
 * 16 KB the API answered 431 "Request Header Fields Too Large" without CORS
 * headers: Chrome then showed every call as a "CORS error" (the preflight,
 * which carries no cookies, still showed 200), while incognito and other
 * browsers worked. The API now accepts bigger headers too (api-core
 * factory.ts); this keeps a browser well under the limits of the network in
 * between.
 *
 * Only cookies this page can see are touched, only when the total is large,
 * and the site's own cookies are kept.
 */

/** Below this, nothing is cleared. */
const LIMIT_CHARS = 6_000;
/** Ours, or needed by sign-in: never cleared. */
const KEEP = [/^veolms/i, /^g_state$/, /^__cf/, /^cf_/];

export function clearOversizedCookies(): void {
  if (typeof document === "undefined") return;
  let cookies: string;
  try {
    cookies = document.cookie;
  } catch {
    return;
  }
  if (cookies.length < LIMIT_CHARS) return;
  const host = window.location.hostname;
  const parts = host.split(".");
  // This host and each parent domain (procodrr.com, .procodrr.com, …).
  const domains = parts
    .map((_, i) => parts.slice(i).join("."))
    .filter((domain) => domain.includes("."));
  for (const entry of cookies.split("; ")) {
    const name = entry.split("=")[0]?.trim();
    if (!name || KEEP.some((keep) => keep.test(name))) continue;
    const expired = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    document.cookie = expired;
    for (const domain of domains) {
      document.cookie = `${expired}; domain=.${domain}`;
    }
  }
}
