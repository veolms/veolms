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
  const htmlMuted =
    typeof document !== "undefined" &&
    document.documentElement.dataset.playerMuted === "true";
  const silent = muted || volume === 0 || htmlMuted;
  const volumeLevel = silent
    ? "muted"
    : volume < 0.34
      ? "quiet"
      : volume < 0.67
        ? "medium"
        : "high";
  const { icons } = usePlayerTheme();
  const SoundIcon =
    volumeLevel === "quiet"
      ? icons.volumeQuiet
      : volumeLevel === "medium"
        ? icons.volumeMedium
        : icons.volumeHigh;
  const MutedIcon = icons.volumeMuted;

  return (
    <PlayerIconButton
      className={className}
      data-volume-level={volumeLevel}
      label={silent ? "Unmute" : "Mute"}
      icon={
        <>
          <span
            className={silent ? "hidden" : "contents"}
            data-mute-icon="sound"
          >
            <SoundIcon size={iconSize} active={false} />
          </span>
          <span
            className={silent ? "contents" : "hidden"}
            data-mute-icon="muted"
          >
            <MutedIcon size={iconSize} active />
          </span>
        </>
      }
      pressed={silent}
      onClick={() => controller.toggleMuted()}
    />
  );
}
