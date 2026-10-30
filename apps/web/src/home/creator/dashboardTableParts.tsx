import { useEffect, useRef, useState } from "react";
import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/ArrowClockwise";

function clampCourseProgress(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function DashboardRetryContent({
  title,
  message,
  isRetrying,
  onRetry,
}: {
  title: string;
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  return (
    <span className="creator-dashboard-state-content">
      <strong>{title}</strong>
      <small>{message}</small>
      <button
        type="button"
        className="creator-dashboard-state-retry"
        onClick={onRetry}
        disabled={isRetrying}
        aria-busy={isRetrying}
      >
        <ArrowClockwise
          size={14}
          aria-hidden="true"
          className={
            isRetrying
              ? "creator-dashboard-state-retry-icon is-retrying"
              : "creator-dashboard-state-retry-icon"
          }
        />
        {isRetrying ? "Retrying…" : "Retry"}
      </button>
    </span>
  );
}

export function CreatorCourseProgress({
  value,
  animated,
}: {
  value: number;
  animated: boolean;
}) {
  const target = clampCourseProgress(value);
  const displayedProgressRef = useRef(animated ? 0 : target);
  const [displayedProgress, setDisplayedProgress] = useState(
    displayedProgressRef.current,
  );

  useEffect(() => {
    if (!animated) {
      displayedProgressRef.current = target;
      setDisplayedProgress(target);
      return;
    }

    if (displayedProgressRef.current === target) return;

    const frame = window.requestAnimationFrame(() => {
      displayedProgressRef.current = target;
      setDisplayedProgress(target);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [animated, target]);

  return (
    <i>
      <b
        className={
          animated ? "creator-progress-fill" : "creator-progress-fill--static"
        }
        style={{ width: `${displayedProgress}%` }}
      />
    </i>
  );
}
