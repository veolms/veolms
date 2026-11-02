import type { VideoEngine } from "@veolms/video-player";
import { ShakaVideoEngine } from "@veolms/video-player/shaka";
import { createLearningLessonVideoSource } from "../../learning/player/lessonVideoSource";
import { resolveVideoPlaybackCdnUrl } from "../../learning/videoPlaybackBootstrap";
import { coursesService } from "../../services/courses";

/**
 * Loads a course's saved trailer into a plain `<video>` element, as the home
 * page's hero video is loaded: the API hands out the stream and a
 * short-lived token for its segments, renewed while it plays.
 *
 * This module carries the streaming engine, so it is imported only once
 * someone presses play on the trailer.
 */
export async function loadCourseTrailerVideo(
  video: HTMLVideoElement,
  courseId: string,
): Promise<VideoEngine> {
  const playback = await coursesService.getCourseTrailerPlayback(courseId);
  const engine = new ShakaVideoEngine();
  try {
    await engine.attach(video);
    await engine.load(
      createLearningLessonVideoSource({
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
        refreshSegmentToken: () =>
          coursesService.getCourseTrailerPlaybackToken(courseId),
      }),
    );
  } catch (error) {
    await engine.destroy().catch(() => undefined);
    throw error;
  }
  return engine;
}
