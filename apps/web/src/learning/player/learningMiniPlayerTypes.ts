import type { VideoSource } from "@veolms/video-player";

export interface LearningPlayerPlaybackSnapshot {
  currentTime: number;
  muted: boolean;
  playbackRate: number;
  playing: boolean;
  volume: number;
}

/**
 * A reading lesson in the mini player: its text, and the width and scroll
 * position the full player showed it at, so the small window (also after a
 * reload) draws the same picture of it.
 */
export interface LearningMiniPlayerReading {
  article: string;
  frameWidth: number;
  scrollTop: number;
}

export interface LearningMiniPlayerRequest {
  currentTime: number;
  lessonTitle: string;
  courseTitle?: string;
  lessonIndex?: number;
  totalLessons?: number;
  mediaKey: string;
  muted: boolean;
  playbackRate: number;
  playing: boolean;
  source: VideoSource;
  volume: number;
  courseSlug?: string;
  selectedLesson?: number;
  /** Set for a reading lesson, which has no video to play. */
  reading?: LearningMiniPlayerReading;
  getLivePlaybackSnapshot?: () => LearningPlayerPlaybackSnapshot;
  preparePlaybackHandoff?: () => void;
}

export interface LearningMiniPlayerSession extends LearningMiniPlayerRequest {
  lessonPath: string;
  returnPath: string;
}
