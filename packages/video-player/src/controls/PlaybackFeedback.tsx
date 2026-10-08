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
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [controller, durationMs]);

  if (!feedback || mobileInteraction) return null;
  const Icon = feedback.kind === "play" ? icons.play : icons.pause;

  return (
    <div
      aria-hidden="true"
      className={classNames(
        "pointer-events-none absolute inset-0 z-25 hidden place-items-center sm:grid",
        className,
      )}
      data-video-player-playback-feedback={feedback.kind}
    >
      <span
        key={feedback.id}
        className="grid size-12 place-items-center rounded-full border-0 bg-black/60 text-white shadow-none backdrop-blur-[16px]"
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
          className={classNames(
            "size-6",
            feedback.kind === "play" && "translate-x-0.5",
          )}
          data-playback-feedback-icon={feedback.kind}
          size={26}
        />
      </span>
    </div>
  );
}
