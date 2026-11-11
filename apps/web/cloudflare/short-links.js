/*
 * Short links (docs/short-links.md), answered by the website Worker before
 * its app shell fallback.
 *
 * The Worker only runs for addresses with no built file, and the link step is
 * skipped for any address whose first segment is one of the app's pages (the
 * build writes them to /__app-paths.json), so app pages never wait on it.
 * Other addresses are looked up in the API through Cloudflare's cache: the
 * API marks each answer, "no link here" included, as cacheable at the edge
 * and purges it when the link changes.
 *
 * Needs the Worker variable LINKS_API_URL (the API base, such as
 * https://api.example.com/v1); without it there are no links.
 */

// Same rule as normalizeShortLinkPath in @veolms/contracts.
const PATH_PATTERN = /^(\/[a-z0-9][a-z0-9._-]{0,63}){1,3}$/u;
const PATH_MAX_LENGTH = 120;
// Under a rewrite link, `<link>/~/<path>` is <path> on the destination's host.
const PROXY_MARK = "/~/";
const LOOKUP_TIMEOUT_MS = 3_000;
const PROXY_TIMEOUT_MS = 15_000;
const PAGE_EDGE_SECONDS = 60;
const FILE_EDGE_SECONDS = 300;

// The proxied page runs as an opaque origin: it cannot read this site's
// cookies or storage, nor call its API with the visitor's session.
const SANDBOX_POLICY =
  "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-top-navigation-by-user-activation";
const FORWARDED_REQUEST_HEADERS = ["accept", "accept-language", "user-agent"];
const KEPT_RESPONSE_HEADERS = [
  "content-type",
  "content-language",
  "content-disposition",
  "etag",
  "last-modified",
];

let appSegmentsPromise = null;

/** The app's first path segments, read once per Worker instance. */
function readAppSegments(request, env) {
  appSegmentsPromise ??= env.ASSETS.fetch(
    new Request(new URL("/__app-paths.json", request.url)),
  )
    .then((response) => (response.ok ? response.json() : { segments: [] }))
    .then((body) => new Set(Array.isArray(body?.segments) ? body.segments : []))
    .catch(() => new Set());
  return appSegmentsPromise;
}

export function normalizeLinkPath(pathname) {
  let path;
  try {
    path = decodeURIComponent(pathname).trim().toLowerCase();
  } catch {
    return null;
  }
  if (path.length === 0 || path.length > PATH_MAX_LENGTH) return null;
  path = path.replace(/\/+$/u, "");
  return PATH_PATTERN.test(path) ? path : null;
}

async function resolveLink(path, env) {
  const base = env.LINKS_API_URL.replace(/\/+$/u, "");
  try {
    const response = await fetch(
      `${base}/links/resolve?path=${encodeURIComponent(path)}`,
      {
        headers: {
          accept: "application/json",
          // Read the main database, not a replica that may lag a change.
          "x-veolms-consistency": "primary",
        },
        cf: { cacheEverything: true },
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      },
    );
    if (!response.ok) return null;
    const body = await response.json();
    const link = body?.data?.link ?? body?.link ?? null;
    return link && typeof link.destination === "string" ? link : null;
  } catch {
    // The API being slow or down must not break the page behind the path.
    return null;
  }
}

