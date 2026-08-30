import type { VideoSource } from "@veolms/video-player";

export interface LearningMiniPlayerRequest {
  currentTime: number;
  lessonTitle: string;
  mediaKey: string;
  muted: boolean;
  playbackRate: number;
  playing: boolean;
  source: VideoSource;
}

export interface LearningMiniPlayerSession extends LearningMiniPlayerRequest {
  lessonPath: string;
  returnPath: string;
}
