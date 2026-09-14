const COURSE_MEDIA_CDN_BASE_URL = String(
  import.meta.env.VITE_CDN_URL ||
    (typeof process !== "undefined" ? process.env.VITE_CDN_URL : undefined) ||
    (typeof process !== "undefined" ? process.env.CDN_URL : undefined) ||
    "",
).replace(/\/+$/, "");

export const COURSE_THUMBNAIL_WIDTHS = [
  160, 240, 320, 480, 640, 960, 1280,
] as const;

export function getCourseThumbnailCdnUrl(
  mediaId: string | null | undefined,
  width: number | "full" = "full",
): string | undefined {
  if (!mediaId || !COURSE_MEDIA_CDN_BASE_URL) return undefined;
  return `${COURSE_MEDIA_CDN_BASE_URL}/public/thumbnails/${encodeURIComponent(mediaId)}/processed/${width}.webp`;
}

export function getCourseThumbnailCdnSrcSet(
  mediaId: string | null | undefined,
) {
  return COURSE_THUMBNAIL_WIDTHS.flatMap((width) => {
    const url = getCourseThumbnailCdnUrl(mediaId, width);
    return url ? [{ url, width, height: Math.round((width * 9) / 16) }] : [];
  });
}

export async function waitForCourseThumbnailCdnUrl(
  mediaId: string,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    pollIntervalMs?: number;
  } = {},
): Promise<string> {
  const url = getCourseThumbnailCdnUrl(mediaId);
  if (!url) {
    throw new Error("Course thumbnail CDN URL is not configured.");
  }

  const timeoutMs = options.timeoutMs ?? 5 * 60_000;
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (options.signal?.aborted) {
      throw createAbortError();
    }

    try {
      const response = await fetch(url, {
        method: "HEAD",
        cache: "no-store",
        signal: options.signal,
      });
      if (response.ok) return url;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
    }

    await waitForNextThumbnailPoll(pollIntervalMs, options.signal);
  }

  throw new Error(
    "Thumbnail processing did not finish in time. Please try again.",
  );
}

function createAbortError(): Error {
  const error = new Error("The thumbnail upload was cancelled.");
  error.name = "AbortError";
  return error;
}

function waitForNextThumbnailPoll(
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return Promise.reject(createAbortError());

  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(createAbortError());
    };

    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
