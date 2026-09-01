import type { VideoSource } from "@veolms/video-player";

export interface LearningPlayerPlaybackSnapshot {
  currentTime: number;
  muted: boolean;
  playbackRate: number;
  playing: boolean;
  volume: number;
}

export interface LearningMiniPlayerRequest {
  currentTime: number;
  lessonTitle: string;
  mediaKey: string;
  muted: boolean;
  playbackRate: number;
  playing: boolean;
  source: VideoSource;
  volume: number;
  getLivePlaybackSnapshot?: () => LearningPlayerPlaybackSnapshot;
  preparePlaybackHandoff?: () => void;
}

export interface LearningMiniPlayerSession extends LearningMiniPlayerRequest {
  lessonPath: string;
  returnPath: string;
}
