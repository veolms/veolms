import { useEffect, useRef } from "react";
import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";
import { usePlayerMobileInteraction } from "../react/PlayerInteractionMode";
import { classNames } from "../utils/classNames";

const FEEDBACK_RESET_CONTROLS_DELAY_MS = 1_000;

/**
 * The zoom's type, sized for "2.35×" to sit inside its key in every
 * theme's face (a monospace one included: the key widens a little before
 * the number would touch its edges). Forced: the app's `button { font:
 * inherit }` outranks Tailwind's type utilities on a button, which had the
 * number at the page's 16px.
 */
const ZOOM_LABEL_TYPE_CLASS = "!leading-none !font-medium !tabular-nums";

export interface ZoomLevelIndicatorProps {
  className?: string;
  variant?: "control" | "feedback";
}

function formatZoom(scale: number): string {
  return `${Number(scale.toFixed(2))}×`;
}

export function ZoomLevelIndicator({
  className,
  variant = "control",
}: ZoomLevelIndicatorProps) {
  const controller = usePlayerController();
  const mobileInteraction = usePlayerMobileInteraction();
  const controlsRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const { controlsVisible, feedbackVisible, fullscreen, snap, scale } =
    usePlayerState(
      ({ ui }) => ({
        controlsVisible: ui.controlsVisible,
        feedbackVisible: ui.zoom.feedbackVisible,
        fullscreen: ui.fullscreen,
        snap: ui.zoom.snap,
        scale: ui.zoom.scale,
      }),
      (left, right) =>
        left.controlsVisible === right.controlsVisible &&
        left.feedbackVisible === right.feedbackVisible &&
        left.fullscreen === right.fullscreen &&
        left.snap === right.snap &&
        left.scale === right.scale,
    );
  const feedback = variant === "feedback";
  const visible = feedback
    ? feedbackVisible && !controlsVisible
    : controlsVisible && scale > 1.001;

  useEffect(
    () => () => {
      if (controlsRevealTimerRef.current !== null) {
        clearTimeout(controlsRevealTimerRef.current);
      }
    },
    [],
  );

  const resetZoom = () => {
    controller.resetZoom();
    if (!feedback) return;
    controller.setControlsVisible(false);
    if (controlsRevealTimerRef.current !== null) {
      clearTimeout(controlsRevealTimerRef.current);
    }
    controlsRevealTimerRef.current = setTimeout(() => {
      controlsRevealTimerRef.current = null;
      const zoom = controller.getSnapshot().ui.zoom;
      if (!zoom.gestureActive && zoom.scale <= 1.001) {
        controller.setControlsVisible(true);
      }
    }, FEEDBACK_RESET_CONTROLS_DELAY_MS);
  };

  if (!visible) return null;
  const label = formatZoom(scale);

  if (!feedback) {
    return (
      <button
        type="button"
        className={classNames(
          "pointer-events-auto inline-grid h-9 min-w-9 shrink-0 touch-manipulation place-items-center rounded-full bg-(--video-player-control-surface) px-0.5 text-(--video-player-control-text) shadow-(--video-player-control-shadow) transition-colors hover:bg-(--video-player-control-surface-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-control-text) motion-reduce:transition-none sm:h-10 sm:min-w-10",
          ZOOM_LABEL_TYPE_CLASS,
          "!text-[12px]",
          mobileInteraction && "!h-9 !min-w-9",
          className,
        )}
        aria-label={`Reset video zoom from ${label} to 1×`}
        data-player-zoom-indicator="control"
        onClick={resetZoom}
      >
        {label}
      </button>
    );
  }

  const resetButton = (
    <button
      type="button"
      className={classNames(
        "pointer-events-auto grid h-11.5 min-w-11.5 touch-manipulation place-items-center rounded-full bg-(--video-player-control-surface) px-0.5 text-(--video-player-control-text) shadow-(--video-player-control-shadow) transition-colors before:absolute before:-inset-0.5 before:rounded-full hover:bg-(--video-player-control-surface-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-control-text) motion-reduce:transition-none",
        fullscreen ? "absolute right-2 top-2 z-50" : "relative",
        ZOOM_LABEL_TYPE_CLASS,
        "!text-[13px]",
        className,
      )}
      aria-label={`Reset video zoom from ${label} to 1×`}
      data-player-controls-reveal="delayed"
      data-player-zoom-indicator="feedback"
      data-player-zoom-reset=""
      onClick={resetZoom}
    >
      {label}
    </button>
  );

  // In the page, at the top in the middle and on its own: a phone's edge
  // panels (Vivo's sidebar, at the right edge) take a touch in the corner
  // before the page sees it, and the page's picture only ever snaps back to
  // its original size, which needs no word (the user's calls).
  if (!fullscreen) {
    return (
      <div className="pointer-events-none absolute top-2 left-1/2 z-50 -translate-x-1/2">
        {resetButton}
      </div>
    );
  }

  return (
    <>
      {snap ? (
        // Said near the top of the picture as it snaps, as YouTube's app
        // does.
        <span
          role="status"
          className="pointer-events-none absolute top-[11%] left-1/2 z-50 -translate-x-1/2 rounded-lg bg-black/60 px-4 py-2.5 text-base leading-tight font-medium whitespace-nowrap text-white motion-safe:animate-in motion-safe:fade-in"
          data-player-zoom-snap-label={snap}
        >
          {snap === "fill" ? "Zoomed to fill" : "Original"}
        </span>
      ) : null}
      {resetButton}
    </>
  );
}
