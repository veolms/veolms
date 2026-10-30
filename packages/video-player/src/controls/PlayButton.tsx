import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";
import { usePlayerTheme } from "../themes/PlayerThemeContext";
import { PlayerIconButton } from "./PlayerIconButton";

export interface PlayButtonProps {
  className?: string;
  hideControlsOnPlay?: boolean;
  iconSize?: number;
}

export function PlayButton({
  className,
  hideControlsOnPlay = false,
  iconSize = 22,
}: PlayButtonProps) {
  const controller = usePlayerController();
  const paused = usePlayerState(({ media }) => media.paused || media.ended);
  const ended = usePlayerState(({ media }) => media.ended);
  const { icons } = usePlayerTheme();
  // At the end of the video (the next lesson's countdown is up) the button
  // plays it again from the start, and shows that.
  const Icon = ended ? icons.replay : paused ? icons.play : icons.pause;
  const label = ended ? "Replay" : paused ? "Play" : "Pause";

  const handleClick = async () => {
    const wasPaused = paused;
    try {
      await controller.togglePlayback();
      if (!hideControlsOnPlay) return;
      controller.setControlsVisible(!wasPaused);
    } catch {
      // A rejected play request should leave the controls available for recovery.
      controller.setControlsVisible(true);
    }
  };

  return (
    <PlayerIconButton
      className={className}
      label={label}
      icon={<Icon size={iconSize} active />}
      onClick={() => void handleClick()}
    />
  );
}
