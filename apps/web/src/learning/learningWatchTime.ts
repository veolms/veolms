import type { VideoPlayerEvent } from "@veolms/video-player";
import { noteProgressActivity } from "./progressSyncSchedule";
import { createTabOutboxStorage } from "./tabOutboxStorage";

/**
 * Watch time: the seconds of video a learner has actually played, which is
 * what their daily goal is credited from.
 *
 * It is measured in media time, from how far the playhead moves while the
 * video is playing. A minute of video played at 2x therefore counts as a
 * minute although it took thirty seconds, and the timeline dragged forward
 * by ten minutes counts as nothing, because nothing was played. (Progress
 * through a lesson is a different thing and is still recorded from the
 * playhead position; it used to be what the goal was credited from, which
 * let a drag of the timeline complete a day's goal.)
 *
 * The players add to a per-course tally here; whichever progress heartbeat
 * goes out next takes the tally with it. The tally is also kept in local
 * storage (tabOutboxStorage), so seconds a closed or crashed tab never sent
 * are sent by the next one.
 */
const pendingSecondsByCourse = new Map<string, number>();
const storedTally =
  createTabOutboxStorage<Record<string, number>>("watch-time-outbox");
let adopted = false;

function readTally(): Record<string, number> | null {
  const tally: Record<string, number> = {};
  for (const [courseKey, seconds] of pendingSecondsByCourse) {
    if (seconds >= 1) tally[courseKey] = seconds;
  }
  return Object.keys(tally).length > 0 ? tally : null;
}

/** Takes over, once, what tabs that are gone left unsent. */
function adoptLeftTally() {
  if (adopted) return;
  adopted = true;
  for (const tally of storedTally.adoptOrphans()) {
    for (const [courseKey, seconds] of Object.entries(tally)) {
      if (typeof seconds === "number" && seconds > 0) {
        pendingSecondsByCourse.set(
          courseKey,
          (pendingSecondsByCourse.get(courseKey) ?? 0) + seconds,
        );
      }
    }
  }
}

export function addWatchedSeconds(courseKey: string, seconds: number): void {
  if (!(seconds > 0)) return;
  adoptLeftTally();
  pendingSecondsByCourse.set(
    courseKey,
    (pendingSecondsByCourse.get(courseKey) ?? 0) + seconds,
  );
  storedTally.saveSoon(readTally);
  noteProgressActivity();
}

/** Watch time waiting to be reported for a course, without taking it. */
export function peekWatchedSeconds(courseKey: string): number {
  adoptLeftTally();
  return pendingSecondsByCourse.get(courseKey) ?? 0;
}

/**
 * Takes the whole seconds waiting to be reported for a course. What is taken
 * is gone from the tally: hand it back with `restoreWatchedSeconds` if the
 * request that carried it failed.
 */
export function takeWatchedSeconds(courseKey: string): number {
  adoptLeftTally();
  const pending = pendingSecondsByCourse.get(courseKey) ?? 0;
  const whole = Math.floor(pending);
  if (whole <= 0) return 0;
  pendingSecondsByCourse.set(courseKey, pending - whole);
  // Written at once: a copy left in storage would be sent again.
  storedTally.save(readTally());
  return whole;
}

export function restoreWatchedSeconds(
  courseKey: string,
  seconds: number,
): void {
  if (!(seconds > 0)) return;
  pendingSecondsByCourse.set(
    courseKey,
    (pendingSecondsByCourse.get(courseKey) ?? 0) + seconds,
  );
  storedTally.save(readTally());
}

/**
 * The fastest the playhead is believed to move by playing: the player's top
 * custom speed. A step larger than this allows for is a seek.
 */
const MAX_PLAYBACK_RATE = 8;
/** Leeway for the timer's own jitter between two position reports. */
const STEP_SLACK_SECONDS = 0.75;

/**
 * Follows one player's events and reports the media time it plays.
 *
 * Only a forward step of the playhead between two position reports, made
 * while playing and no larger than playing could have produced in the time
 * that passed, is counted. Seeking (with the timeline, the keyboard or a
 * double tap), scrubbing while paused, and rewinding all fall outside that
 * and are ignored; the next report after one simply starts a new stretch.
 */
export function createWatchTimeTracker(
  report: (seconds: number) => void,
): (event: VideoPlayerEvent) => void {
  let playing = false;
  let last: { mediaTime: number; wallTime: number } | null = null;

  return (event) => {
    switch (event.type) {
      case "playing":
      case "play":
        playing = true;
        last = null;
        return;
      case "pause":
      case "ended":
      case "unloaded":
      case "loadstart":
        playing = false;
        last = null;
        return;
      case "seeking":
      case "seeked":
      case "loaded":
        last = null;
        return;
      case "timeupdate": {
        if (!playing) return;
        const mediaTime = event.detail.currentTime;
        const wallTime = performance.now();
        const previous = last;
        last = { mediaTime, wallTime };
        if (!previous) return;
        const step = mediaTime - previous.mediaTime;
        const elapsed = (wallTime - previous.wallTime) / 1000;
        if (
          step > 0 &&
          step <= elapsed * MAX_PLAYBACK_RATE + STEP_SLACK_SECONDS
        ) {
          report(step);
        }
        return;
      }
      default:
    }
  };
}
