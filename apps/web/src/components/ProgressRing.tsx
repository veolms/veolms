import type { ReactNode } from "react";

/** The ring's own units: it is drawn 40 across, whatever size it is shown. */
const VIEW = 40;

/**
 * A share as a ring: a thick arc with round ends from the top, clockwise,
 * as long as the share, and the rest of the way round a muted track, with a
 * small gap between the two at each end. Whatever is given as children sits
 * in its centre. The arcs are measured with `pathLength`, so lengths are
 * percentages of the way round.
 */
export function ProgressRing({
  share,
  stroke = 5,
  arcClassName = "stroke-(--accent)",
  trackClassName = "stroke-(--text)/12",
  animate = true,
  className = "",
  children,
}: {
  /** 0 to 1. */
  share: number;
  /** In the ring's own units (it is 40 across). */
  stroke?: number;
  arcClassName?: string;
  trackClassName?: string;
  /** The arc grows into place when it first appears and when it changes. */
  animate?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const radius = VIEW / 2 - stroke / 2;
  const circumference = 2 * Math.PI * radius;
  // A sliver would draw only the arc's round cap, a dot that reads as more
  // than it is; below half a percent the track stands alone.
  const clamped = share < 0.005 ? 0 : Math.min(1, share);
  const arc = clamped * 100;
  // Each gap is as wide as two thirds of the stroke where it shows. The
  // round caps reach half a stroke past each end of both arcs, so that
  // much more is left between them.
  const gap =
    clamped > 0 && clamped < 1 ? ((stroke * 5) / 3 / circumference) * 100 : 0;
  const track = 100 - arc - 2 * gap;
  const motion = animate
    ? "transition-[stroke-dasharray,stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
    : "";

  return (
    <span className={`relative grid place-items-center ${className}`}>
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        aria-hidden="true"
        className="absolute inset-0 size-full -rotate-90"
      >
        {track > 0 ? (
          <circle
            cx={VIEW / 2}
            cy={VIEW / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap={clamped > 0 ? "round" : "butt"}
            pathLength={100}
            strokeDasharray={`${track} ${100 - track}`}
            strokeDashoffset={-(arc + gap)}
            className={`${trackClassName} ${motion}`}
          />
        ) : null}
        {clamped > 0 ? (
          <circle
            cx={VIEW / 2}
            cy={VIEW / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${arc} ${100 - arc}`}
            className={`${arcClassName} ${motion}`}
          />
        ) : null}
      </svg>
      {children}
    </span>
  );
}
