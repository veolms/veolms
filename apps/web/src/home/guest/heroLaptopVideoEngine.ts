import type { VideoEngine } from "@veolms/video-player";
import { ShakaVideoEngine } from "@veolms/video-player/shaka";
import { createLearningLessonVideoSource } from "../../learning/player/lessonVideoSource";
import { resolveVideoPlaybackCdnUrl } from "../../learning/videoPlaybackBootstrap";
import { homeService } from "../../services/home";

/**
 * Loads the home page's hero video into a plain `<video>` element, the same
 * way the lesson page plays a lesson: the API hands out the stream and a
 * short-lived token for its segments, which is renewed while it plays.
 * Which video that is (a lesson's, an upload, or the default lesson) is the
 * admin's choice in the home page settings, resolved by the API.
 *
 * This module carries the streaming engine, so the hero imports it only once
 * a visitor asks for the video.
 */
export async function loadHeroLaptopVideo(
  video: HTMLVideoElement,
): Promise<VideoEngine> {
  const playback = await homeService.getHeroVideoPlayback();
  const title = playback.title ?? "";
  const engine = new ShakaVideoEngine();
  try {
    await engine.attach(video);
    await engine.load(
      createLearningLessonVideoSource({
        media: {
          fileName: title,
          duration: playback.duration ?? 0,
          src: resolveVideoPlaybackCdnUrl(playback.manifestUrl),
        },
        mediaKey: playback.mediaKey,
        startTime: 0,
        protectedPlayback: true,
        segmentToken: playback.segmentToken,
        segmentTokenExpiresAt: playback.segmentTokenExpiresAt,
        refreshSegmentToken: () => homeService.getHeroVideoPlaybackToken(),
      }),
    );
  } catch (error) {
    await engine.destroy().catch(() => undefined);
    throw error;
  }
  return engine;
}
