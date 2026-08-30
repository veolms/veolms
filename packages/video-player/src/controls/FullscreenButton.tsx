import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";
import { usePlayerTheme } from "../themes/PlayerThemeContext";
import { PlayerIconButton } from "./PlayerIconButton";

export interface FullscreenButtonProps {
  className?: string;
  iconSize?: number;
}

export function FullscreenButton({
  className,
  iconSize = 22,
}: FullscreenButtonProps = {}) {
  const controller = usePlayerController();
  const fullscreen = usePlayerState(({ ui }) => ui.fullscreen);
  const { icons } = usePlayerTheme();
  const Icon = fullscreen ? icons.fullscreenExit : icons.fullscreenEnter;
  return (
    <PlayerIconButton
      label="Toggle fullscreen"
      className={className}
      title={fullscreen ? "Exit fullscreen (F)" : "Enter fullscreen (F)"}
      pressed={fullscreen}
      icon={
        <Icon
          size={iconSize}
          active={fullscreen}
          style={{ transform: "rotate(90deg)" }}
        />
      }
      onClick={() => void controller.toggleFullscreen()}
    />
  );
}
