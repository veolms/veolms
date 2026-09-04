import { memo, useEffect, useRef, useState } from "react";
import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";
import { classNames } from "../utils/classNames";

export interface BufferingIndicatorProps {
  delay?: number;
}

export interface VideoLoadingSpinnerProps {
  className?: string;
}

const FIRST_FRAME_HIDE_TIMEOUT_MS = 800;

export const VideoLoadingSpinner = memo(function VideoLoadingSpinner({
  className,
}: VideoLoadingSpinnerProps) {
  return (
    <span
      aria-hidden="true"
      className={classNames(
        "video-player-buffering-spinner size-12 overflow-visible",
        className ?? "text-(--video-player-control-text)",
      )}
      data-video-player-buffering-spinner=""
    >
      <span className="video-player-buffering-spinner__arc" />
    </span>
  );
});

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
  const controller = usePlayerController();
  const { initialLoading, playInFlight, playbackHasBegun, waitingForMedia } =
    usePlayerState(
      (snapshot) => {
        const { buffered, buffering, currentTime, lifecycle } = snapshot.media;
        const initialLoading = isInitialLoadingLifecycle(lifecycle);
        const currentPositionBuffered = buffered.some(
          (range) =>
            currentTime >= range.start &&
            range.end - currentTime >= BUFFERED_PLAYBACK_GRACE_SECONDS,
        );
        const playbackHasBegun = snapshot.media.playing || snapshot.media.ended;
        const playInFlight = !playbackHasBegun && !snapshot.media.paused;
        return {
          initialLoading,
          playInFlight,
          playbackHasBegun,
          waitingForMedia:
            !snapshot.ui.scrubbing &&
            (initialLoading ||
              playInFlight ||
              (buffering && !currentPositionBuffered)),
        };
      },
      (left, right) =>
        left.initialLoading === right.initialLoading &&
        left.playInFlight === right.playInFlight &&
        left.playbackHasBegun === right.playbackHasBegun &&
        left.waitingForMedia === right.waitingForMedia,
    );
  const [visible, setVisible] = useState(
    () => waitingForMedia && (initialLoading || delay <= 0),
  );
  const visibleRef = useRef(visible);
  const holdForFirstFrameRef = useRef(false);
  visibleRef.current = visible;
  if (playInFlight) {
    holdForFirstFrameRef.current = true;
  }

  useEffect(() => {
    if (waitingForMedia) {
      if (
        visibleRef.current ||
        initialLoading ||
        playInFlight ||
        delay <= 0
      ) {
        setVisible(true);
        return;
      }
      const showTimer = window.setTimeout(() => setVisible(true), delay);
      return () => window.clearTimeout(showTimer);
    }

    if (!visibleRef.current) {
      return undefined;
    }

    if (!holdForFirstFrameRef.current || !playbackHasBegun) {
      holdForFirstFrameRef.current = false;
      setVisible(false);
      return undefined;
    }

    holdForFirstFrameRef.current = false;
    let cancelled = false;
    const hide = () => {
      if (!cancelled) setVisible(false);
    };
    const timeoutId = window.setTimeout(hide, FIRST_FRAME_HIDE_TIMEOUT_MS);
    void controller.waitForPresentedFrame().then(() => {
      window.clearTimeout(timeoutId);
      hide();
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    controller,
    delay,
    initialLoading,
    playInFlight,
    playbackHasBegun,
    waitingForMedia,
  ]);

  const label = initialLoading ? "Loading video" : "Buffering video";

  return (
    <div
      className="pointer-events-none absolute inset-0 z-40 grid place-items-center"
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
