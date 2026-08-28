import type { CSSProperties } from "react";
import { usePlayerController } from "../react/context";
import { useVolume } from "../react/usePlayerState";
import { MuteButton } from "./MuteButton";

export function VolumeControl() {
  const controller = usePlayerController();
  const { muted, volume } = useVolume();

  return (
    <div className="player-volume-group flex items-center" data-player-control="">
      <MuteButton />
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        aria-label="Volume"
        aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)} percent`}
        className="player-volume-slider h-1.5 w-18 cursor-pointer accent-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        style={{
          "--video-player-volume": `${(muted ? 0 : volume) * 100}%`,
        } as CSSProperties}
        onChange={(event) => controller.setVolume(event.currentTarget.valueAsNumber)}
      />
    </div>
  );
}
