import type { ExternalTextTrack, VideoSource } from "@veolms/video-player";

import type { CourseVideo } from "../courseContent";

import {
  createLearningHlsRequestFilter,
  LEARNING_HLS_MIME_TYPE,
  LEARNING_HLS_STREAMING,
  toAbsoluteLearningMediaUrl,
} from "./learningHlsConstants";

export { LEARNING_HLS_MIME_TYPE, LEARNING_HLS_STREAMING } from "./learningHlsConstants";
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
  lessonTitle: string;
  mediaKey: string;
  startTime: number;
  protectedPlayback?: boolean;
  segmentToken?: string;
  segmentTokenExpiresAt?: number;
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
    src: streaming ? toAbsoluteLearningMediaUrl(options.media.src) : options.media.src,
    type: hls ? LEARNING_HLS_MIME_TYPE : dash ? "application/dash+xml" : "video/mp4",
    kind: hls ? "hls" : dash ? "dash" : "file",
    // The catalog duration can be stale after an asset replacement. Shaka
    // receives the stored position and the loaded event clamps it against
    // the actual media duration before progress is reported.
    startTime: options.startTime,
    metadata: {
      duration: options.media.duration,
      title: options.lessonTitle,
    },
    streaming: streaming ? { ...LEARNING_HLS_STREAMING } : undefined,
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
    textTracks: undefined,
  };
}
