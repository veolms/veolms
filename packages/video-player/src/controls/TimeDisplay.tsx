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
  const { currentTime, duration, lifecycle } = usePlayerState(
    ({ media }) => ({
      currentTime: media.currentTime,
      duration: media.duration,
      lifecycle: media.lifecycle,
    }),
    (left, right) =>
      Math.floor(left.currentTime) === Math.floor(right.currentTime) &&
      Math.floor(left.duration) === Math.floor(right.duration) &&
      left.lifecycle === right.lifecycle,
  );
  const timeResolved = lifecycle === "ready" && duration > 0;
  const displayCurrentTime = timeResolved ? currentTime : 0;
  const displayDuration = timeResolved ? duration : 0;
  const remainingTime = Math.max(0, displayDuration - displayCurrentTime);
  const currentLabel = formatMediaTime(displayCurrentTime);
  const durationLabel = formatMediaTime(displayDuration);
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
      disabled={!timeResolved}
      title={showRemaining ? "Show elapsed time" : "Show remaining time"}
      onClick={() => setShowRemaining((remaining) => !remaining)}
    >
      <span className="relative z-10">{displayValue}</span>
    </button>
  );
}
