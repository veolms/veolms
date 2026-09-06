import type { ExternalTextTrack, VideoSource } from "@veolms/video-player";
import type { CourseVideo } from "../courseContent";
import {
  LEARNING_HLS_MIME_TYPE,
  LEARNING_HLS_STREAMING,
} from "./learningHlsConstants";

export {
  LEARNING_HLS_MIME_TYPE,
  LEARNING_HLS_STREAMING,
} from "./learningHlsConstants";
export { createLearningHlsPreloadSource } from "./learningHlsPreloadSource";

export const LEARNING_LESSON_TEXT_TRACKS: readonly ExternalTextTrack[] = [
  {
    src: "/assets/designing-users.vtt",
    language: "en",
    label: "English",
    kind: "captions",
    mimeType: "text/vtt",
  },
];

export function isHlsUrl(src: string): boolean {
  return /\.m3u8(?:$|[?#])/i.test(src);
}

export function createLearningLessonVideoSource(options: {
  media: CourseVideo;
  lessonTitle: string;
  mediaKey: string;
  startTime: number;
}): VideoSource {
  const hls = isHlsUrl(options.media.src);
  return {
    id: options.mediaKey,
    src: options.media.src,
    type: hls ? LEARNING_HLS_MIME_TYPE : "video/mp4",
    kind: hls ? "hls" : "file",
    // The catalog duration can be stale after an asset replacement. Shaka
    // receives the stored position and the loaded event clamps it against
    // the actual media duration before progress is reported.
    startTime: options.startTime,
    metadata: {
      duration: options.media.duration,
      title: options.lessonTitle,
    },
    streaming: hls ? { ...LEARNING_HLS_STREAMING } : undefined,
    textTracks: [...LEARNING_LESSON_TEXT_TRACKS],
  };
}
