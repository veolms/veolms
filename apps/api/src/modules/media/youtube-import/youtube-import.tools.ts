import path from "node:path";
import type { ServerConfig } from "@veolms/config";
import type { FastifyBaseLogger } from "fastify";
import {
  ensureFfmpegBinary,
  ensureYtDlpBinary,
  resolveCookiesPath,
} from "../../../lib/media-tools/binaries.ts";
import { resolveImportScratchRoot } from "../../../lib/media-tools/disk.ts";
import type { YtDlp } from "./source/youtube.ts";

/** How long a resolved yt-dlp is trusted before it is checked (and updated) again. */
const YTDLP_RECHECK_MS = 24 * 60 * 60 * 1000;

export interface YoutubeImportTools {
  getYtDlp(): Promise<YtDlp>;
  getFfmpeg(): Promise<string>;
  getScratchRoot(): Promise<string>;
}

let shared: YoutubeImportTools | null = null;

/** The process-wide tools, shared by the routes and the worker. */
export function getYoutubeImportTools(
  config: ServerConfig,
  logger: FastifyBaseLogger,
): YoutubeImportTools {
  shared ??= createYoutubeImportTools(config, logger);
  return shared;
}

/**
 * yt-dlp, ffmpeg and the scratch folder, resolved once per process (yt-dlp
 * again daily, so YouTube-side changes are picked up by its self-update).
 * Concurrent callers share the same lookup.
 */
export function createYoutubeImportTools(
  config: ServerConfig,
  logger: FastifyBaseLogger,
): YoutubeImportTools {
  let ytdlp: { value: Promise<YtDlp>; at: number } | null = null;
  let ffmpeg: Promise<string> | null = null;
  let scratch: Promise<string> | null = null;
  const log = (level: "info" | "warn", message: string) =>
    logger[level]({ feature: "youtube-import" }, message);

  return {
    getYtDlp() {
      if (!ytdlp || Date.now() - ytdlp.at > YTDLP_RECHECK_MS) {
        const value = ensureYtDlpBinary(config.YTDLP_PATH, { log }).then(
          (binary) => ({
            path: binary.path,
            supportsJsRuntimes: binary.supportsJsRuntimes,
            cookies: resolveCookiesPath(config.YTDLP_COOKIES_FILE),
          }),
        );
        ytdlp = { value, at: Date.now() };
        value.catch(() => {
          ytdlp = null;
        });
      }
      return ytdlp.value;
    },
    getFfmpeg() {
      if (!ffmpeg) {
        ffmpeg = ensureFfmpegBinary(config.FFMPEG_PATH, log).then((binary) => {
          if (!binary) {
            throw new Error(
              "ffmpeg is required for YouTube imports. Install it or set FFMPEG_PATH.",
            );
          }
          return binary;
        });
        ffmpeg.catch(() => {
          ffmpeg = null;
        });
      }
      return ffmpeg;
    },
    getScratchRoot() {
      if (!scratch) {
        scratch = resolveImportScratchRoot(
          config.YOUTUBE_IMPORT_SCRATCH_DIR?.trim() || undefined,
        ).then((root) => path.join(root, "youtube-import"));
        scratch.catch(() => {
          scratch = null;
        });
      }
      return scratch;
    },
  };
}
