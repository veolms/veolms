import type { VideoEngineErrorCategory } from "./types";

export interface VideoEngineErrorOptions {
  category: VideoEngineErrorCategory;
  code: string;
  message: string;
  fatal?: boolean;
  recoverable?: boolean;
  cause?: unknown;
  details?: readonly unknown[];
}

export class VideoEngineError extends Error {
  readonly category: VideoEngineErrorCategory;
  readonly code: string;
  readonly fatal: boolean;
  readonly recoverable: boolean;
  readonly details: readonly unknown[];

  constructor(options: VideoEngineErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "VideoEngineError";
    this.category = options.category;
    this.code = options.code;
    this.fatal = options.fatal ?? true;
    this.recoverable = options.recoverable ?? !this.fatal;
    this.details = options.details ?? [];
  }
}

export function isVideoEngineError(error: unknown): error is VideoEngineError {
  return error instanceof VideoEngineError;
}

/**
 * The HTTP status behind a network failure, when it carried one: Shaka's
 * BAD_HTTP_STATUS (1001) puts it second in its data, and a licence
 * request that failed (6007) wraps that network error as its first datum.
 */
export function networkFailureHttpStatus(
  error: VideoEngineError,
): number | null {
  const read = (code: string, details: readonly unknown[]): number | null => {
    if (code === "SHAKA_1001" || code === "1001") {
      const status = details[1];
      return typeof status === "number" ? status : null;
    }
    if (code === "SHAKA_6007" || code === "6007") {
      const inner = details[0] as
        { code?: unknown; data?: readonly unknown[] } | undefined;
      if (inner && typeof inner === "object" && inner.code !== undefined) {
        return read(String(inner.code), inner.data ?? []);
      }
    }
    return null;
  };
  return read(error.code, error.details);
}

/**
 * How a failed fetch is to be treated:
 * - "missing": the server says the file is not there (404, 410) or the
 *   request itself is wrong (another 4xx that no new token mends). Asking
 *   again cannot help for long; a few tries cover a CDN edge that was
 *   briefly out of step.
 * - "transient": the connection, the server or the token failed (no
 *   answer, a timeout, 5xx, 429, 401/403, a request hook that threw). It
 *   passes, so the fetch is asked for again for as long as it takes.
 * - null: not a network failure (a decode error, a bad manifest).
 * A licence refused outright (401/403/404 from the licence server) is not
 * transient: the learner has no access, and no retry changes that.
 */
export function networkFailureKind(
  error: VideoEngineError,
): "missing" | "transient" | null {
  const status = networkFailureHttpStatus(error);
  if (error.category === "DRM") {
    if (error.code !== "SHAKA_6007") return null;
    if (status === null) return "transient";
    return status >= 500 || status === 429 || status === 408 || status === 0
      ? "transient"
      : null;
  }
  if (error.category !== "NETWORK") return null;
  if (error.code === "SHAKA_1011") return "missing";
  if (status === null) return "transient";
  if (status === 404 || status === 410 || status === 416) return "missing";
  if (status === 401 || status === 403 || status === 429 || status === 408) {
    return "transient";
  }
  if (status >= 500 || status === 0) return "transient";
  return status >= 400 && status < 500 ? "missing" : "transient";
}

export function normalizeUnknownError(
  error: unknown,
  fallback: Omit<VideoEngineErrorOptions, "cause" | "message"> & {
    message?: string;
  },
): VideoEngineError {
  if (isVideoEngineError(error)) {
    return error;
  }

  const message =
    error instanceof Error
      ? error.message
      : (fallback.message ??
        "The video engine encountered an unexpected error.");

  return new VideoEngineError({
    ...fallback,
    message,
    cause: error,
  });
}
