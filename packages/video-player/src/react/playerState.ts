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

export interface PlayerHudMessage {
  id: number;
  text: string;
}

export interface PlayerUiState {
  controlsVisible: boolean;
  controlsLocked: boolean;
  settingsView: PlayerSettingsView;
  scrubbing: boolean;
  previewTime: number | null;
  fullscreen: boolean;
  pictureInPicture: boolean;
  theater: boolean;
  hud: PlayerHudMessage | null;
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
    settingsView: "closed",
    scrubbing: false,
    previewTime: null,
    fullscreen: false,
    pictureInPicture: false,
    theater: false,
    hud: null,
  };
}
