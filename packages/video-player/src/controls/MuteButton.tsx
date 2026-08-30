import { usePlayerController } from "../react/context";
import { useVolume } from "../react/usePlayerState";
import { usePlayerTheme } from "../themes/PlayerThemeContext";
import { PlayerIconButton } from "./PlayerIconButton";

export interface MuteButtonProps {
  className?: string;
  iconSize?: number;
}

export function MuteButton({ className, iconSize = 24 }: MuteButtonProps) {
  const controller = usePlayerController();
  const { muted, volume } = useVolume();
  const silent = muted || volume === 0;
  const volumeLevel = silent
    ? "muted"
    : volume < 0.34
      ? "quiet"
      : volume < 0.67
        ? "medium"
        : "high";
  const { icons } = usePlayerTheme();
  const Icon = silent
    ? icons.volumeMuted
    : volumeLevel === "quiet"
      ? icons.volumeQuiet
      : volumeLevel === "medium"
        ? icons.volumeMedium
        : icons.volumeHigh;

  return (
    <PlayerIconButton
      className={className}
      data-volume-level={volumeLevel}
      label={silent ? "Unmute" : "Mute"}
      icon={<Icon size={iconSize} active={silent} />}
      pressed={silent}
      onClick={() => controller.toggleMuted()}
    />
  );
}
