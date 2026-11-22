import { isStreamingUrl } from "./lessonVideoSource";

/**
 * Whether this browser can stream a lesson video. The player (Shaka) feeds
 * the video in pieces through Media Source Extensions: `MediaSource`, or
 * `ManagedMediaSource` on iPhones from iOS 17.1. iPhones before 17.1 have
 * neither, and a lesson there failed with the player's generic error
 * (BrowserStack, 22 Nov 2026).
 */
export function hasMediaSource(): boolean {
  if (typeof window === "undefined") return true;
  return "MediaSource" in window || "ManagedMediaSource" in window;
}

/**
 * The iOS (or iPadOS) version in the user agent, as "16.1.2", or null when
 * it is not an Apple phone or tablet that says so. Every browser on an
 * iPhone uses Safari's engine and carries the same `iPhone OS 16_1_2`.
 */
export function appleMobileOsVersion(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
): string | null {
  const match =
    /\((?:iPhone|iPad|iPod)\b[^)]*? OS (\d+)_(\d+)(?:_(\d+))?/u.exec(userAgent);
  if (!match) return null;
  return [match[1], match[2], match[3]].filter(Boolean).join(".");
}

/**
 * A lesson whose video this browser cannot play at all: it streams (DASH or
 * HLS through the player) and there is no Media Source here. A plain video
 * file still plays, so it is not one.
 *
 * Where an old iPhone could still be served: if the lesson's playback
 * bootstrap one day offers a copy Apple's own player plays (an HLS playlist
 * it reads by itself, see the owner's open choice between AES-128 HLS and
 * FairPlay), it is chosen here instead of saying the lesson cannot play.
 */
export function cannotStreamLesson(manifestUrl: string): boolean {
  return !hasMediaSource() && isStreamingUrl(manifestUrl);
}

/**
 * The incident code for such a lesson: "NO_MEDIA_SOURCE", with the iOS
 * version when there is one ("NO_MEDIA_SOURCE:iOS 16.1.2"), so these
 * learners can be counted by version.
 */
export function noMediaSourceIncidentCode(): string {
  const version = appleMobileOsVersion();
  return version ? `NO_MEDIA_SOURCE:iOS ${version}` : "NO_MEDIA_SOURCE";
}

/**
 * What the player says in place of a lesson this browser cannot stream.
 * iPhone 8 and X stop at iOS 16, and 6s and 7 at iOS 15, so an update is
 * not open to every learner: they are pointed to a computer or another
 * phone as well.
 */
export function noMediaSourceNotice() {
  const words = appleMobileOsVersion()
    ? {
        title: "This video needs iOS 17.1 or newer",
        message:
          "Update your iPhone in Settings > General > Software Update. If it can't update (iPhone 6s, 7, 8 and X), watch on a computer or a newer phone.",
      }
    : {
        title: "This browser can't play lesson videos",
        message:
          "Open this lesson in an up-to-date Chrome, Edge, Firefox or Safari, or on a computer.",
      };
  return {
    kind: "notice",
    illustration: "went-wrong",
    actionLabel: "",
    ...words,
  } as const;
}
