import {
  DOWNLOAD_PROCESS_TIMEOUT_MS,
  METADATA_PROCESS_TIMEOUT_MS,
  runProcess,
} from "../../../../lib/media-tools/process.ts";
import {
  buildYtDlpArgs,
  type YtDlpContext,
} from "../../../../lib/media-tools/binaries.ts";

// Ported from yt-import/src/youtube.js. yt-dlp is only used to *resolve*
// the video: the HLS ladder itself is fetched segment by segment (hls.ts),
// which resumes and parallelises better than yt-dlp's own downloader.

export interface YtDlp extends YtDlpContext {
  path: string;
}

interface YtDlpFormat {
  url?: string;
  manifest_url?: string;
  protocol?: string;
  vcodec?: string;
  acodec?: string;
  height?: number;
  http_headers?: Record<string, string>;
}

interface YtDlpVideoJson {
  id?: string;
  title?: string;
  description?: string;
  duration?: number;
  width?: number;
  height?: number;
  channel?: string;
  uploader?: string;
  thumbnail?: string;
  live_status?: string;
  is_live?: boolean;
  formats?: YtDlpFormat[];
  http_headers?: Record<string, string>;
}

export interface YoutubeVideoMetadata {
  id: string;
  title: string;
  description: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  channel: string | null;
  thumbnailUrl: string | null;
  /** Heights the HLS ladder offers, highest first. */
  availableHeights: number[];
  /** Muxed TS HLS master; null when only progressive formats exist. */
  manifestUrl: string | null;
  headers: Record<string, string>;
}

export class YoutubeUnavailableError extends Error {}

function finiteOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

async function readYtDlpJson(
  ytdlp: YtDlp,
  videoUrl: string,
  extractorArgs: string | undefined,
  signal: AbortSignal | undefined,
): Promise<YtDlpVideoJson> {
  const result = await runProcess(
    ytdlp.path,
    buildYtDlpArgs(
      [
        "--dump-single-json",
        "--no-warnings",
        "--skip-download",
        "--no-playlist",
        ...(extractorArgs ? ["--extractor-args", extractorArgs] : []),
        videoUrl,
      ],
      ytdlp,
    ),
    { timeoutMs: METADATA_PROCESS_TIMEOUT_MS, signal },
  );
  if (result.aborted) throw new Error("The import was cancelled.");
  if (result.code !== 0 || !result.stdout.trim()) {
    const stderr = result.stderr.trim();
    if (
      /Private video|Video unavailable|This video is not available|members-only|Sign in to confirm your age|removed by the uploader/i.test(
        stderr,
      )
    ) {
      throw new YoutubeUnavailableError(
        stderr.split("\n").find((line) => line.includes("ERROR")) ??
          "This YouTube video is not available.",
      );
    }
    throw new Error(
      result.timedOut
        ? "yt-dlp timed out reading the video metadata."
        : `yt-dlp metadata failed: ${stderr.slice(-800)}`,
    );
  }
  try {
    return JSON.parse(result.stdout) as YtDlpVideoJson;
  } catch (error) {
    throw new Error(
      `yt-dlp returned invalid JSON: ${error instanceof Error ? error.message : error}`,
      { cause: error },
    );
  }
}

