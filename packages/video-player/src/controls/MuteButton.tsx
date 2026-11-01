import { usePlayerController } from "../react/context";
import { useVolume } from "../react/usePlayerState";
import { usePlayerTheme } from "../themes/PlayerThemeContext";
import { PlayerIconButton } from "./PlayerIconButton";
import { VolumeLevelIcon, getVolumeLevel } from "./VolumeLevelIcon";

export interface MuteButtonProps {
  className?: string;
  iconSize?: number;
  /** Replaces what a press does (muting or unmuting). */
  onPress?: () => void;
  /** Replaces the label, for a press that does something else. */
  label?: string;
}

export function MuteButton({
  className,
  iconSize = 24,
  onPress,
  label,
}: MuteButtonProps) {
  const controller = usePlayerController();
  const { muted, volume } = useVolume();
  const silent = muted || volume === 0;
  const volumeLevel = getVolumeLevel(volume, muted);
  const { icons } = usePlayerTheme();
  const MutedIcon = icons.volumeMuted;

  return (
    <PlayerIconButton
      className={className}
      data-volume-level={volumeLevel}
      label={label ?? (silent ? "Unmute" : "Mute")}
      icon={
        <>
          <span
            className={silent ? "hidden" : "contents"}
            data-mute-icon="sound"
          >
            {/* As many waves as the volume (`high` for a video that is
                silent only because it is muted). */}
            <VolumeLevelIcon
              level={volumeLevel === "muted" ? "high" : volumeLevel}
              size={iconSize}
              active={false}
            />
          </span>
          <span
            className={silent ? "contents" : "hidden"}
            data-mute-icon="muted"
          >
            <MutedIcon size={iconSize} active />
          </span>
        </>
      }
      pressed={onPress ? undefined : silent}
      onClick={onPress ?? (() => controller.toggleMuted())}
    />
  );
}
