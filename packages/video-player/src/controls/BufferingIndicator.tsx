import { useEffect, useState } from "react";
import { usePlayerState } from "../react/usePlayerState";

export interface BufferingIndicatorProps {
  delay?: number;
}

function PlayerBufferingOverlay({ label }: { label: string }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-40 grid place-items-center"
      role="status"
      aria-label={label}
      data-video-player-buffering-overlay=""
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 48 48"
        className="video-player-buffering-spinner size-12 overflow-visible text-(--video-player-control-text)"
        data-video-player-buffering-spinner=""
      >
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
    </div>
  );
}

function ActiveBufferingIndicator({
  delay,
  initialLoading,
}: {
  delay: number;
  initialLoading: boolean;
}) {
  const [visible, setVisible] = useState(initialLoading);
  const [label] = useState(
    initialLoading ? "Loading video" : "Buffering video",
  );

  useEffect(() => {
    if (visible) return undefined;
    const timer = setTimeout(
      () => setVisible(true),
      initialLoading ? 0 : delay,
    );
    return () => clearTimeout(timer);
  }, [delay, initialLoading, visible]);

  return initialLoading || visible ? (
    <PlayerBufferingOverlay label={label} />
  ) : null;
}

export function BufferingIndicator({ delay = 280 }: BufferingIndicatorProps) {
  const { buffering, lifecycle } = usePlayerState(
    ({ media }) => ({ buffering: media.buffering, lifecycle: media.lifecycle }),
    (left, right) =>
      left.buffering === right.buffering && left.lifecycle === right.lifecycle,
  );
  const initialLoading = lifecycle === "loading";

  if (!initialLoading && !buffering) return null;
  return (
    <ActiveBufferingIndicator delay={delay} initialLoading={initialLoading} />
  );
}
