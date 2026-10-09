import type { VideoEngine } from "@veolms/video-player";
import { ShakaVideoEngine } from "@veolms/video-player/shaka";
import { createLearningLessonVideoSource } from "../../learning/player/lessonVideoSource";
import {
  getVideoPlaybackBootstrap,
  refreshVideoPlaybackToken,
} from "../../learning/videoPlaybackBootstrap";

export interface HeroLaptopVideoLesson {
  courseSlug: string;
  lessonNumber: number;
}

/**
 * Loads a lesson's video into a plain `<video>` element, the same way the
 * lesson page plays it: the playback endpoint hands out the stream and a
 * short-lived token for its segments, which is renewed while it plays.
 *
 * This module carries the streaming engine, so the hero imports it only once
 * a visitor asks for the video.
 */
export async function loadHeroLaptopVideo(
  video: HTMLVideoElement,
  lesson: HeroLaptopVideoLesson,
): Promise<VideoEngine> {
  const bootstrap = await getVideoPlaybackBootstrap(lesson);
  const title = bootstrap.title ?? "";
  const engine = new ShakaVideoEngine();
  try {
    await engine.attach(video);
    await engine.load(
      createLearningLessonVideoSource({
        media: {
          fileName: title,
          duration: bootstrap.duration ?? 0,
          src: bootstrap.manifestUrl,
        },
        lessonTitle: title,
        mediaKey: bootstrap.mediaKey,
        startTime: 0,
        protectedPlayback: true,
        segmentToken: bootstrap.segmentToken,
        segmentTokenExpiresAt: bootstrap.segmentTokenExpiresAt,
        refreshSegmentToken: () => refreshVideoPlaybackToken(lesson),
      }),
    );
  } catch (error) {
    await engine.destroy().catch(() => undefined);
    throw error;
  }
  return engine;
}
