import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import zlib from "node:zlib";
import type { Readable } from "node:stream";
import type { LinkPreviewResponse } from "@veolms/contracts";
import { config } from "../../../../config.ts";
import { httpError } from "../../../../lib/errors.ts";
import { clampText } from "../../../../lib/text.ts";

export const PREVIEW_CONSTANTS = {
  MAX_REDIRECTS: 5,
  /** Budget for the WHOLE preview: every redirect hop and the body read. */
  TIMEOUT_MS: 5000,
  MAX_RESPONSE_BYTES: 512 * 1024, // 512 KB
};

/**
 * Loopback targets are only reachable under the test runner. They used to be
 * allowed everywhere "for testing", which let any signed-in user make the
 * API fetch its own loopback interface and read back page titles from
 * services that are only meant to be reachable from the host itself.
 */
const LOOPBACK_ALLOWED = config.NODE_ENV === "test";

/**
 * Validates whether a hostname or IP address belongs to private, loopback,
 * link-local, multicast, or cloud metadata ranges.
 */
export function isPrivateOrReservedHost(
  hostname: string,
  options: { allowLoopback?: boolean } = {},
): boolean {
  const allowLoopback = options.allowLoopback ?? LOOPBACK_ALLOWED;
  let host = hostname.toLowerCase().trim();

  // Normalize IPv6 brackets
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }

  // Normalize trailing DNS dot
  if (host.endsWith(".")) {
    host = host.slice(0, -1);
  }

  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".localhost")
  ) {
    return !allowLoopback;
  }

  if (
    host === "0.0.0.0" ||
    host === "::" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".onion")
  ) {
    return true;
  }

  // AWS / Cloud metadata endpoints
  if (
    host === "169.254.169.254" ||
    host === "instance-data" ||
    host === "metadata.google.internal" ||
    host === "100.100.100.200"
  ) {
    return true;
  }

  // IPv4-mapped IPv6
  if (host.startsWith("::ffff:")) {
    const mapped = host.slice(7);
    if (isIP(mapped) === 4) {
      host = mapped;
    }
  }

  // IPv4 private, reserved, loopback, and carrier-grade NAT ranges
  if (isIP(host) === 4) {
    const parts = host.split(".").map((p) => parseInt(p, 10));
    if (parts.length === 4) {
      const [a, b] = parts;
      if (a === 127) return !allowLoopback; // Loopback
      if (a === 0) return true; // Current network
      if (a === 10) return true; // 10.0.0.0/8
      if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
      if (a === 169 && b === 254) return true; // 169.254.0.0/16 Link-local / IMDS
      if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true; // 172.16.0.0/12
      if (a === 192 && b === 0) return true; // 192.0.0.0/24 IETF Assignments
      if (a === 192 && b === 168) return true; // 192.168.0.0/16
      if (a === 198 && b !== undefined && (b === 18 || b === 19)) return true; // 198.18.0.0/15
      if (a === 198 && b === 51) return true; // 198.51.100.0/24 TEST-NET-2
      if (a === 203 && b === 0) return true; // 203.0.113.0/24 TEST-NET-3
      if (a !== undefined && a >= 224) return true; // Multicast & Future/Reserved
    }
  }

  // IPv6 loopback, link-local, site-local, unique-local, documentation,
  // multicast, and the ranges that embed an IPv4 address (which could
  // otherwise smuggle a private IPv4 destination past the checks above).
  if (isIP(host) === 6) {
    const lower = host.toLowerCase();
    if (lower === "::1") return !allowLoopback;
    if (
      lower === "::" ||
      lower.startsWith("fe8") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb") ||
      lower.startsWith("fec") || // fec0::/10 site-local
      lower.startsWith("fed") ||
      lower.startsWith("fee") ||
      lower.startsWith("fef") ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("ff") ||
      lower.startsWith("2001:db8:") ||
      lower.startsWith("64:ff9b:") || // NAT64
      lower.startsWith("2002:") || // 6to4
      lower.startsWith("::ffff:") ||
      (lower.startsWith("::") && lower.includes(".")) // IPv4-compatible
    ) {
      return true;
    }
  }

  return false;
}

/** One message for every refused destination: no resolved address is echoed. */
function ssrfProhibited() {
  return httpError(400, "SSRF_PROHIBITED", "This address cannot be previewed.");
}

function normalizeHost(hostname: string): string {
  let host = hostname.toLowerCase().trim();
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  if (host.endsWith(".")) {
    host = host.slice(0, -1);
  }
  return host;
}

