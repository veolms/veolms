import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";
import { usePlayerTheme } from "../themes/PlayerThemeContext";
import { PlayerIconButton } from "./PlayerIconButton";

export interface PlayButtonProps {
  className?: string;
  iconSize?: number;
}

export function PlayButton({ className, iconSize = 22 }: PlayButtonProps) {
  const controller = usePlayerController();
  const paused = usePlayerState(({ media }) => media.paused || media.ended);
  const { icons } = usePlayerTheme();
  const Icon = paused ? icons.play : icons.pause;
  const label = paused ? "Play" : "Pause";

  return (
    <PlayerIconButton
      className={className}
      label={label}
      icon={<Icon size={iconSize} active />}
      onClick={() => void controller.togglePlayback().catch(() => undefined)}
    />
  );
}
