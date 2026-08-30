import { Pause, Play } from "@phosphor-icons/react";
import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";

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

  return (
    <button
      type="button"
      aria-label={paused ? "Play video" : "Pause video"}
      data-player-control=""
      className={`absolute inset-0 z-10 m-auto grid size-16 place-items-center self-center rounded-full bg-black/55 text-white shadow-xl backdrop-blur-md transition-[opacity,transform] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none ${
        controlsVisible && paused
          ? "opacity-100"
          : "pointer-events-none scale-90 opacity-0"
      }`}
      onClick={() => void controller.togglePlayback().catch(() => undefined)}
    >
      {paused ? (
        <Play size={31} weight="fill" />
      ) : (
        <Pause size={31} weight="fill" />
      )}
    </button>
  );
}