export function validateSafeUrl(urlString: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw httpError(400, "INVALID_URL", `Invalid URL: "${urlString}"`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw httpError(
      400,
      "INVALID_URL_PROTOCOL",
      `Only HTTP and HTTPS URLs are supported. Received protocol: "${parsed.protocol}"`,
    );
  }

  if (isPrivateOrReservedHost(normalizeHost(parsed.hostname))) {
    throw ssrfProhibited();
  }

  return parsed;
}

/**
 * Resolves a host and returns ONE address that passed the private-range
 * check. The request is then made to exactly that address (see
 * {@link requestPinned}); resolving once for the check and letting the HTTP
 * client resolve again for the connection is what DNS rebinding exploits.
 */
async function resolvePublicAddress(
  host: string,
): Promise<{ address: string; family: 4 | 6 }> {
  const literal = isIP(host);
  if (literal) {
    if (isPrivateOrReservedHost(host)) throw ssrfProhibited();
    return { address: host, family: literal as 4 | 6 };
  }

  let records: Array<{ address: string; family: number }> = [];
  try {
    records = await dns.lookup(host, { all: true });
  } catch {
    throw httpError(
      400,
      "DNS_LOOKUP_FAILED",
      `Could not resolve host "${host}"`,
    );
  }
  if (!records || records.length === 0) {
    throw httpError(
      400,
      "DNS_LOOKUP_FAILED",
      `Could not resolve host "${host}"`,
    );
  }

  // Every answer must be public: a name with one public and one private
  // record is refused rather than hoping the public one is used.
  for (const record of records) {
    if (isPrivateOrReservedHost(record.address)) throw ssrfProhibited();
  }
  const first = records[0]!;
  return { address: first.address, family: first.family === 6 ? 6 : 4 };
}

interface PinnedResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Readable;
}

/**
 * GET over a connection pinned to an already-validated address. The URL's
 * host name is still used for the Host header and TLS (SNI and certificate
 * check); only the address the socket connects to is fixed.
 */
function requestPinned(
  url: URL,
  pinned: { address: string; family: 4 | 6 },
  signal: AbortSignal,
): Promise<PinnedResponse> {
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(
      {
        protocol: url.protocol,
        hostname: normalizeHost(url.hostname),
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        signal,
        // Never reuse a pooled socket: it could belong to another address.
        agent: false,
        lookup: (_hostname, options, callback) => {
          if (typeof options === "object" && options.all) {
            callback(null, [pinned]);
          } else {
            callback(null, pinned.address, pinned.family);
          }
        },
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
        },
      },
      (response) => {
        const encoding = String(
          response.headers["content-encoding"] ?? "",
        ).toLowerCase();
        let body: Readable = response;
        if (encoding === "gzip" || encoding === "x-gzip") {
          body = response.pipe(zlib.createGunzip());
        } else if (encoding === "deflate") {
          body = response.pipe(zlib.createInflate());
        } else if (encoding === "br") {
          body = response.pipe(zlib.createBrotliDecompress());
        }
        // A decompression error must surface as a read error, not crash.
        if (body !== response) {
          response.on("error", (error) => body.destroy(error));
        }
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body,
        });
      },
    );
    request.on("error", reject);
    request.end();
  });
}

