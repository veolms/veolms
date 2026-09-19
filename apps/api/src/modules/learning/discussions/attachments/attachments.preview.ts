import dns from "node:dns/promises";
import { isIP } from "node:net";
import type { LinkPreviewResponse } from "@veolms/contracts";
import { httpError } from "../../../../lib/errors.ts";

export const PREVIEW_CONSTANTS = {
  MAX_REDIRECTS: 5,
  TIMEOUT_MS: 5000,
  MAX_RESPONSE_BYTES: 512 * 1024, // 512 KB
};

/**
 * Validates whether a hostname or IP address belongs to private, loopback,
 * link-local, multicast, or cloud metadata ranges.
 */
export function isPrivateOrReservedHost(hostname: string): boolean {
  let host = hostname.toLowerCase().trim();

  // Normalize IPv6 brackets
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }

  // Normalize trailing DNS dot
  if (host.endsWith(".")) {
    host = host.slice(0, -1);
  }

  // Allow localhost and loopback addresses for testing purposes
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".localhost")
  ) {
    return false;
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
      if (host === "127.0.0.1" || host.startsWith("127.")) {
        return false;
      }
    }
  }

  // IPv4 private, reserved, loopback, and carrier-grade NAT ranges
  if (isIP(host) === 4) {
    const parts = host.split(".").map((p) => parseInt(p, 10));
    if (parts.length === 4) {
      const [a, b] = parts;
      if (a === 127) return false; // Loopback allowed for testing
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

  // IPv6 loopback, link-local, unique-local, documentation, and multicast ranges
  if (isIP(host) === 6) {
    const lower = host.toLowerCase();
    if (lower === "::1") return false; // Loopback allowed for testing
    if (
      lower === "::" ||
      lower.startsWith("fe80:") ||
      lower.startsWith("fe8") ||
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb") ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("ff") ||
      lower.startsWith("2001:db8:") ||
      lower.startsWith("::ffff:")
    ) {
      return true;
    }
  }

  return false;
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

  let host = parsed.hostname.toLowerCase().trim();
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  if (host.endsWith(".")) {
    host = host.slice(0, -1);
  }

  if (isPrivateOrReservedHost(host)) {
    throw httpError(
      400,
      "SSRF_PROHIBITED",
      `Access to private, loopback, or cloud metadata network addresses is prohibited: "${parsed.hostname}"`,
    );
  }

  return parsed;
}

export async function fetchSafeHtml(initialUrl: string): Promise<{ html: string; finalUrl: string }> {
  let currentUrl = validateSafeUrl(initialUrl).toString();
  let redirectCount = 0;

  while (redirectCount <= PREVIEW_CONSTANTS.MAX_REDIRECTS) {
    const parsedUrl = validateSafeUrl(currentUrl);
    let host = parsedUrl.hostname.toLowerCase().trim();
    if (host.startsWith("[") && host.endsWith("]")) {
      host = host.slice(1, -1);
    }
    if (host.endsWith(".")) {
      host = host.slice(0, -1);
    }

    let destinationAddress = host;
    if (!isIP(host)) {
      let records: Array<{ address: string; family: number }> = [];
      try {
        records = await dns.lookup(host, { all: true });
      } catch {
        throw httpError(400, "DNS_LOOKUP_FAILED", `Could not resolve host "${host}"`);
      }

      if (!records || records.length === 0) {
        throw httpError(400, "DNS_LOOKUP_FAILED", `Could not resolve host "${host}"`);
      }

      for (const record of records) {
        if (isPrivateOrReservedHost(record.address)) {
          throw httpError(
            400,
            "SSRF_PROHIBITED",
            `Host "${host}" resolves to private/reserved address "${record.address}"`,
          );
        }
      }
      destinationAddress = records[0]!.address;
    } else if (isPrivateOrReservedHost(destinationAddress)) {
      throw httpError(
        400,
        "SSRF_PROHIBITED",
        `Access to private/reserved address "${destinationAddress}" is prohibited`,
      );
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, PREVIEW_CONSTANTS.TIMEOUT_MS);
    timeout.unref();

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
    } catch (err: unknown) {
      if (timedOut) {
        throw httpError(408, "TIMEOUT", `Timed out fetching URL "${currentUrl}"`);
      }
      throw httpError(
        400,
        "FETCH_FAILED",
        `Failed to fetch URL "${currentUrl}": ${(err as Error)?.message || String(err)}`,
      );
    } finally {
      clearTimeout(timeout);
    }

    // Handle manual redirects safely
    if (
      [301, 302, 303, 307, 308].includes(response.status) &&
      response.headers.has("location")
    ) {
      const location = response.headers.get("location");
      if (!location) {
        throw httpError(400, "INVALID_REDIRECT", `Redirect response received without Location header`);
      }
      const nextUrl = new URL(location, currentUrl).toString();
      currentUrl = validateSafeUrl(nextUrl).toString();
      redirectCount++;
      continue;
    }

    if (!response.ok) {
      const parsed = new URL(currentUrl);
      return {
        html: `<title>${parsed.hostname}</title>`,
        finalUrl: currentUrl,
      };
    }

    const contentType = response.headers.get("content-type") || "";
    if (
      contentType &&
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml") &&
      !contentType.includes("text/plain")
    ) {
      return { html: "", finalUrl: currentUrl };
    }

    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > PREVIEW_CONSTANTS.MAX_RESPONSE_BYTES * 10) {
      throw httpError(
        413,
        "RESPONSE_TOO_LARGE",
        `Response size exceeds maximum allowed size of ${PREVIEW_CONSTANTS.MAX_RESPONSE_BYTES} bytes`,
      );
    }

    if (!response.body) {
      return { html: "", finalUrl: currentUrl };
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        receivedBytes += value.length;
        if (receivedBytes >= PREVIEW_CONSTANTS.MAX_RESPONSE_BYTES) {
          await reader.cancel();
          break;
        }
      }
    }

    const decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });
    const fullBuffer = Buffer.concat(chunks);
    const html = decoder.decode(fullBuffer);

    return { html, finalUrl: currentUrl };
  }

  throw httpError(
    400,
    "TOO_MANY_REDIRECTS",
    `Exceeded maximum of ${PREVIEW_CONSTANTS.MAX_REDIRECTS} redirects`,
  );
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

export function extractLinkMetadata(html: string, pageUrl: string): LinkPreviewResponse {
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

  return {
    url: pageUrl,
    title: title || null,
    description: description || null,
    siteName: siteName || null,
    imageUrl: resolvedImageUrl,
  };
}
