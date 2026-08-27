import type { CSSProperties, ReactNode, Ref } from "react";
import { cn } from "../../lib/utils";
import type { ElasticScrollAppearance } from "../../settings/settingsPreferences";
import {
  ELASTIC_SCROLL_CONTROL_PROGRESS_CIRCUMFERENCE,
  ELASTIC_SCROLL_CONTROL_PROGRESS_RADIUS,
} from "./elasticScrollerModel";

export const elasticScrollerButtonSurface = (
  appearance: ElasticScrollAppearance,
): string =>
  appearance === "3d"
    ? "border-[color-mix(in_srgb,var(--border-strong)_66%,var(--text)_34%)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--surface-strong)_88%,white),color-mix(in_srgb,var(--surface-strong)_78%,var(--canvas)))] shadow-[inset_0_1px_0_color-mix(in_srgb,white_28%,transparent),inset_0_-2px_2px_color-mix(in_srgb,var(--canvas)_52%,transparent),0_7px_14px_color-mix(in_srgb,black_42%,transparent)]"
    : "border-[color-mix(in_srgb,var(--border-strong)_88%,var(--accent)_12%)] bg-(--surface-strong) shadow-[0_5px_12px_color-mix(in_srgb,var(--canvas)_30%,transparent)]";

interface ElasticScrollerSocketProps {
  appearance: ElasticScrollAppearance;
  className?: string;
  style?: CSSProperties;
  progressRingRef?: Ref<SVGCircleElement>;
  showStatusDot?: boolean;
  children?: ReactNode;
}

export function ElasticScrollerSocket({
  appearance,
  className,
  style,
  progressRingRef,
  showStatusDot = true,
  children,
}: ElasticScrollerSocketProps) {
  const hasDepth = appearance === "3d";
  const hasDynamicProgress = Boolean(progressRingRef);

  return (
    <span
      className={cn(
        "size-12 rounded-full",
        hasDepth
          ? "border border-[color-mix(in_srgb,var(--border-strong)_72%,var(--text)_28%)] bg-(--canvas) shadow-[inset_0_4px_8px_color-mix(in_srgb,black_52%,transparent),inset_0_-1px_1px_color-mix(in_srgb,white_8%,transparent)]"
          : "bg-[color-mix(in_srgb,var(--surface-strong)_92%,var(--canvas))] shadow-[inset_0_1px_0_color-mix(in_srgb,white_8%,transparent)]",
        className,
      )}
      style={style}
      aria-hidden="true"
    >
      <svg
        className="absolute inset-0 z-2 size-full -rotate-90 overflow-visible"
        viewBox="0 0 40 40"
      >
        <circle
          ref={progressRingRef}
          className="elastic-scroller__progress-ring"
          cx="20"
          cy="20"
          r={ELASTIC_SCROLL_CONTROL_PROGRESS_RADIUS}
          fill="none"
          stroke={
            hasDepth
              ? "color-mix(in srgb, var(--accent) 46%, var(--border-strong))"
              : "var(--accent)"
          }
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={
            hasDynamicProgress
              ? ELASTIC_SCROLL_CONTROL_PROGRESS_CIRCUMFERENCE
              : undefined
          }
          strokeDashoffset={
            hasDynamicProgress
              ? ELASTIC_SCROLL_CONTROL_PROGRESS_CIRCUMFERENCE
              : undefined
          }
        />
      </svg>
      {showStatusDot && (
        <span className="absolute top-1/2 left-1/2 z-3 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--accent)" />
      )}
      {children}
    </span>
  );
}
