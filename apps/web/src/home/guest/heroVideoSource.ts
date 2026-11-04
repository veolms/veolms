import type { HeroVideoPlayback } from "@veolms/contracts";
import type { VideoSource } from "@veolms/video-player";
import { startEarlyShakaPreload } from "@veolms/video-player/shaka-preload";
import { createLearningLessonVideoSource } from "../../learning/player/lessonVideoSource";
import { resolveVideoPlaybackCdnUrl } from "../../learning/videoPlaybackBootstrap";
import { homeService } from "../../services/home";

/**
 * The speed assumed before the first segment is measured. Well above the
 * 1080p variant's (about 2.6 Mbit/s), so the video, and its preload, start
 * in full HD; a slower connection is measured and stepped down from there.
 */
const HERO_START_BANDWIDTH = 10_000_000;

/**
 * Segments the preload fetches past the first. The hero's are 6 s long, so
 * the first 18 s are in (about 4.5 MB in 1080p) when the visitor presses
 * play.
 */
const HERO_PRELOAD_SEGMENTS = 2;

/** The hero's video as the player plays it, and as it is preloaded. */
export function createHeroVideoSource(
  playback: HeroVideoPlayback,
  options: { preload?: boolean } = {},
): VideoSource {
  const source = createLearningLessonVideoSource({
    media: {
      fileName: playback.title ?? "",
      duration: playback.duration ?? 0,
      src: resolveVideoPlaybackCdnUrl(playback.manifestUrl),
    },
    mediaKey: playback.mediaKey,
    startTime: 0,
    protectedPlayback: true,
    segmentToken: playback.segmentToken,
    segmentTokenExpiresAt: playback.segmentTokenExpiresAt,
    refreshSegmentToken: () => homeService.getHeroVideoPlaybackToken(),
  });
  return {
    ...source,
    streaming: {
      ...source.streaming,
      abrDefaultBandwidthEstimate: HERO_START_BANDWIDTH,
      ...(options.preload
        ? { segmentPrefetchLimit: HERO_PRELOAD_SEGMENTS }
        : {}),
    },
  };
}

/**
 * How far ahead the hero's player buffers while it waits under the poster:
 * what the preload fetched, and no more until the visitor presses play.
 */
export const HERO_WAITING_BUFFER_SECONDS = 6 * (1 + HERO_PRELOAD_SEGMENTS);

/**
 * Fetches the start of the hero's video ahead of a press on play: the
 * playlists and the first segments, in 1080p, into a player the hero's
 * player takes over when it loads the same video (by its address).
 * Settles once that player is made (the segments are still on their way).
 */
export async function preloadHeroVideo(
  playback: HeroVideoPlayback,
): Promise<void> {
  await startEarlyShakaPreload(
    createHeroVideoSource(playback, { preload: true }),
  ).catch(() => undefined);
}
