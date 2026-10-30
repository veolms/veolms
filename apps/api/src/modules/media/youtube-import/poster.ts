import {
  QUICK_PROCESS_TIMEOUT_MS,
  runProcess,
} from "../../../lib/media-tools/process.ts";
import type { LocalLadder } from "./source/hls.ts";

/** Where an imported video's poster goes: where the transcoder puts an upload's. */
export function posterKeyFor(mediaId: string): string {
  return `public/thumbnails/${mediaId}/original.webp`;
}

/**
 * The segment to take the poster frame from: about a tenth of the way in,
 * past a black or title opening, in the best quality. Null without segments.
 */
export function pickPosterSegment(ladder: LocalLadder): string | null {
  const best = ladder.variants.at(-1);
  if (!best?.segments.length) return null;
  const index = Math.min(
    Math.floor(best.segments.length / 10),
    best.segments.length - 1,
  );
  return best.segments[index]!.file;
}

/**
 * Writes one frame of the downloaded video as a WebP poster (at most
 * 1280 px wide), for what shows before the video plays. An import does not
 * go through the transcoder, which makes an upload's.
 */
export async function capturePosterFrame(
  ffmpegPath: string,
  ladder: LocalLadder,
  posterPath: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const segment = pickPosterSegment(ladder);
  if (!segment) return false;
  const result = await runProcess(
    ffmpegPath,
    [
      "-y",
      "-i",
      segment,
      "-frames:v",
      "1",
      "-vf",
      "scale='min(1280,iw)':-2",
      "-c:v",
      "libwebp",
      "-quality",
      "82",
      posterPath,
    ],
    { timeoutMs: QUICK_PROCESS_TIMEOUT_MS, signal },
  );
  if (result.aborted) throw new Error("The import was cancelled.");
  if (result.code !== 0) {
    throw new Error(
      `ffmpeg poster capture failed: ${result.stderr.trim().slice(-400)}`,
    );
  }
  return true;
}
