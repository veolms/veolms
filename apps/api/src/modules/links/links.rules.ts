import { normalizeShortLinkPath } from "@veolms/contracts";

/**
 * Pure rules for short links (docs/short-links.md): which paths are taken by
 * the site itself, which destinations are allowed, and what to suggest.
 */

/**
 * First segments the site's hosting and the API use, apart from the app's
 * pages (those come from the route tree). Anything starting with `_` or `.`
 * is refused as well (`/_s/` analytics, `/__spa-fallback.html`,
 * `/.well-known/`).
 */
export const INFRASTRUCTURE_SEGMENTS: ReadonlySet<string> = new Set([
  "api",
  "v1",
  "cdn",
  "assets",
  "static",
  "docs",
  "health",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "manifest.webmanifest",
]);

export type PathClash =
  | { kind: "invalid" }
  | { kind: "reserved"; segment: string }
  | { kind: "app"; segment: string };

/**
 * Why a path can never be a link, before looking at other links and
 * usernames: not a valid path, a reserved prefix, or one of the app's pages.
 */
export function findStaticClash(
  path: string,
  appSegments: ReadonlySet<string>,
): PathClash | null {
  const normalized = normalizeShortLinkPath(path);
  if (!normalized) return { kind: "invalid" };
  const first = normalized.slice(1).split("/")[0]!;
  if (
    first.startsWith("_") ||
    first.startsWith(".") ||
    INFRASTRUCTURE_SEGMENTS.has(first)
  ) {
    return { kind: "reserved", segment: first };
  }
  if (appSegments.has(first)) return { kind: "app", segment: first };
  return null;
}

/** Words for the form: why this path cannot be used. */
export function describeClash(
  clash: PathClash | { kind: "link" } | { kind: "username" },
): string {
  switch (clash.kind) {
    case "invalid":
      return "Use letters, numbers, dots, dashes or underscores, up to three parts separated by /.";
    case "reserved":
      return `/${clash.segment} is reserved by the site.`;
    case "app":
      return `/${clash.segment} is a page of the app.`;
    case "link":
      return "Another link already uses this path.";
    case "username":
      return "A learner's profile lives at this address.";
  }
}

/**
 * Candidates close to a taken path: `/nodejs` → `/nodejs-2`, `/nodejs-3`...
 * For a path under an app page (`/courses/x`) the page's segment is dropped
 * first (`/x`).
 */
export function suggestAlternatives(path: string): string[] {
  const normalized = normalizeShortLinkPath(path);
  const base =
    normalized ??
    `/${
      path
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/gu, "-")
        .replace(/^[^a-z0-9]+|-+$/gu, "")
        .slice(0, 40) || "go"
    }`;
  const parts = base.slice(1).split("/");
  const last = parts.at(-1)!;
  const bases = [base];
  if (parts.length > 1) bases.push(`/${last}`);
  const candidates: string[] = [];
  for (const candidateBase of bases) {
    candidates.push(candidateBase);
    for (let n = 2; n <= 9; n += 1) candidates.push(`${candidateBase}-${n}`);
  }
  candidates.push(`/go/${last}`);
  return candidates.filter(
    (candidate) => normalizeShortLinkPath(candidate) === candidate,
  );
}

const RANDOM_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** A short random path (`/k7m2xq`), for a link left without one. */
export function randomShortPath(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let path = "/";
  for (const byte of bytes) {
    path += RANDOM_ALPHABET[byte % RANDOM_ALPHABET.length];
  }
  return path;
}

/**
 * Why a destination is refused, or null when it is fine: https only, a real
 * host name, no user name or password in it, and not this site or its API
 * (the link would lead back to itself).
 */
export function checkDestination(
  value: string,
  ownHosts: ReadonlySet<string>,
): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return "Enter a full address, starting with https://";
  }
  if (url.protocol !== "https:") {
    return "Only https:// addresses can be used.";
  }
  if (url.username || url.password) {
    return "The address may not contain a user name or password.";
  }
  const host = url.hostname.toLowerCase().replace(/\.$/u, "");
  if (
    !host.includes(".") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    /^[\d.]+$/u.test(host) ||
    host.startsWith("[")
  ) {
    return "Use a public site's address, not an IP address or a local name.";
  }
  if (ownHosts.has(host)) {
    return "For a page on this site, enter its path, such as /courses/…";
  }
  return null;
}

/** A destination given as a path: a page on this site. */
export function isPageDestination(value: string): boolean {
  return value.trim().startsWith("/");
}

/**
 * A page on this site as a link's destination (redirect only), given as its
 * path, such as `/courses/the-complete-javascript-course/overview`, with a
 * query or #part if wanted: old addresses (another platform's checkout
 * pages) sent to the page that replaces them. Its first segment must be one
 * of the app's own, so it is a page of the app and never another link (a
 * link cannot lead on to a link). Gives the cleaned path, or why not.
 */
export function checkPageDestination(
  value: string,
  appSegments: ReadonlySet<string>,
): { path: string } | { problem: string } {
  const trimmed = value.trim();
  const asPath =
    "Enter the page's path, starting with one /, such as /courses/…";
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\")
  ) {
    return { problem: asPath };
  }
  const base = "https://site.invalid";
  let url: URL;
  try {
    url = new URL(trimmed, base);
  } catch {
    return { problem: asPath };
  }
  if (url.origin !== base) return { problem: asPath };
  const first = (url.pathname.split("/")[1] ?? "").toLowerCase();
  if (first && !appSegments.has(first)) {
    return {
      problem: `/${first} is not a page of this site. Use the address of one of its pages, such as /courses/…`,
    };
  }
  return { path: `${url.pathname}${url.search}${url.hash}` };
}

/**
 * This site's own host names, from its configured addresses: each one, and
 * the bare and `www.` forms of the site.
 */
export function collectOwnHosts(urls: readonly (string | undefined)[]) {
  const hosts = new Set<string>();
  for (const value of urls) {
    if (!value) continue;
    try {
      const host = new URL(value).hostname.toLowerCase();
      hosts.add(host);
      if (host.startsWith("www.")) hosts.add(host.slice(4));
      else hosts.add(`www.${host}`);
    } catch {
      // Not a URL (a relative API base): nothing to add.
    }
  }
  return hosts;
}
