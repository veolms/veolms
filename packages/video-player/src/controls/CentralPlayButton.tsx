import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";
import { usePlayerTheme } from "../themes/PlayerThemeContext";

export function CentralPlayButton() {
  const controller = usePlayerController();
  const { controlsVisible, paused } = usePlayerState(
    ({ media, ui }) => ({
      controlsVisible: ui.controlsVisible,
      paused: media.paused || media.ended,
    }),
    (left, right) =>
      left.controlsVisible === right.controlsVisible &&
      left.paused === right.paused,
  );
  const { icons } = usePlayerTheme();
  const Icon = paused ? icons.play : icons.pause;

  return (
    <button
      type="button"
      aria-label={paused ? "Play video" : "Pause video"}
      data-player-control=""
      className={`absolute inset-0 z-10 m-auto grid size-16 place-items-center self-center rounded-full bg-(--video-player-control-surface) text-(--video-player-control-text) shadow-(--video-player-control-shadow) backdrop-blur-md transition-[opacity,transform] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-control-text) motion-reduce:transition-none sm:hidden ${
        controlsVisible && paused
          ? "opacity-100"
          : "pointer-events-none scale-90 opacity-0"
      }`}
      onClick={() => void controller.togglePlayback().catch(() => undefined)}
    >
      <Icon size={31} active />
    </button>
  );
}
