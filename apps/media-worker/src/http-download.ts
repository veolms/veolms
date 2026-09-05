import dns from "node:dns/promises";
import { createWriteStream } from "node:fs";
import { isIP } from "node:net";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

export interface DownloadLimitOptions {
  maxBytes: number;
  signal?: AbortSignal;
}

export interface HttpDownloadOptions extends DownloadLimitOptions {
  timeoutMs: number;
  maxRedirects?: number;
}

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

  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  // AWS / Cloud metadata endpoints
  if (
    host === "169.254.169.254" ||
    host === "instance-data" ||
    host === "metadata.google.internal"
  ) {
    return true;
  }

  // IPv4 private & link-local ranges
  if (isIP(host) === 4) {
    const parts = host.split(".").map((p) => parseInt(p, 10));
    if (parts.length === 4) {
      const [a, b] = parts;
      if (a === 0 || a === 127) return true; // Current network & Loopback
      if (a === 10) return true; // 10.0.0.0/8
      if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true; // 172.16.0.0/12
      if (a === 192 && b === 168) return true; // 192.168.0.0/16
      if (a === 169 && b === 254) return true; // 169.254.0.0/16 (Link-local & AWS IMDS)
    }
  }

  // IPv6 loopback, link-local, and unique-local ranges
  if (isIP(host) === 6) {
    const lower = host.toLowerCase();
    if (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fe80:") ||
      lower.startsWith("fc00:") ||
      lower.startsWith("fd00:")
    ) {
      return true;
    }
  }

  return false;
}

export function validateHttpVideoUrl(urlString: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(`Invalid video download URL: "${urlString}"`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Unsupported protocol "${parsed.protocol}" in video URL. Only HTTP and HTTPS are allowed.`,
    );
  }

  let normalizedHost = parsed.hostname.toLowerCase().trim();
  if (normalizedHost.startsWith("[") && normalizedHost.endsWith("]")) {
    normalizedHost = normalizedHost.slice(1, -1);
  }
  if (normalizedHost.endsWith(".")) {
    normalizedHost = normalizedHost.slice(0, -1);
  }

  if (isPrivateOrReservedHost(normalizedHost)) {
    throw new Error(
      `Access to private, loopback, or cloud metadata network addresses is prohibited: "${parsed.hostname}"`,
    );
  }

  return parsed;
}

export async function downloadHttpFile(
  url: string,
  localDestinationPath: string,
  options: HttpDownloadOptions,
): Promise<void> {
  const maxRedirects = options.maxRedirects ?? 5;
  let currentUrl = validateHttpVideoUrl(url).toString();
  let redirectCount = 0;

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);
  timeout.unref();

  const forwardAbort = () => controller.abort();
  options.signal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    let response: Response | undefined;

    while (redirectCount <= maxRedirects) {
      const parsedUrl = validateHttpVideoUrl(currentUrl);
      let host = parsedUrl.hostname.toLowerCase().trim();
      if (host.startsWith("[") && host.endsWith("]")) {
        host = host.slice(1, -1);
      }
      if (host.endsWith(".")) {
        host = host.slice(0, -1);
      }

      let destinationAddress = host;
      if (!isIP(host)) {
        const records = await dns.lookup(host, { all: true });
        if (!records || records.length === 0) {
          throw new Error(`Could not resolve host "${host}"`);
        }
        for (const record of records) {
          if (isPrivateOrReservedHost(record.address)) {
            throw new Error(
              `Access to private, loopback, or cloud metadata network addresses is prohibited: "${record.address}"`,
            );
          }
        }
        const firstRecord = records[0];
        if (!firstRecord) {
          throw new Error(`Could not resolve host "${host}"`);
        }
        destinationAddress = firstRecord.address;
      } else if (isPrivateOrReservedHost(destinationAddress)) {
        throw new Error(
          `Access to private, loopback, or cloud metadata network addresses is prohibited: "${destinationAddress}"`,
        );
      }

      const connectUrl = new URL(currentUrl);
      connectUrl.hostname =
        isIP(destinationAddress) === 6
          ? `[${destinationAddress}]`
          : destinationAddress;

      response = await fetch(connectUrl.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          Host: parsedUrl.host,
        },
      });

      // Handle HTTP redirects safely with target validation
      if (
        [301, 302, 303, 307, 308].includes(response.status) &&
        response.headers.has("location")
      ) {
        const locationHeader = response.headers.get("location");
        if (!locationHeader) {
          throw new Error(
            `Redirect status ${response.status} received without Location header`,
          );
        }

        const nextUrl = new URL(locationHeader, currentUrl).toString();
        currentUrl = validateHttpVideoUrl(nextUrl).toString();
        redirectCount++;
        continue;
      }

      break;
    }

    if (!response || redirectCount > maxRedirects) {
      throw new Error(
        `Too many redirects (limit: ${maxRedirects}) downloading video from ${url}`,
      );
    }

    if (!response.ok || !response.body) {
      throw new Error(
        `Failed to download video from ${currentUrl}: HTTP ${response.status}`,
      );
    }

    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > options.maxBytes) {
      throw new Error(
        `Video download from ${currentUrl} exceeds the ${options.maxBytes}-byte limit`,
      );
    }

    let downloadedBytes = 0;
    const limitStream = new Transform({
      transform(chunk: Buffer | Uint8Array, _encoding, callback) {
        downloadedBytes += chunk.byteLength;
        if (downloadedBytes > options.maxBytes) {
          callback(
            new Error(
              `Video download from ${currentUrl} exceeds the ${options.maxBytes}-byte limit`,
            ),
          );
          return;
        }
        callback(null, chunk);
      },
    });

    const webStream =
      response.body as unknown as NodeReadableStream<Uint8Array>;
    await pipeline(
      Readable.fromWeb(webStream),
      limitStream,
      createWriteStream(localDestinationPath),
    );
  } catch (error) {
    if (timedOut) {
      throw new Error(`Timed out downloading video from ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}
