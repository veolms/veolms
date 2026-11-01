import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePlayerController } from "../react/context";
import { usePlayerTheme } from "../themes/PlayerThemeContext";
import { classNames } from "../utils/classNames";
import { PLAYBACK_BEZEL_DURATION_MS } from "./feedbackTiming";
import { usePlayerMobileInteraction } from "../react/PlayerInteractionMode";

export interface PlaybackFeedbackProps {
  className?: string;
  durationMs?: number;
}

interface PlaybackFeedbackState {
  id: number;
  kind: "pause" | "play";
}

export function PlaybackFeedback({
  className,
  durationMs = PLAYBACK_BEZEL_DURATION_MS,
}: PlaybackFeedbackProps = {}) {
  const controller = usePlayerController();
  const mobileInteraction = usePlayerMobileInteraction();
  const sequenceRef = useRef(0);
  const [feedback, setFeedback] = useState<PlaybackFeedbackState | null>(null);
  const { icons } = usePlayerTheme();

  useEffect(() => {
    let previousPaused = controller.getSnapshot().media.paused;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A video that starts playing as it opens gets the spinner, not a play
    // bezel: a play icon over a black frame reads as "press play". Tracked
    // here, not with useAwaitingFirstFrame, so it is current when the
    // snapshot listener below runs.
    let awaitingFirstFrame = !controller.getSnapshot().media.playing;
    const offEvent = controller.onEvent((event) => {
      if (event.type === "loadstart") awaitingFirstFrame = true;
      else if (event.type === "playing") awaitingFirstFrame = false;
    });
    const unsubscribe = controller.subscribe(() => {
      const { media } = controller.getSnapshot();
      if (media.lifecycle !== "ready" || media.ended) {
        previousPaused = media.paused;
        if (timer) clearTimeout(timer);
        timer = undefined;
        setFeedback(null);
        return;
      }
      if (previousPaused === media.paused) return;
      previousPaused = media.paused;
      if (!media.paused && awaitingFirstFrame) return;
      // A drag on the timeline pauses and resumes by itself.
      if (controller.scrubPausing) return;

      sequenceRef.current += 1;
      const nextFeedback: PlaybackFeedbackState = {
        id: sequenceRef.current,
        kind: media.paused ? "pause" : "play",
      };
      setFeedback(nextFeedback);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setFeedback((current) =>
          current?.id === nextFeedback.id ? null : current,
        );
      }, durationMs);
    });

    return () => {
      offEvent();
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [controller, durationMs]);

  if (!feedback || mobileInteraction) return null;
  const Icon = feedback.kind === "play" ? icons.play : icons.pause;

  // Not on a device with a touch screen (a tablet, a touch screen laptop),
  // as not on a phone: the play and pause button in the middle of the
  // player is shown there, and the flash would be a second one over it.
  return (
    <div
      aria-hidden="true"
      className={classNames(
        "pointer-events-none absolute inset-0 z-25 hidden place-items-center sm:grid [@media(any-pointer:coarse)]:!hidden",
        className,
      )}
      data-video-player-playback-feedback={feedback.kind}
    >
      <span
        key={feedback.id}
        // A see-through dark circle: the video shows through it, unblurred.
        className="grid size-12 place-items-center rounded-full border-0 bg-black/40 text-white shadow-none lg:size-15"
        data-playback-feedback-bezel=""
        data-playback-feedback-duration={durationMs}
        data-playback-feedback-surface=""
        style={
          {
            "--video-player-playback-feedback-duration": `${durationMs}ms`,
          } as CSSProperties
        }
      >
        <Icon
          active
          aria-hidden="true"
          // Not nudged: the play triangle is already drawn right of its
          // box's middle, which is where the eye puts a triangle's centre;
          // a further 2px left it visibly off to the right.
          className="size-6 lg:size-7.5"
          data-playback-feedback-icon={feedback.kind}
          size={26}
        />
      </span>
    </div>
  );
}
