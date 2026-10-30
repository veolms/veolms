import { isNetworkFailure } from "../lib/offline-data";
import { VideoPlaybackBootstrapError } from "./videoPlaybackBootstrap";

/**
 * What the player says when a lesson's video could not be prepared, by why:
 * no connection, a server that did not answer properly, an answer that took
 * too long, or anything else. Every case is a failure worth trying again, so
 * each gets the octopus and the action. The page adds the action itself.
 *
 * The lesson page and the player that stays on screen between pages both
 * show this, so a failure reads the same in either.
 */
export function videoPlaybackFailureNotice(error: unknown) {
  return {
    kind: "retry",
    illustration: "went-wrong",
    actionLabel: "Try again",
    ...videoPlaybackFailureWords(error),
  } as const;
}

/**
 * Turns whatever a playback request threw into the error the page keeps.
 * A request that never reached the server (`fetch` rejected) is kept as
 * such, so the player can say it is the connection.
 */
export function toVideoPlaybackBootstrapError(
  error: unknown,
): VideoPlaybackBootstrapError {
  if (error instanceof VideoPlaybackBootstrapError) return error;
  return isNetworkFailure(error)
    ? new VideoPlaybackBootstrapError(
        0,
        "NETWORK_UNAVAILABLE",
        "Unable to reach the server.",
      )
    : new VideoPlaybackBootstrapError(
        0,
        "PLAYBACK_BOOTSTRAP_FAILED",
        "Unable to prepare this video.",
      );
}

function videoPlaybackFailureWords(error: unknown): {
  title: string;
  message: string;
} {
  const failure = toVideoPlaybackBootstrapError(error);
  const offline =
    typeof navigator !== "undefined" && navigator.onLine === false;
  if (offline || failure.code === "NETWORK_UNAVAILABLE") {
    return {
      title: "Can't connect right now",
      message: "Check your internet connection and try again.",
    };
  }
  if (failure.code === "PLAYBACK_BOOTSTRAP_TIMEOUT") {
    return {
      title: "This is taking a while",
      message: "The video is slow to load. Give it another try.",
    };
  }
  // A gateway in front of the server, or the server itself, failed to
  // answer (it is restarting, say).
  if (failure.status >= 500) {
    return {
      title: "Something went wrong",
      message: "Our server hit a snag. Please try again in a moment.",
    };
  }
  return {
    title: "Something went wrong",
    message: "We couldn't load this video. Please try again.",
  };
}