function countVisit(link, env, ctx) {
  const base = env.LINKS_API_URL.replace(/\/+$/u, "");
  ctx?.waitUntil?.(
    fetch(`${base}/links/visits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: link.id }),
    }).catch(() => {}),
  );
}

/**
 * The response for a short link at this address, or null when there is none
 * (the caller then serves the app as before).
 */
export async function handleShortLink(request, env, ctx) {
  if (!env.LINKS_API_URL) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);

  const markAt = url.pathname.indexOf(PROXY_MARK);
  const linkPart = markAt > 0 ? url.pathname.slice(0, markAt) : url.pathname;
  const path = normalizeLinkPath(linkPart);
  if (!path) return null;
  const firstSegment = path.slice(1).split("/")[0];
  if ((await readAppSegments(request, env)).has(firstSegment)) return null;

  const link = await resolveLink(path, env);
  if (!link) return null;

  if (markAt > 0) {
    if (link.mode !== "rewrite") return null;
    return await proxy(request, link, {
      prefix: `${linkPart}/~`,
      upstreamPath: url.pathname.slice(markAt + PROXY_MARK.length - 1),
      isLinkPage: false,
    });
  }

  if (request.method === "GET") countVisit(link, env, ctx);
  if (link.mode === "rewrite") {
    return await proxy(request, link, {
      prefix: `${linkPart.replace(/\/+$/u, "")}/~`,
      upstreamPath: null,
      isLinkPage: true,
    });
  }
  return redirectTo(
    withVisitorQuery(link.destination, url),
    link.redirectStatus,
  );
}

function redirectTo(location, status) {
  return new Response(null, {
    status: status === 301 ? 301 : 302,
    headers: { location, "cache-control": "private, max-age=0" },
  });
}

/** The visitor's own query (utm_*, ref) added to the destination's. */
function withVisitorQuery(destination, url) {
  if (!url.search) return destination;
  const target = new URL(destination);
  for (const [key, value] of url.searchParams) {
    if (!target.searchParams.has(key)) target.searchParams.append(key, value);
  }
  return target.toString();
}

/**
 * Shows the destination under the link's address. Only the destination's
 * own host is proxied (under `<link>/~/`); its addresses in HTML and CSS are
 * rewritten to that prefix so its files load from this origin.
 */
async function proxy(request, link, { prefix, upstreamPath, isLinkPage }) {
  const destination = new URL(link.destination);
  const visitorUrl = new URL(request.url);
  const target = isLinkPage
    ? new URL(withVisitorQuery(link.destination, visitorUrl))
    : new URL(`${upstreamPath}${visitorUrl.search}`, destination.origin);

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  let upstream;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      redirect: isLinkPage ? "follow" : "manual",
      cf: {
        cacheEverything: true,
        cacheTtl: isLinkPage ? PAGE_EDGE_SECONDS : FILE_EDGE_SECONDS,
      },
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });
  } catch {
    return isLinkPage ? redirectTo(target.toString(), 302) : badGateway();
  }

  const finalUrl = new URL(upstream.url || target.toString());
  if (finalUrl.origin !== destination.origin) {
    // The destination moved to another site: send the visitor there.
    return isLinkPage ? redirectTo(finalUrl.toString(), 302) : badGateway();
  }
  if (isLinkPage && upstream.status >= 500) {
    return redirectTo(target.toString(), 302);
  }

  const mapUrl = createUrlMapper(
    destination.origin,
    prefix,
    visitorUrl.pathname,
  );
  const responseHeaders = new Headers();
  for (const name of KEPT_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  responseHeaders.set("content-security-policy", SANDBOX_POLICY);
  responseHeaders.set("x-content-type-options", "nosniff");
  responseHeaders.set("referrer-policy", "strict-origin-when-cross-origin");
  // The sandboxed page is an opaque origin: its fonts and module scripts
  // from this prefix are cross-origin requests.
  responseHeaders.set("access-control-allow-origin", "*");
  responseHeaders.set(
    "cache-control",
    isLinkPage
      ? "public, max-age=0, must-revalidate"
      : `public, max-age=${FILE_EDGE_SECONDS}`,
  );

  const location = upstream.headers.get("location");
  if (upstream.status >= 300 && upstream.status < 400 && location) {
    responseHeaders.set(
      "location",
      mapUrl(new URL(location, target).toString()),
    );
    return new Response(null, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  const type = (upstream.headers.get("content-type") ?? "").toLowerCase();
  if (request.method === "GET" && type.includes("text/html")) {
    const documentPath = finalUrl.pathname;
    const rewritten = rewriteHtml(
      new Response(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      }),
      mapUrl,
      `${prefix}${documentPath}`,
    );
    return rewritten;
  }
  if (request.method === "GET" && type.includes("text/css")) {
    const css = rewriteCss(await upstream.text(), mapUrl);
    return new Response(css, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

function badGateway() {
  return new Response("Bad gateway", {
    status: 502,
    headers: { "content-security-policy": SANDBOX_POLICY },
  });
}

/**
 * Maps an address in the destination's page to the one the visitor's
 * browser should use: the destination's own host (or a root-relative
 * address) goes under the prefix, a fragment stays on the current page,
 * anything else is left alone (relative ones resolve through <base>).
 */
export function createUrlMapper(origin, prefix, currentPath) {
  return (raw) => {
    const value = raw.trim();
    if (value === "") return raw;
    if (value.startsWith("#")) return `${currentPath}${value}`;
    if (value.startsWith("//")) {
      const absolute = new URL(`https:${value}`);
      return absolute.origin === origin
        ? `${prefix}${absolute.pathname}${absolute.search}${absolute.hash}`
        : raw;
    }
    if (value.startsWith("/")) return `${prefix}${value}`;
    if (/^https?:/iu.test(value)) {
      try {
        const absolute = new URL(value);
        return absolute.origin === origin
          ? `${prefix}${absolute.pathname}${absolute.search}${absolute.hash}`
          : raw;
      } catch {
        return raw;
      }
    }
    return raw;
  };
}

const CSS_URL_PATTERN = /url\(\s*(['"]?)([^'")]+)\1\s*\)/giu;
const CSS_IMPORT_PATTERN = /@import\s+(['"])([^'"]+)\1/giu;

export function rewriteCss(css, mapUrl) {
  return css
    .replace(
      CSS_URL_PATTERN,
      (_match, quote, value) => `url(${quote}${mapUrl(value)}${quote})`,
    )
    .replace(
      CSS_IMPORT_PATTERN,
      (_match, quote, value) => `@import ${quote}${mapUrl(value)}${quote}`,
    );
}

const URL_ATTRIBUTES = [
  "href",
  "src",
  "action",
  "poster",
  "data",
  "formaction",
];
const SRCSET_ATTRIBUTES = ["srcset", "imagesrcset"];

/*
 * The sandboxed page has no storage of its own: reading localStorage or
 * sessionStorage throws, which stops scripts as simple as a theme toggle.
 * They get an in-memory store for the visit instead, and see no service
 * worker (registering one throws too).
 */
const STORAGE_SHIM = `<script>(function(){function m(){var d={};return{getItem:function(k){return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}["localStorage","sessionStorage"].forEach(function(n){try{window[n]}catch(e){Object.defineProperty(window,n,{value:m(),configurable:true})}});try{navigator.serviceWorker}catch(e){Object.defineProperty(navigator,"serviceWorker",{value:undefined,configurable:true})}})();</script>`;

function rewriteHtml(response, mapUrl, documentBase) {
  let styleText = "";
  return new HTMLRewriter()
    .on("head", {
      element(element) {
        element.prepend(
          `<base href="${escapeAttribute(documentBase)}">${STORAGE_SHIM}`,
          { html: true },
        );
      },
    })
    .on("*", {
      element(element) {
        for (const name of URL_ATTRIBUTES) {
          const value = element.getAttribute(name);
          if (value !== null) element.setAttribute(name, mapUrl(value));
        }
        for (const name of SRCSET_ATTRIBUTES) {
          const value = element.getAttribute(name);
          if (value !== null) {
            element.setAttribute(
              name,
              value
                .split(",")
                .map((candidate) => {
                  const [address, ...descriptor] = candidate
                    .trim()
                    .split(/\s+/u);
                  return [mapUrl(address ?? ""), ...descriptor].join(" ");
                })
                .join(", "),
            );
          }
        }
        const style = element.getAttribute("style");
        if (style !== null)
          element.setAttribute("style", rewriteCss(style, mapUrl));
      },
    })
    .on("style", {
      text(chunk) {
        styleText += chunk.text;
        if (chunk.lastInTextNode) {
          chunk.replace(rewriteCss(styleText, mapUrl), { html: true });
          styleText = "";
        } else {
          chunk.remove();
        }
      },
    })
    .transform(response);
}

function escapeAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}
