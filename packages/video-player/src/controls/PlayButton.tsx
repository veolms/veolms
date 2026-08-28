import { Pause, Play } from "@phosphor-icons/react";
import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";
import { PlayerIconButton } from "./PlayerIconButton";

export interface PlayButtonProps {
  className?: string;
  iconSize?: number;
}

export function PlayButton({ className, iconSize = 22 }: PlayButtonProps) {
  const controller = usePlayerController();
  const paused = usePlayerState(({ media }) => media.paused || media.ended);
  const label = paused ? "Play" : "Pause";

  return (
    <PlayerIconButton
      className={className}
      label={label}
      icon={
        paused ? (
          <Play size={iconSize} weight="fill" />
        ) : (
          <Pause size={iconSize} weight="fill" />
        )
      }
      onClick={() => void controller.togglePlayback().catch(() => undefined)}
    />
  );
}
