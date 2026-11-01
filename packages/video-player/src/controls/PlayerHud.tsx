import { useEffect, type CSSProperties } from "react";
import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";
import { usePlayerTheme } from "../themes/PlayerThemeContext";
import {
  MOBILE_SEEK_IDLE_DELAY_MS,
  PLAYBACK_BEZEL_DURATION_MS,
  PLAYER_FEEDBACK_DURATION_MS,
} from "./feedbackTiming";
import { VolumeLevelIcon, getVolumeLevel } from "./VolumeLevelIcon";
import { usePlayerMobileInteraction } from "../react/PlayerInteractionMode";

export function PlayerHud() {
  const controller = usePlayerController();
  const mobileInteraction = usePlayerMobileInteraction();
  const hud = usePlayerState(({ ui }) => ui.hud);
  const { icons } = usePlayerTheme();

  useEffect(() => {
    if (!hud) return undefined;
    const durationMs =
      hud.variant === "mobile-seek"
        ? MOBILE_SEEK_IDLE_DELAY_MS
        : hud.variant === "volume"
          ? PLAYBACK_BEZEL_DURATION_MS
          : PLAYER_FEEDBACK_DURATION_MS;
    const timer = setTimeout(() => controller.clearHud(hud.id), durationMs);
    return () => clearTimeout(timer);
  }, [controller, hud]);

  if (!hud) return null;
  // Shown wherever a double tap seeks (the phone layout, a finger on a
  // tablet, the mini player), and for the arrow keys everywhere: the same
  // side, the same running total.
  if (
    (hud.variant === "mobile-seek" || hud.variant === "keyboard-seek") &&
    hud.direction
  ) {
    const Icon = icons.disclosure;
    const backward = hud.direction < 0;

    return (
      <div
        key={hud.id}
        aria-label={`Seek ${backward ? "backward" : "forward"} ${hud.text.replace(/[+−]/u, "")} seconds`}
        aria-atomic="true"
        aria-live="polite"
        className="pointer-events-none absolute inset-0 z-30"
        data-player-hud-direction={backward ? "backward" : "forward"}
        data-player-hud-variant={hud.variant}
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
    if (mobileInteraction) return null;
    const Icon = hud.direction < 0 ? icons.speedDecrease : icons.speedIncrease;
    const durationStyle = {
      "--video-player-playback-feedback-duration": `${PLAYER_FEEDBACK_DURATION_MS}ms`,
    } as CSSProperties;

    return (
      <div
        key={hud.id}
        aria-atomic="true"
        aria-live="polite"
        className="pointer-events-none absolute inset-0 z-30"
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
  if (hud.variant === "volume") {
    const level = getVolumeLevel(hud.level ?? 0);
    const bezelStyle = {
      "--video-player-playback-feedback-duration": `${PLAYBACK_BEZEL_DURATION_MS}ms`,
    } as CSSProperties;

    return (
      <div
        key={hud.id}
        aria-atomic="true"
        aria-label={`Volume ${hud.text}`}
        aria-live="polite"
        className="pointer-events-none absolute inset-0 z-30"
        data-player-hud-variant="volume"
        data-player-volume-level={level}
        role="status"
      >
        {/* The level, on a see-through dark pill at the top. */}
        <div
          className="absolute top-[12%] left-1/2 -translate-x-1/2"
          aria-hidden="true"
        >
          <span
            className="flex items-center gap-2 rounded-full bg-black/45 py-1.5 pr-3.5 pl-3 text-base leading-none font-semibold whitespace-nowrap tabular-nums text-white lg:text-lg"
            data-player-volume-text={hud.text}
          >
            <VolumeLevelIcon
              active
              aria-hidden="true"
              className="size-5"
              level={level}
              size={20}
            />
            {hud.text}
          </span>
        </div>
        {/* The speaker in the middle, as play and pause are shown there
            (PlaybackFeedback): same circle, same size, same motion. */}
        <div
          className="absolute inset-0 grid place-items-center"
          aria-hidden="true"
        >
          <span
            className="grid size-12 place-items-center rounded-full border-0 bg-black/40 text-white shadow-none lg:size-15"
            data-playback-feedback-bezel=""
            data-playback-feedback-duration={PLAYBACK_BEZEL_DURATION_MS}
            data-playback-feedback-surface=""
            style={bezelStyle}
          >
            <VolumeLevelIcon
              active
              aria-hidden="true"
              className="size-6 lg:size-7.5"
              data-player-volume-icon={level}
              level={level}
              size={26}
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
