import { useEffect, type CSSProperties } from "react";
import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";
import { usePlayerTheme } from "../themes/PlayerThemeContext";
import { PLAYER_FEEDBACK_DURATION_MS } from "./feedbackTiming";

export function PlayerHud() {
  const controller = usePlayerController();
  const hud = usePlayerState(({ ui }) => ui.hud);
  const { icons } = usePlayerTheme();

  useEffect(() => {
    if (!hud) return undefined;
    const timer = setTimeout(
      () => controller.clearHud(hud.id),
      PLAYER_FEEDBACK_DURATION_MS,
    );
    return () => clearTimeout(timer);
  }, [controller, hud]);

  if (!hud) return null;
  if (hud.variant === "playback-rate" && hud.direction) {
    const Icon = hud.direction < 0 ? icons.speedDecrease : icons.speedIncrease;
    const durationStyle = {
      "--video-player-playback-feedback-duration": `${PLAYER_FEEDBACK_DURATION_MS}ms`,
    } as CSSProperties;

    return (
      <div
        key={hud.id}
        aria-atomic="true"
        aria-live="polite"
        className="pointer-events-none absolute inset-0 z-30 hidden sm:block"
        data-player-hud-variant="playback-rate"
        role="status"
      >
        <div className="absolute top-[14%] left-1/2 -translate-x-1/2">
          <span
            className="grid min-h-11 min-w-20 place-items-center rounded-lg border border-(--video-player-control-border) bg-(--video-player-control-surface) px-4 py-2 text-center text-xl leading-none font-medium tabular-nums text-(--video-player-control-text) shadow-(--video-player-control-shadow) backdrop-blur-sm lg:text-2xl"
            data-playback-feedback-duration={PLAYER_FEEDBACK_DURATION_MS}
            data-playback-feedback-surface=""
            data-player-playback-rate={hud.text}
            style={durationStyle}
          >
            {hud.text}
          </span>
        </div>
        <div
          className="absolute inset-0 grid place-items-center"
          aria-hidden="true"
        >
          <span
            className="grid size-20 place-items-center rounded-full border border-(--video-player-control-border) bg-(--video-player-control-surface) text-(--video-player-control-text) shadow-(--video-player-control-shadow) backdrop-blur-sm lg:size-22"
            data-playback-feedback-duration={PLAYER_FEEDBACK_DURATION_MS}
            data-playback-feedback-surface=""
            style={durationStyle}
          >
            <Icon
              active
              aria-hidden="true"
              className="size-10 lg:size-11"
              data-player-playback-rate-icon={
                hud.direction < 0 ? "decrease" : "increase"
              }
              size={44}
            />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      key={hud.id}
      className="pointer-events-none absolute inset-0 z-30 grid place-items-center"
      role="status"
      aria-live="polite"
    >
      <span className="animate-[video-player-hud_850ms_ease-out_forwards] rounded-(--video-player-control-radius) border border-(--video-player-control-border) bg-(--video-player-control-surface) px-4 py-2 text-sm font-semibold text-(--video-player-control-text) shadow-(--video-player-control-shadow) motion-reduce:animate-none">
        {hud.text}
      </span>
    </div>
  );
}
