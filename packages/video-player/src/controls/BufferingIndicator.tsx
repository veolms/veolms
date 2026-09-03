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
  label,
}: {
  delay: number;
  label: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return visible ? <PlayerBufferingOverlay label={label} /> : null;
}

const BUFFERED_PLAYBACK_GRACE_SECONDS = 0.25;

export function BufferingIndicator({ delay = 1_000 }: BufferingIndicatorProps) {
  const { buffered, buffering, currentTime, lifecycle, scrubbing } =
    usePlayerState(
      (snapshot) => ({
        buffered: snapshot.media.buffered,
        buffering: snapshot.media.buffering,
        currentTime: snapshot.media.currentTime,
        lifecycle: snapshot.media.lifecycle,
        scrubbing: snapshot.ui.scrubbing,
      }),
      (left, right) =>
        left.buffered === right.buffered &&
        left.buffering === right.buffering &&
        left.currentTime === right.currentTime &&
        left.lifecycle === right.lifecycle &&
        left.scrubbing === right.scrubbing,
    );
  const initialLoading = lifecycle === "loading";
  const currentPositionBuffered = buffered.some(
    (range) =>
      currentTime >= range.start &&
      range.end - currentTime >= BUFFERED_PLAYBACK_GRACE_SECONDS,
  );
  const waitingForMedia =
    initialLoading || (buffering && !currentPositionBuffered);

  if (scrubbing || !waitingForMedia) return null;
  return (
    <ActiveBufferingIndicator
      delay={delay}
      label={initialLoading ? "Loading video" : "Buffering video"}
    />
  );
}
