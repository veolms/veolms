import type { VideoEngine } from "@veolms/video-player";
import { ShakaVideoEngine } from "@veolms/video-player/shaka";
import { createLearningLessonVideoSource } from "../learning/player/lessonVideoSource";
import { resolveVideoPlaybackCdnUrl } from "../learning/videoPlaybackBootstrap";
import { workshopsPublicService } from "../services/workshops";

/**
 * Loads a session's recording into a plain `<video>` element, the way a
 * course trailer is loaded: the API hands out the stream and a short-lived
 * token for its segments, renewed while it plays.
 *
 * This module carries the streaming engine, so it is imported only once
 * someone presses "Watch recording".
 */
export async function loadWorkshopRecording(
  video: HTMLVideoElement,
  workshopId: string,
  sessionId: string,
): Promise<VideoEngine> {
  const playback = await workshopsPublicService.recordingPlayback(
    workshopId,
    sessionId,
  );
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
          workshopsPublicService.recordingPlaybackToken(workshopId, sessionId),
      }),
    );
  } catch (error) {
    await engine.destroy().catch(() => undefined);
    throw error;
  }
  return engine;
}
