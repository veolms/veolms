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
      : fallback.message ?? "The video engine encountered an unexpected error.";

  return new VideoEngineError({
    ...fallback,
    message,
    cause: error,
  });
}
