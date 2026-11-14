import type { VideoSource } from "@veolms/video-player";
import { createLearningLessonVideoSource } from "../../learning/player/lessonVideoSource";
import { resolveVideoPlaybackCdnUrl } from "../../learning/videoPlaybackBootstrap";
import { coursesService } from "../../services/courses";

/**
 * A course's saved trailer as the app's player plays it, as the home page's
 * hero video is: the API hands out the stream and a short-lived token for
 * its segments, renewed while it plays.
 *
 * Imported only once someone presses play on the trailer.
 */
export async function loadCourseTrailerSource(
  courseId: string,
): Promise<VideoSource> {
  const playback = await coursesService.getCourseTrailerPlayback(courseId);
  return createLearningLessonVideoSource({
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
  });
}
