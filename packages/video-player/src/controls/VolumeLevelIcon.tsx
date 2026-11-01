import { usePlayerTheme } from "../themes/PlayerThemeContext";
import type { PlayerThemeIconProps } from "../themes/playerThemes";

export type VolumeLevel = "muted" | "quiet" | "medium" | "high";

/**
 * How loud the player is, in the steps its speaker icon draws: no sound,
 * then one, two or three waves in front of the speaker.
 */
export function getVolumeLevel(volume: number, muted = false): VolumeLevel {
  if (muted || volume === 0) return "muted";
  if (volume < 0.34) return "quiet";
  if (volume < 0.67) return "medium";
  return "high";
}

/** The theme's speaker icon for a volume level. */
export function VolumeLevelIcon({
  level,
  ...props
}: PlayerThemeIconProps & { level: VolumeLevel }) {
  const { icons } = usePlayerTheme();
  if (level === "muted") return <icons.volumeMuted {...props} />;
  if (level === "quiet") return <icons.volumeQuiet {...props} />;
  if (level === "medium") return <icons.volumeMedium {...props} />;
  return <icons.volumeHigh {...props} />;
}
