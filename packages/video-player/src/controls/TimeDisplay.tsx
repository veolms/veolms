import { useState } from "react";
import { formatMediaTime } from "../accessibility/formatMediaTime";
import { usePlayerState } from "../react/usePlayerState";
import { classNames } from "../utils/classNames";
import { usePlayerMobileInteraction } from "../react/PlayerInteractionMode";

export interface TimeDisplayProps {
  className?: string;
  interactive?: boolean;
}

export function TimeDisplay({
  className,
  interactive = false,
}: TimeDisplayProps = {}) {
  const [showRemaining, setShowRemaining] = useState(false);
  const mobileInteraction = usePlayerMobileInteraction();
  const { currentTime, duration } = usePlayerState(
    ({ media }) => ({
      currentTime: media.currentTime,
      duration: media.duration,
    }),
    (left, right) =>
      Math.floor(left.currentTime) === Math.floor(right.currentTime) &&
      Math.floor(left.duration) === Math.floor(right.duration),
  );
  const remainingTime = Math.max(0, duration - currentTime);
  const currentLabel = formatMediaTime(currentTime);
  const durationLabel = formatMediaTime(duration);
  const remainingLabel = formatMediaTime(remainingTime);
  const displayValue = showRemaining
    ? `-${remainingLabel} / ${durationLabel}`
    : `${currentLabel} / ${durationLabel}`;
  const displayClassName = classNames(
    "select-none whitespace-nowrap px-1 text-xs font-medium tabular-nums text-(--video-player-control-text) focus-visible:outline-(--video-player-control-text) sm:text-sm",
    mobileInteraction && "!text-xs",
    className,
  );

  if (!interactive) {
    return (
      <span
        className={displayClassName}
        aria-label={`${currentLabel} elapsed of ${durationLabel}`}
      >
        {displayValue}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={displayClassName}
      aria-label={
        showRemaining
          ? `${remainingLabel} remaining of ${durationLabel}. Show elapsed time`
          : `${currentLabel} elapsed of ${durationLabel}. Show remaining time`
      }
      aria-pressed={showRemaining}
      data-player-control=""
      disabled={!Number.isFinite(duration) || duration <= 0}
      title={showRemaining ? "Show elapsed time" : "Show remaining time"}
      onClick={() => setShowRemaining((remaining) => !remaining)}
    >
      <span className="relative z-10">{displayValue}</span>
    </button>
  );
}
