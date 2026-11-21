import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";
import { formatPlaybackRate } from "../playback/playbackRates";

/**
 * Says over a fast video that keeps standing still (`playbackstrain`) that
 * the device, or with nothing downloaded ahead its connection, may not keep
 * up with the speed, and offers half of it. It stays, unlike the HUD's messages, until
 * the learner takes the slower speed, dismisses it, or slows down. The video
 * plays on under it, so it is a card at the top, not a cover.
 */
export function PlaybackStrainNotice() {
  const controller = usePlayerController();
  const notice = usePlayerState(({ ui }) => ui.strainNotice);
  // The message that a speed was set from outside the player sits in the
  // same place and goes after a few seconds: this one waits for it.
  const outsideSpeedShown = usePlayerState(
    ({ ui }) => ui.hud?.variant === "outside-speed",
  );
  if (!notice || outsideSpeedShown) return null;
  const rate = formatPlaybackRate(notice.rate);
  const suggested = formatPlaybackRate(notice.suggestedRate);

  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="pointer-events-none absolute inset-0 z-30"
      data-player-strain-notice=""
      role="status"
    >
      <div
        className="pointer-events-auto absolute top-[12%] left-1/2 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col items-center gap-2 rounded-(--video-player-control-radius) border border-(--video-player-control-border) bg-(--video-player-control-surface) px-4 py-2.5 text-center text-(--video-player-control-text) shadow-(--video-player-control-shadow) backdrop-blur-sm"
        // Pressed here, the video under it is not.
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold">
            Playback keeps pausing at {rate}
          </span>
          <span className="text-xs opacity-80">
            {notice.cause === "device"
              ? "Your device may not keep up at this speed."
              : "Your connection or device may not keep up at this speed."}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            className="inline-flex min-h-8 items-center rounded-lg bg-white px-3 py-1 text-xs font-semibold whitespace-nowrap text-black transition-colors hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            onClick={() => controller.acceptStrainNotice()}
          >
            Play at {suggested}
          </button>
          <button
            type="button"
            className="inline-flex min-h-8 items-center rounded-lg border border-white/50 bg-black/35 px-3 py-1 text-xs font-semibold whitespace-nowrap text-white transition-colors hover:border-white/80 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            onClick={() => controller.dismissStrainNotice()}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
