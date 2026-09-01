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
  if (hud.variant === "mobile-seek" && hud.direction) {
    const Icon = icons.disclosure;
    const backward = hud.direction < 0;

    return (
      <div
        key={hud.id}
        aria-label={`Seek ${backward ? "backward" : "forward"} ${hud.text.replace(/[+−]/u, "")} seconds`}
        aria-atomic="true"
        aria-live="polite"
        className="pointer-events-none absolute inset-0 z-30 sm:hidden"
        data-player-hud-direction={backward ? "backward" : "forward"}
        data-player-hud-variant="mobile-seek"
        role="status"
      >
        <div
          className={`absolute inset-y-0 flex w-[34%] items-center justify-center ${
            backward ? "left-0" : "right-0"
          }`}
          aria-hidden="true"
        >
          <span
            className="flex animate-[video-player-hud_850ms_cubic-bezier(0.16,1,0.3,1)_forwards] items-center gap-4 text-2xl leading-none font-semibold tabular-nums text-(--video-player-control-text) drop-shadow-[0_2px_5px_rgb(0_0_0/0.9)] motion-reduce:animate-none"
            data-player-mobile-seek-feedback=""
            data-player-mobile-seek-total={hud.text}
          >
            {backward ? (
              <Icon
                active
                className="size-8 rotate-180"
                data-player-mobile-seek-icon="backward"
                size={32}
              />
            ) : null}
            <span>{hud.text}</span>
            {!backward ? (
              <Icon
                active
                className="size-8"
                data-player-mobile-seek-icon="forward"
                size={32}
              />
            ) : null}
          </span>
        </div>
      </div>
    );
  }
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
  if (hud.variant === "temporary-speed") {
    return (
      <div
        key={hud.id}
        aria-atomic="true"
        aria-live="polite"
        className="pointer-events-none absolute inset-0 z-30"
        data-player-hud-variant="temporary-speed"
        role="status"
      >
        <span className="absolute top-[22%] left-1/2 -translate-x-1/2 animate-[video-player-hud_850ms_ease-out_forwards] rounded-(--video-player-control-radius) border border-(--video-player-control-border) bg-(--video-player-control-surface) px-4 py-2 text-sm font-semibold whitespace-nowrap text-(--video-player-control-text) shadow-(--video-player-control-shadow) motion-reduce:animate-none">
          {hud.text}
        </span>
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
