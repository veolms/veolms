import { formatMediaTime } from "../accessibility/formatMediaTime";
import { usePlayerState } from "../react/usePlayerState";

export function TimeDisplay() {
  const { currentTime, duration } = usePlayerState(
    ({ media }) => ({
      currentTime: media.currentTime,
      duration: media.duration,
    }),
    (left, right) =>
      Math.floor(left.currentTime) === Math.floor(right.currentTime) &&
      Math.floor(left.duration) === Math.floor(right.duration),
  );

  return (
    <span
      className="select-none whitespace-nowrap px-1 text-xs font-medium tabular-nums text-white sm:text-sm"
      aria-label={`${formatMediaTime(currentTime)} elapsed of ${formatMediaTime(duration)}`}
    >
      {formatMediaTime(currentTime)} / {formatMediaTime(duration)}
    </span>
  );
}
