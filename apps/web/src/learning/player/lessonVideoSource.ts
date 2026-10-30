import type { VideoPlaybackSubtitle } from "@veolms/contracts";
import type { ExternalTextTrack, VideoSource } from "@veolms/video-player";
import type { CourseVideo } from "../courseContent";
import {
  createLearningHlsRequestFilter,
  LEARNING_HLS_MIME_TYPE,
  learningHlsStreaming,
  toAbsoluteLearningMediaUrl,
} from "./learningHlsConstants";

export {
  LEARNING_HLS_MIME_TYPE,
  learningHlsStreaming,
} from "./learningHlsConstants";
export { createLearningHlsPreloadSource } from "./learningHlsPreloadSource";

export const LEARNING_LESSON_TEXT_TRACKS: readonly ExternalTextTrack[] = [
  {
    src: "/static/designing-users.vtt",
    language: "en",
    label: "English",
    kind: "captions",
    mimeType: "text/vtt",
  },
];

export function isHlsUrl(src: string): boolean {
  return /\.m3u8(?:$|[?#])/i.test(src);
}

export function isDashUrl(src: string): boolean {
  return /\.mpd(?:$|[?#])/i.test(src);
}

export function isStreamingUrl(src: string): boolean {
  return isHlsUrl(src) || isDashUrl(src);
}

export function createLearningLessonVideoSource(options: {
  media: CourseVideo;
  mediaKey: string;
  startTime: number;
  protectedPlayback?: boolean;
  segmentToken?: string;
  segmentTokenExpiresAt?: number;
  /** The master playlist from the bootstrap, served in place of fetching it. */
  inlinedMasterManifest?: string;
  /** The video's subtitle tracks from the bootstrap (WebVTT). */
  subtitles?: readonly VideoPlaybackSubtitle[];
  refreshSegmentToken?: () => Promise<{
    token: string;
    expiresAt?: number;
  } | null>;
}): VideoSource {
  const hls = isHlsUrl(options.media.src);
  const dash = isDashUrl(options.media.src);
  const streaming = hls || dash;
  return {
    id: options.mediaKey,
    src: streaming
      ? toAbsoluteLearningMediaUrl(options.media.src)
      : options.media.src,
    type: hls
      ? LEARNING_HLS_MIME_TYPE
      : dash
        ? "application/dash+xml"
        : "video/mp4",
    kind: hls ? "hls" : dash ? "dash" : "file",
    // The catalog duration can be stale after an asset replacement. Shaka
    // receives the stored position and the loaded event clamps it against
    // the actual media duration before progress is reported.
    startTime: options.startTime,
    metadata: {
      duration: options.media.duration,
      // Editable lesson titles belong to the UI, not the media load request.
    },
    streaming: streaming ? learningHlsStreaming(options.media.src) : undefined,
    inlinedManifest: streaming ? options.inlinedMasterManifest : undefined,
    networking: streaming
      ? {
          requestFilter: createLearningHlsRequestFilter({
            protectedPlayback: options.protectedPlayback,
            segmentToken: options.segmentToken,
            segmentTokenExpiresAt: options.segmentTokenExpiresAt,
            refreshSegmentToken: options.refreshSegmentToken,
          }),
        }
      : undefined,
    textTracks: options.subtitles?.length
      ? options.subtitles.map((track): ExternalTextTrack => ({
          src: track.url,
          language: track.language,
          label: track.label,
          kind: track.kind,
          mimeType: "text/vtt",
        }))
      : undefined,
  };
}
