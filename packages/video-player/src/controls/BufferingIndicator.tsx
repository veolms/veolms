import { useEffect, useState } from "react";
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
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      className={classNames(
        "video-player-buffering-spinner size-12 overflow-visible",
        className ?? "text-(--video-player-control-text)",
      )}
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
  );
}

function PlayerBufferingOverlay({ label }: { label: string }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-40 grid place-items-center"
      role="status"
      aria-label={label}
      data-video-player-buffering-overlay=""
    >
      <VideoLoadingSpinner />
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
  const [visible, setVisible] = useState(delay <= 0);

  useEffect(() => {
    if (visible || delay <= 0) return;
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay, visible]);

  return visible || delay <= 0 ? (
    <PlayerBufferingOverlay label={label} />
  ) : null;
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
  const initialLoading =
    lifecycle === "idle" ||
    lifecycle === "attached" ||
    lifecycle === "loading" ||
    lifecycle === "unloading";
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
      delay={initialLoading ? 0 : delay}
      label={initialLoading ? "Loading video" : "Buffering video"}
    />
  );
}
