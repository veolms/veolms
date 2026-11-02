import { memo, useEffect, useRef, useState } from "react";
import { usePlayerController } from "../react/context";
import { useAwaitingFirstFrame } from "../react/useAwaitingFirstFrame";
import { usePlayerState } from "../react/usePlayerState";
import { classNames } from "../utils/classNames";
import { isCurrentPositionBuffered } from "../core/playbackStall";

export interface BufferingIndicatorProps {
  delay?: number;
  /**
   * Shows the spinner immediately during startup and play/resume waits.
   * Defaults to true. A requested play that is waiting for a newly loaded
   * video's first frame shows it immediately either way.
   */
  immediatePlayWaits?: boolean;
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

function isInitialLoadingLifecycle(lifecycle: string): boolean {
  return (
    lifecycle === "idle" ||
    lifecycle === "attached" ||
    lifecycle === "loading" ||
    lifecycle === "unloading"
  );
}

export function BufferingIndicator({
  delay = 1_000,
  immediatePlayWaits = true,
}: BufferingIndicatorProps) {
  const controller = usePlayerController();
  const awaitingFirstFrame = useAwaitingFirstFrame(controller);
  const {
    initialLoading,
    playInFlight,
    playbackHasBegun,
    startPending,
    waitingForMedia,
  } = usePlayerState(
    (snapshot) => {
      const { buffered, buffering, currentTime, lifecycle } = snapshot.media;
      const initialLoading = isInitialLoadingLifecycle(lifecycle);
      const currentPositionBuffered = isCurrentPositionBuffered({
        buffered,
        currentTime,
      });
      const playbackHasBegun = snapshot.media.playing || snapshot.media.ended;
      const playInFlight = !playbackHasBegun && !snapshot.media.paused;
      // Play has been asked for and nothing is buffered to play from.
      const startPending =
        snapshot.media.error === null &&
        !snapshot.ui.scrubbing &&
        !snapshot.media.paused &&
        !snapshot.media.ended &&
        !currentPositionBuffered;
      return {
        initialLoading,
        playInFlight,
        playbackHasBegun,
        startPending,
        // A player that has failed is not waiting for anything: it says
        // so, and a spinner turning over that message would say it is
        // still trying. (A play that was asked for before the failure
        // stays "in flight", which is what kept the spinner up.)
        waitingForMedia:
          snapshot.media.error === null &&
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
      left.startPending === right.startPending &&
      left.waitingForMedia === right.waitingForMedia,
  );
  // A newly opened video waiting for its first frame: a black frame with
  // no spinner reads as broken, however short the wait.
  const firstFrameWait = awaitingFirstFrame && startPending;
  const waiting = waitingForMedia || firstFrameWait;
  const immediate =
    delay <= 0 ||
    firstFrameWait ||
    (immediatePlayWaits && (initialLoading || playInFlight));
  const [visible, setVisible] = useState(() => waiting && immediate);
  const visibleRef = useRef(visible);
  const holdForFirstFrameRef = useRef(false);
  // Declared before the effect below, so on every commit it has already
  // run when that effect reads these refs.
  useEffect(() => {
    visibleRef.current = visible;
    if (playInFlight || firstFrameWait) {
      holdForFirstFrameRef.current = true;
    }
  });

  useEffect(() => {
    if (waiting) {
      if (visibleRef.current || immediate) {
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
  }, [controller, delay, immediate, playbackHasBegun, waiting]);

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
