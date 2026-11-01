import type { ReactNode } from "react";
import { ProgressRing } from "../components/ProgressRing";

export type GoalRingTone = "accent" | "beyond";

const arcClasses: Record<GoalRingTone, string> = {
  accent: "stroke-(--accent)",
  beyond: "stroke-emerald-500",
};

/**
 * A share of a goal as a ring (see `ProgressRing`). Drawn large for today
 * and small for each day of the calendar; whatever is given as children
 * sits in its centre.
 */
export function GoalRing({
  share,
  stroke = 5,
  tone = "accent",
  animate = true,
  className = "",
  children,
}: {
  /** 0 to 1. */
  share: number;
  /** In the ring's own units: the ring is 40 across. */
  stroke?: number;
  tone?: GoalRingTone;
  /** The arc grows into place when it first appears. */
  animate?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <ProgressRing
      share={share}
      stroke={stroke}
      arcClassName={arcClasses[tone]}
      animate={animate}
      className={className}
    >
      {children}
    </ProgressRing>
  );
}