function isHlsFormat(format: YtDlpFormat): boolean {
  const protocol = String(format.protocol ?? "").toLowerCase();
  return (
    protocol.includes("m3u8") ||
    /\.m3u8(?:[?#]|$)/i.test(String(format.url ?? "")) ||
    /\.m3u8(?:[?#]|$)/i.test(String(format.manifest_url ?? ""))
  );
}

function manifestOf(format: YtDlpFormat | undefined): string | null {
  if (!format) return null;
  if (format.manifest_url) return format.manifest_url;
  return format.url && /\.m3u8(?:[?#]|$)/i.test(format.url) ? format.url : null;
}

/**
 * Resolves title/duration and the HLS master. Tries the default player
 * client, then `default,web,android`, then `visionos` (which still exposes
 * HLS for many videos the others only offer as DASH/progressive).
 */
export async function readVideoMetadata(
  ytdlp: YtDlp,
  videoUrl: string,
  signal?: AbortSignal,
): Promise<YoutubeVideoMetadata> {
  let parsed: YtDlpVideoJson;
  try {
    parsed = await readYtDlpJson(ytdlp, videoUrl, undefined, signal);
  } catch (initialError) {
    if (initialError instanceof YoutubeUnavailableError || signal?.aborted)
      throw initialError;
    try {
      parsed = await readYtDlpJson(
        ytdlp,
        videoUrl,
        "youtube:player_client=default,web,android",
        signal,
      );
    } catch {
      throw initialError;
    }
  }
  if (
    parsed.is_live ||
    parsed.live_status === "is_live" ||
    parsed.live_status === "is_upcoming"
  ) {
    throw new YoutubeUnavailableError(
      "Live streams and premieres cannot be imported; wait until it is a finished video.",
    );
  }

  const formats = Array.isArray(parsed.formats) ? parsed.formats : [];
  let hlsFormats = formats.filter(
    (format) =>
      format &&
      format.vcodec !== "none" &&
      format.acodec !== "none" &&
      isHlsFormat(format),
  );
  let sourceFormat = [...hlsFormats].sort(
    (a, b) => Number(b.height ?? 0) - Number(a.height ?? 0),
  )[0];
  let manifestUrl = manifestOf(sourceFormat);

  if (!manifestUrl && !signal?.aborted) {
    try {
      const vision = await readYtDlpJson(
        ytdlp,
        videoUrl,
        "youtube:player_client=visionos",
        signal,
      );
      const visionFormats = Array.isArray(vision.formats) ? vision.formats : [];
      const m3u8Format = visionFormats.find(
        (format) => format && isHlsFormat(format) && format.manifest_url,
      );
      if (m3u8Format?.manifest_url) {
        parsed = { ...vision, title: vision.title ?? parsed.title };
        hlsFormats = visionFormats.filter(
          (format) => format && isHlsFormat(format),
        );
        sourceFormat = m3u8Format;
        manifestUrl = m3u8Format.manifest_url;
      }
    } catch {
      // fall through to the progressive path
    }
  }

  if (!manifestUrl) {
    const hasVideoFormat = formats.some(
      (format) => format?.vcodec && format.vcodec !== "none",
    );
    if (!hasVideoFormat) {
      throw new YoutubeUnavailableError(
        "YouTube exposed no playable video stream for this video.",
      );
    }
  }

  const availableHeights = [
    ...new Set(
      hlsFormats
        .map((format) => Number(format.height ?? 0))
        .filter((height) => height > 0),
    ),
  ].sort((a, b) => b - a);

  return {
    id: String(parsed.id ?? ""),
    title: String(parsed.title ?? "YouTube video").slice(0, 500),
    description:
      typeof parsed.description === "string" ? parsed.description : null,
    durationSeconds: finiteOrNull(parsed.duration),
    width: finiteOrNull(parsed.width),
    height: finiteOrNull(parsed.height) ?? (manifestUrl ? null : 360),
    channel: parsed.channel ?? parsed.uploader ?? null,
    thumbnailUrl: parsed.thumbnail ?? null,
    availableHeights,
    manifestUrl,
    headers: {
      ...(sourceFormat?.http_headers ?? parsed.http_headers ?? {}),
    },
  };
}

/** yt-dlp's own download of a muxed MP4 (format 18 = 360p), for videos with no HLS. */
export async function downloadProgressiveVideo(
  ytdlp: YtDlp,
  videoUrl: string,
  outputMp4Path: string,
  signal?: AbortSignal,
): Promise<void> {
  const result = await runProcess(
    ytdlp.path,
    buildYtDlpArgs(
      [
        "--no-warnings",
        "--no-playlist",
        "-f",
        "18/best[ext=mp4][vcodec!=none][acodec!=none]/best",
        "-o",
        outputMp4Path,
        videoUrl,
      ],
      ytdlp,
    ),
    { timeoutMs: DOWNLOAD_PROCESS_TIMEOUT_MS, signal },
  );
  if (result.aborted) throw new Error("The import was cancelled.");
  if (result.code !== 0) {
    throw new Error(
      `yt-dlp progressive download failed: ${result.stderr.trim().slice(-800)}`,
    );
  }
}
