import { useEffect, useRef } from "react";
import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";

const FEEDBACK_RESET_CONTROLS_DELAY_MS = 1_000;

export interface ZoomLevelIndicatorProps {
  variant?: "control" | "feedback";
}

function formatZoom(scale: number): string {
  return `${Number(scale.toFixed(2))}×`;
}

export function ZoomLevelIndicator({
  variant = "control",
}: ZoomLevelIndicatorProps) {
  const controller = usePlayerController();
  const controlsRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const { controlsVisible, feedbackVisible, scale } = usePlayerState(
    ({ ui }) => ({
      controlsVisible: ui.controlsVisible,
      feedbackVisible: ui.zoom.feedbackVisible,
      scale: ui.zoom.scale,
    }),
    (left, right) =>
      left.controlsVisible === right.controlsVisible &&
      left.feedbackVisible === right.feedbackVisible &&
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
        className="pointer-events-auto inline-grid size-8 shrink-0 touch-manipulation place-items-center rounded-full bg-(--video-player-control-surface) text-xs font-medium tabular-nums text-(--video-player-control-text) shadow-(--video-player-control-shadow) transition-colors hover:bg-(--video-player-control-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-control-text) motion-reduce:transition-none sm:size-9"
        aria-label={`Reset video zoom from ${label} to 1×`}
        data-player-zoom-indicator="control"
        onClick={resetZoom}
      >
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="pointer-events-auto absolute right-2 top-2 z-50 grid size-10 touch-manipulation place-items-center rounded-full bg-(--video-player-control-surface) text-xs font-medium tabular-nums text-(--video-player-control-text) shadow-(--video-player-control-shadow) transition-colors before:absolute before:-inset-0.5 before:rounded-full hover:bg-(--video-player-control-hover) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-control-text) motion-reduce:transition-none"
      aria-label={`Reset video zoom from ${label} to 1×`}
      data-player-controls-reveal="delayed"
      data-player-zoom-indicator="feedback"
      data-player-zoom-reset=""
      onClick={resetZoom}
    >
      {label}
    </button>
  );
}
