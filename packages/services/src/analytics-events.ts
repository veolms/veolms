import { EventEmitter } from "node:events";

/**
 * In-process facts the core API announces as they happen, for whoever
 * listens (a plugin's analytics, for one). Nothing is stored here and a
 * listener that throws is logged by its own side: the heartbeat that
 * announced it has already answered.
 */
export interface AnalyticsEventPayloads {
  /** A learner's progress heartbeat credited learning time. */
  "learning.activity": {
    userId: string;
    courseId: string;
    /** The lessons the heartbeat reported progress on. */
    lessonIds: readonly string[];
    /** Seconds of video played since the previous heartbeat. */
    seconds: number;
    at: Date;
  };
  /**
   * A video finished transcoding and can be played. Work that derives
   * files from the output (seek-preview storyboards, for one) starts here.
   */
  "media.video.ready": {
    mediaId: string;
    /** Storage key of the top-level manifest (HLS master or DASH MPD). */
    manifestKey: string;
    /** The `video_outputs` row written for this output. */
    outputId: string;
    at: Date;
  };
}

export type AnalyticsEventName = keyof AnalyticsEventPayloads;

export interface AnalyticsEventBus {
  emit<Name extends AnalyticsEventName>(
    name: Name,
    payload: AnalyticsEventPayloads[Name],
  ): void;
  on<Name extends AnalyticsEventName>(
    name: Name,
    listener: (payload: AnalyticsEventPayloads[Name]) => void,
  ): () => void;
}

export function createAnalyticsEventBus(): AnalyticsEventBus {
  const emitter = new EventEmitter();
  // Several plugins may listen; the default limit of ten is a warning
  // meant for leaks, not for this.
  emitter.setMaxListeners(50);
  return {
    emit(name, payload) {
      emitter.emit(name, payload);
    },
    on(name, listener) {
      emitter.on(name, listener);
      return () => {
        emitter.off(name, listener);
      };
    },
  };
}