export async function fetchSafeHtml(
  initialUrl: string,
): Promise<{ html: string; finalUrl: string }> {
  let currentUrl = validateSafeUrl(initialUrl).toString();

  // One deadline for the whole operation. It used to be cleared as soon as
  // response headers arrived, so a server that sent headers and then
  // trickled the body kept the request open indefinitely.
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, PREVIEW_CONSTANTS.TIMEOUT_MS);
  timeout.unref();

  try {
    for (
      let redirectCount = 0;
      redirectCount <= PREVIEW_CONSTANTS.MAX_REDIRECTS;
      redirectCount++
    ) {
      const parsedUrl = validateSafeUrl(currentUrl);
      const pinned = await resolvePublicAddress(
        normalizeHost(parsedUrl.hostname),
      );

      let response: PinnedResponse;
      try {
        response = await requestPinned(parsedUrl, pinned, controller.signal);
      } catch {
        if (timedOut) {
          throw httpError(408, "TIMEOUT", "Timed out fetching the URL.");
        }
        throw httpError(400, "FETCH_FAILED", "Failed to fetch the URL.");
      }

      // Handle redirects ourselves so every hop is validated and pinned.
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(response.status) && location) {
        response.body.destroy();
        const nextUrl = new URL(location, currentUrl).toString();
        currentUrl = validateSafeUrl(nextUrl).toString();
        continue;
      }

      if (response.status < 200 || response.status >= 300) {
        response.body.destroy();
        return {
          html: `<title>${parsedUrl.hostname}</title>`,
          finalUrl: currentUrl,
        };
      }

      const contentType = String(response.headers["content-type"] ?? "");
      if (
        contentType &&
        !contentType.includes("text/html") &&
        !contentType.includes("application/xhtml+xml") &&
        !contentType.includes("text/plain")
      ) {
        response.body.destroy();
        return { html: "", finalUrl: currentUrl };
      }

      const declaredSize = Number(response.headers["content-length"]);
      if (
        Number.isFinite(declaredSize) &&
        declaredSize > PREVIEW_CONSTANTS.MAX_RESPONSE_BYTES * 10
      ) {
        response.body.destroy();
        throw httpError(
          413,
          "RESPONSE_TOO_LARGE",
          `Response size exceeds maximum allowed size of ${PREVIEW_CONSTANTS.MAX_RESPONSE_BYTES} bytes`,
        );
      }

      const chunks: Buffer[] = [];
      let receivedBytes = 0;
      try {
        for await (const chunk of response.body) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          chunks.push(buffer);
          receivedBytes += buffer.length;
          if (receivedBytes >= PREVIEW_CONSTANTS.MAX_RESPONSE_BYTES) break;
        }
      } catch {
        if (timedOut) {
          throw httpError(408, "TIMEOUT", "Timed out fetching the URL.");
        }
        // A truncated or undecodable body still yields whatever was read:
        // the <head> metadata usually arrives in the first chunk.
      } finally {
        response.body.destroy();
      }

      const decoder = new TextDecoder("utf-8", {
        fatal: false,
        ignoreBOM: true,
      });
      return {
        html: decoder.decode(Buffer.concat(chunks)),
        finalUrl: currentUrl,
      };
    }

    throw httpError(
      400,
      "TOO_MANY_REDIRECTS",
      `Exceeded maximum of ${PREVIEW_CONSTANTS.MAX_REDIRECTS} redirects`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return "";
      }
    })
    .replace(/&#([0-9]+);/gi, (_, dec) => {
      try {
        return String.fromCodePoint(parseInt(dec, 10));
      } catch {
        return "";
      }
    })
    .trim();
}

export function extractLinkMetadata(
  html: string,
  pageUrl: string,
): LinkPreviewResponse {
  const parsedPageUrl = new URL(pageUrl);
  let title: string | null = null;
  let description: string | null = null;
  let siteName: string | null = null;
  let imageUrl: string | null = null;

  const metaTagRegex = /<meta\s+([^>]*?)>/gi;
  let match: RegExpExecArray | null;

  while ((match = metaTagRegex.exec(html)) !== null) {
    const tagAttributes = match[1] ?? "";
    const propertyMatch =
      /property=["']([^"']+)["']/i.exec(tagAttributes) ||
      /name=["']([^"']+)["']/i.exec(tagAttributes);
    const contentMatch = /content=["']([^"']*)["']/i.exec(tagAttributes);

    if (propertyMatch && contentMatch) {
      const prop = propertyMatch[1]!.toLowerCase().trim();
      const content = contentMatch[1]!.trim();

      if (!title && (prop === "og:title" || prop === "twitter:title")) {
        title = decodeHtmlEntities(content);
      }
      if (
        !description &&
        (prop === "og:description" ||
          prop === "twitter:description" ||
          prop === "description")
      ) {
        description = decodeHtmlEntities(content);
      }
      if (!siteName && (prop === "og:site_name" || prop === "twitter:site")) {
        siteName = decodeHtmlEntities(content);
      }
      if (
        !imageUrl &&
        (prop === "og:image" ||
          prop === "og:image:url" ||
          prop === "og:image:secure_url" ||
          prop === "twitter:image" ||
          prop === "twitter:image:src")
      ) {
        imageUrl = content;
      }
    }
  }

  // Fallback title from <title>...</title>
  if (!title) {
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (titleMatch && titleMatch[1]) {
      title = decodeHtmlEntities(titleMatch[1].replace(/\s+/g, " "));
    }
  }

  // Fallback siteName from hostname
  if (!siteName) {
    siteName = parsedPageUrl.hostname;
  }

  // Resolve and validate imageUrl
  let resolvedImageUrl: string | null = null;
  if (imageUrl) {
    try {
      const resolved = new URL(imageUrl, pageUrl);
      if (
        (resolved.protocol === "http:" || resolved.protocol === "https:") &&
        !isPrivateOrReservedHost(resolved.hostname)
      ) {
        resolvedImageUrl = resolved.toString();
      }
    } catch {
      resolvedImageUrl = null;
    }
  }

  // The page controls these strings; keep them to a sane display size.
  return {
    url: pageUrl,
    title: title ? clampText(title, 300) : null,
    description: description ? clampText(description, 1000) : null,
    siteName: siteName ? clampText(siteName, 100) : null,
    imageUrl: resolvedImageUrl,
  };
}
