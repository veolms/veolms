import type {
  VideoEngineEvent,
  VideoEngineEventMap,
} from "../core/events";

export type PlayerPresentationEvent =
  | { type: "fullscreenchange"; detail: { active: boolean } }
  | { type: "pictureinpicturechange"; detail: { active: boolean } }
  | { type: "theaterchange"; detail: { active: boolean } }
  | { type: "controlsvisibilitychange"; detail: { visible: boolean } };

export type VideoPlayerEvent = VideoEngineEvent | PlayerPresentationEvent;

export type VideoPlayerEventListener = (event: VideoPlayerEvent) => void;

export const forwardedVideoEngineEvents = [
  "loadstart",
  "loaded",
  "unloaded",
  "play",
  "pause",
  "playing",
  "ended",
  "timeupdate",
  "durationchange",
  "seeking",
  "seeked",
  "bufferingchange",
  "volumechange",
  "ratechange",
  "qualitychange",
  "qualitieschange",
  "audiotrackchange",
  "texttrackchange",
  "trackschanged",
  "manifestupdated",
  "error",
] as const satisfies readonly (keyof VideoEngineEventMap)[];
