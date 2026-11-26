/*
 * Link previews for a certificate's page, `/certificate/<code>`.
 *
 * The app shell has no tags of its own for one certificate, and LinkedIn,
 * WhatsApp and X read only the HTML they are first sent. So the Worker
 * looks the certificate up in the API (through Cloudflare's cache: the API
 * answers with s-maxage=300) and writes its title and description into the
 * shell's <head>. A certificate it cannot find, or an API that does not
 * answer, leaves the shell as it is; the page itself still loads.
 *
 * Needs the Worker variable LINKS_API_URL (the API base, such as
 * https://api.example.com/v1), shared with the short links.
 */

const CERTIFICATE_PATH = /^\/certificate\/([0-9A-Za-z-]{16,40})\/?$/u;
const LOOKUP_TIMEOUT_MS = 2_500;

export function certificateCodeFromPath(pathname) {
  const match = CERTIFICATE_PATH.exec(pathname);
  return match ? match[1] : null;
}

async function lookUp(code, env) {
  if (!env.LINKS_API_URL) return null;
  const base = env.LINKS_API_URL.replace(/\/+$/u, "");
  try {
    const response = await fetch(
      `${base}/certificates/public/${encodeURIComponent(code)}`,
      {
        headers: { accept: "application/json" },
        cf: { cacheEverything: true },
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      },
    );
    if (!response.ok) return null;
    const body = await response.json();
    return body && typeof body === "object" && body.data ? body.data : null;
  } catch {
    return null;
  }
}

function describe(certificate) {
  const name = certificate.recipientName || "A learner";
  if (certificate.status !== "valid") {
    return {
      title: `Revoked certificate · ${certificate.courseTitle}`,
      description: `This certificate from ${certificate.academyName} has been revoked.`,
    };
  }
  return {
    title: `${name} completed ${certificate.courseTitle}`,
    description: `Verified certificate of completion from ${certificate.academyName}. Certificate ID ${certificate.displayCode}.`,
  };
}

/** Sets `content` on a meta tag, or adds the tag when the shell has none. */
class MetaTags {
  constructor(tags) {
    this.tags = tags;
    this.seen = new Set();
  }

  element(element) {
    const key =
      element.getAttribute("property") || element.getAttribute("name");
    if (key && key in this.tags) {
      element.setAttribute("content", this.tags[key]);
      this.seen.add(key);
    }
  }
}

class HeadEnd {
  constructor(meta, title) {
    this.meta = meta;
    this.title = title;
  }

  element(element) {
    element.onEndTag((end) => {
      const missing = Object.entries(this.meta.tags)
        .filter(([key]) => !this.meta.seen.has(key))
        .map(([key, value]) => {
          const attribute = key.startsWith("og:") ? "property" : "name";
          return `<meta ${attribute}="${escapeHtml(key)}" content="${escapeHtml(value)}">`;
        })
        .join("");
      end.before(missing, { html: true });
    });
  }
}

// Not `text`: HTMLRewriter reads a handler's `text` as its text-chunk
// callback and throws when it is not a function.
class Title {
  constructor(value) {
    this.value = value;
  }

  element(element) {
    element.setInnerContent(this.value);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * The shell response with the certificate's tags, or the shell unchanged.
 * `shell` is the app shell the Worker would send for this address.
 */
export async function withCertificateMeta(request, env, shell) {
  const url = new URL(request.url);
  const code = certificateCodeFromPath(url.pathname);
  if (!code || !shell.ok) return shell;
  const certificate = await lookUp(code, env);
  if (!certificate) return shell;
  const { title, description } = describe(certificate);
  const canonical = `${url.origin}/certificate/${certificate.code}`;
  const meta = new MetaTags({
    description,
    robots: "noindex",
    "og:type": "website",
    "og:title": title,
    "og:description": description,
    "og:url": canonical,
    "og:site_name": certificate.academyName,
    "twitter:card": "summary",
    "twitter:title": title,
    "twitter:description": description,
  });
  const rewritten = new HTMLRewriter()
    .on("title", new Title(`${title} | ${certificate.academyName}`))
    .on("meta", meta)
    .on("head", new HeadEnd(meta))
    .transform(shell);
  const headers = new Headers(rewritten.headers);
  headers.delete("content-length");
  headers.set("cache-control", "public, max-age=0, s-maxage=300");
  return new Response(rewritten.body, { status: 200, headers });
}
