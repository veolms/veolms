import { usePlayerState } from "../react/usePlayerState";

export interface ZoomLevelIndicatorProps {
  variant?: "control" | "feedback";
}

function formatZoom(scale: number): string {
  return `${Number(scale.toFixed(2))}×`;
}

export function ZoomLevelIndicator({
  variant = "control",
}: ZoomLevelIndicatorProps) {
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

  if (!visible) return null;
  const label = formatZoom(scale);

  return (
    <output
      className={
        feedback
          ? "pointer-events-none absolute right-2 top-2 z-50 grid size-10 place-items-center rounded-full bg-(--video-player-control-surface) text-xs font-semibold tabular-nums text-(--video-player-control-text) shadow-(--video-player-control-shadow)"
          : "pointer-events-none inline-grid size-8 shrink-0 place-items-center rounded-full bg-(--video-player-control-surface) text-[11px] font-semibold tabular-nums text-(--video-player-control-text) shadow-(--video-player-control-shadow) sm:size-9 sm:text-xs"
      }
      aria-label={`Video zoom ${label}`}
      data-player-zoom-indicator={variant}
    >
      {label}
    </output>
  );
}
