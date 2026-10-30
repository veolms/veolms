import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { pipeline } from "node:stream/promises";

// Ported from yt-import/src/http.js. YouTube's googlevideo CDN answers
// transient 401/403s mid-ladder, so those are retried like 5xx.

export interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  attempts?: number;
  signal?: AbortSignal;
}

class NonRetryableError extends Error {
  readonly retryable = false;
}

function retryableStatus(status: number): boolean {
  return (
    status === 401 ||
    status === 403 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

function retryDelay(attempt: number, retryAfter?: string | null): number {
  const parsed = Number(retryAfter);
  if (retryAfter && Number.isFinite(parsed) && parsed >= 0 && parsed < 300)
    return parsed * 1000;
  return (
    Math.min(30_000, 1500 * (attempt + 1)) + Math.floor(Math.random() * 1000)
  );
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("The import was cancelled.");
}

/** Resolves after `ms`, or rejects as soon as `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal!));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {},
): Promise<Response> {
  const attempts = options.attempts ?? 8;
  const timeoutMs = options.timeoutMs ?? 30_000;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (options.signal?.aborted) throw abortError(options.signal);
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);
    try {
      const response = await fetch(url, { headers: options.headers, signal });
      if (response.ok) return response;
      if (!retryableStatus(response.status) || attempt === attempts - 1) {
        throw new NonRetryableError(
          `HTTP ${response.status} while fetching ${redactUrl(url)}`,
        );
      }
      await response.body?.cancel().catch(() => {});
      await sleep(
        retryDelay(attempt, response.headers.get("retry-after")),
        options.signal,
      );
    } catch (error) {
      lastError = error;
      if (options.signal?.aborted) throw abortError(options.signal);
      if (error instanceof NonRetryableError || attempt === attempts - 1) break;
      await sleep(retryDelay(attempt), options.signal);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Unable to fetch ${redactUrl(url)}`);
}

export async function fetchText(
  url: string,
  options: FetchOptions = {},
): Promise<string> {
  const response = await fetchWithRetry(url, options);
  return response.text();
}

function httpGetStream(
  url: string,
  options: FetchOptions,
  redirects = 0,
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(
      url,
      {
        headers: options.headers,
        timeout: options.timeoutMs ?? 30_000,
        signal: options.signal,
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          if (redirects >= 5) {
            reject(new Error(`Too many redirects for ${redactUrl(url)}`));
            return;
          }
          const redirectUrl = new URL(res.headers.location, url).toString();
          httpGetStream(redirectUrl, options, redirects + 1).then(
            resolve,
            reject,
          );
          return;
        }
        resolve(res);
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error(`Timeout fetching ${redactUrl(url)}`));
    });
    req.on("error", reject);
  });
}

export interface DownloadResult {
  bytes: number;
  cached: boolean;
}

/**
 * Streams `url` to `destination` through a `.part` file. A non-empty
 * destination from an earlier attempt is reused, which is what makes an
 * interrupted segment download resumable.
 */
export async function downloadFile(
  url: string,
  destination: string,
  options: FetchOptions = {},
): Promise<DownloadResult> {
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  try {
    const existing = await fsp.stat(destination);
    if (existing.size > 0) return { bytes: existing.size, cached: true };
  } catch {
    // not downloaded yet
  }
  const attempts = options.attempts ?? 8;
  const partial = `${destination}.part`;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (options.signal?.aborted) throw abortError(options.signal);
    await fsp.rm(partial, { force: true }).catch(() => {});
    try {
      const res = await httpGetStream(url, options);
      const status = res.statusCode ?? 0;
      if (status !== 200) {
        res.resume();
        if (!retryableStatus(status) || attempt === attempts - 1) {
          throw new NonRetryableError(
            `HTTP ${status} while fetching ${redactUrl(url)}`,
          );
        }
        const retryAfter = res.headers["retry-after"];
        await sleep(
          retryDelay(
            attempt,
            Array.isArray(retryAfter) ? retryAfter[0] : retryAfter,
          ),
          options.signal,
        );
        continue;
      }
      await pipeline(res, fs.createWriteStream(partial, { flags: "w" }), {
        signal: options.signal,
      });
      await fsp.rename(partial, destination);
      const stat = await fsp.stat(destination);
      if (stat.size === 0) {
        await fsp.rm(destination, { force: true });
        throw new Error(`Downloaded an empty file from ${redactUrl(url)}`);
      }
      return { bytes: stat.size, cached: false };
    } catch (error) {
      await fsp.rm(partial, { force: true }).catch(() => {});
      lastError = error;
      if (options.signal?.aborted) throw abortError(options.signal);
      if (error instanceof NonRetryableError || attempt === attempts - 1) break;
      await sleep(retryDelay(attempt), options.signal);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Unable to download ${redactUrl(url)}`);
}

/** googlevideo URLs carry signed query strings; keep them out of errors. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname.length > 80 ? `${parsed.pathname.slice(0, 80)}…` : parsed.pathname}`;
  } catch {
    return url.slice(0, 120);
  }
}
