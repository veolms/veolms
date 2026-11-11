import type { VideoEngineEvent, VideoEngineEventMap } from "../core/events";

export type PlayerPresentationEvent =
  | { type: "fullscreenchange"; detail: { active: boolean } }
  | { type: "pictureinpicturechange"; detail: { active: boolean } }
  | { type: "theaterchange"; detail: { active: boolean } }
  | { type: "controlsvisibilitychange"; detail: { visible: boolean } };

/**
 * The video's speed was changed from outside the player (a browser
 * extension, say) to `playbackRate`, away from the `requestedRate` it was
 * asked for. Sent instead of `ratechange`: the speed is not the learner's.
 */
export type PlayerOutsideRateChangeEvent = {
  type: "outsideratechange";
  detail: { playbackRate: number; requestedRate: number };
};

export type VideoPlayerEvent =
  VideoEngineEvent | PlayerPresentationEvent | PlayerOutsideRateChangeEvent;

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
  "streamingretry",
  "streamingrecovered",
] as const satisfies readonly (keyof VideoEngineEventMap)[];
