import { useEffect, useRef, useState } from "react";
import { usePlayerState } from "../react/usePlayerState";
import { classNames } from "../utils/classNames";

export interface BufferingIndicatorProps {
  delay?: number;
}

export interface VideoLoadingSpinnerProps {
  className?: string;
}

export function VideoLoadingSpinner({ className }: VideoLoadingSpinnerProps) {
  return (
    <span
      aria-hidden="true"
      className={classNames(
        "video-player-buffering-spinner size-12 overflow-visible",
        className ?? "text-(--video-player-control-text)",
      )}
      data-video-player-buffering-spinner=""
    >
      <svg viewBox="0 0 48 48" className="size-full overflow-visible">
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          className="video-player-buffering-spinner__arc"
        />
      </svg>
    </span>
  );
}

const BUFFERED_PLAYBACK_GRACE_SECONDS = 0.25;

function isInitialLoadingLifecycle(lifecycle: string): boolean {
  return (
    lifecycle === "idle" ||
    lifecycle === "attached" ||
    lifecycle === "loading" ||
    lifecycle === "unloading"
  );
}

export function BufferingIndicator({ delay = 1_000 }: BufferingIndicatorProps) {
  const { initialLoading, waitingForMedia } = usePlayerState(
    (snapshot) => {
      const { buffered, buffering, currentTime, lifecycle } = snapshot.media;
      const initialLoading = isInitialLoadingLifecycle(lifecycle);
      const currentPositionBuffered = buffered.some(
        (range) =>
          currentTime >= range.start &&
          range.end - currentTime >= BUFFERED_PLAYBACK_GRACE_SECONDS,
      );
      return {
        initialLoading,
        waitingForMedia:
          !snapshot.ui.scrubbing &&
          (initialLoading || (buffering && !currentPositionBuffered)),
      };
    },
    (left, right) =>
      left.initialLoading === right.initialLoading &&
      left.waitingForMedia === right.waitingForMedia,
  );
  const [visible, setVisible] = useState(
    () => waitingForMedia && (initialLoading || delay <= 0),
  );
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    if (waitingForMedia) {
      if (visibleRef.current || initialLoading || delay <= 0) {
        setVisible(true);
        return;
      }
      const showTimer = window.setTimeout(() => setVisible(true), delay);
      return () => window.clearTimeout(showTimer);
    }

    setVisible(false);
    return undefined;
  }, [delay, initialLoading, waitingForMedia]);

  const label = initialLoading ? "Loading video" : "Buffering video";

  return (
    <div
      className={classNames(
        "pointer-events-none absolute inset-0 z-40 grid place-items-center",
        visible ? "visible opacity-100" : "invisible opacity-0",
      )}
      role={visible ? "status" : undefined}
      aria-label={visible ? label : undefined}
      aria-hidden={visible ? undefined : true}
      data-video-player-buffering-overlay=""
      data-video-player-buffering-visible={visible ? "true" : "false"}
    >
      <VideoLoadingSpinner />
    </div>
  );
}
