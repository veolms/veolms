import type { Chapter } from "../chapters/chapterTypes";
import type { VideoEngineSnapshot } from "../core/snapshot";
import type { VideoEngineCapabilities } from "../core/types";
import type { StoryboardFrame } from "../storyboard/storyboardTypes";
import type { TimelineMarker } from "../timeline/timelineMath";

export type PlayerSettingsView =
  | "closed"
  | "main"
  | "quality"
  | "playback-rate"
  | "captions"
  | "audio"
  | "chapters";

export interface PlayerHudOptions {
  direction?: -1 | 1;
  variant?: "default" | "mobile-seek" | "playback-rate" | "temporary-speed";
}

export interface PlayerHudMessage extends PlayerHudOptions {
  id: number;
  text: string;
}

export interface PlayerZoomState {
  scale: number;
  panX: number;
  panY: number;
  gestureActive: boolean;
  feedbackVisible: boolean;
  transitioning: boolean;
}

export interface PlayerUiState {
  controlsVisible: boolean;
  controlsLocked: boolean;
  temporarySpeedBoost: boolean;
  settingsView: PlayerSettingsView;
  scrubbing: boolean;
  previewTime: number | null;
  fullscreen: boolean;
  pictureInPicture: boolean;
  theater: boolean;
  hud: PlayerHudMessage | null;
  zoom: PlayerZoomState;
}

export interface PlayerSnapshot {
  media: VideoEngineSnapshot;
  capabilities: VideoEngineCapabilities;
  ui: PlayerUiState;
  chapters: readonly Chapter[];
  activeChapterId: string | null;
  storyboard: readonly StoryboardFrame[];
  markers: readonly TimelineMarker[];
}

export function createInitialPlayerUiState(): PlayerUiState {
  return {
    controlsVisible: true,
    controlsLocked: false,
    temporarySpeedBoost: false,
    settingsView: "closed",
    scrubbing: false,
    previewTime: null,
    fullscreen: false,
    pictureInPicture: false,
    theater: false,
    hud: null,
    zoom: createInitialPlayerZoomState(),
  };
}

export function createInitialPlayerZoomState(): PlayerZoomState {
  return {
    scale: 1,
    panX: 0,
    panY: 0,
    gestureActive: false,
    feedbackVisible: false,
    transitioning: false,
  };
}
