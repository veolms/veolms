import {
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { usePlayerController } from "../react/context";
import { useVolume } from "../react/usePlayerState";
import { classNames } from "../utils/classNames";
import { MuteButton } from "./MuteButton";

const VOLUME_WHEEL_STEP = 0.05;

export interface VolumeControlProps {
  className?: string;
  collapsible?: boolean;
  muteButtonClassName?: string;
}

export function VolumeControl({
  className,
  collapsible = false,
  muteButtonClassName,
}: VolumeControlProps = {}) {
  const controller = usePlayerController();
  const { muted, volume } = useVolume();
  const groupRef = useRef<HTMLDivElement>(null);
  const setVolumeFromPointer = (event: PointerEvent<HTMLInputElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0) return;
    controller.setVolume(
      Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    );
  };

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    const changeVolumeFromWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      event.preventDefault();
      event.stopPropagation();

      const displayedVolume = muted ? 0 : volume;
      const direction = event.deltaY < 0 ? 1 : -1;
      const nextVolume =
        Math.round(
          Math.max(
            0,
            Math.min(1, displayedVolume + direction * VOLUME_WHEEL_STEP),
          ) * 100,
        ) / 100;
      if (nextVolume !== displayedVolume) controller.setVolume(nextVolume);
    };

    group.addEventListener("wheel", changeVolumeFromWheel, { passive: false });
    return () => group.removeEventListener("wheel", changeVolumeFromWheel);
  }, [controller, muted, volume]);

  return (
    <div
      ref={groupRef}
      className={classNames(
        "player-volume-group flex items-center",
        collapsible &&
          "group/volume w-10 shrink-0 overflow-hidden transition-[width,background-color,box-shadow] duration-200 ease-out hover:w-31 focus-within:w-31",
        className,
      )}
      data-player-control=""
    >
      <MuteButton className={muteButtonClassName} />
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        aria-label="Volume"
        aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)} percent`}
        className={classNames(
          "player-volume-slider h-9 cursor-pointer accent-(--video-player-control-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--video-player-control-text)",
          collapsible
            ? "m-0 w-0 p-0 opacity-0 transition-[width,margin,opacity] duration-200 ease-out group-hover/volume:ml-1 group-hover/volume:mr-2 group-hover/volume:w-18 group-hover/volume:opacity-100 group-focus-within/volume:ml-1 group-focus-within/volume:mr-2 group-focus-within/volume:w-18 group-focus-within/volume:opacity-100"
            : "w-18",
        )}
        style={
          {
            "--video-player-volume": `${(muted ? 0 : volume) * 100}%`,
          } as CSSProperties
        }
        onChange={(event) =>
          controller.setVolume(event.currentTarget.valueAsNumber)
        }
        onPointerDown={setVolumeFromPointer}
      />
    </div>
  );
}
