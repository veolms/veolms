import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";
import { usePlayerTheme } from "../themes/PlayerThemeContext";
import { PlayerIconButton } from "./PlayerIconButton";

export interface FullscreenButtonProps {
  className?: string;
  iconContainerClassName?: string;
  iconSize?: number;
}

export function FullscreenButton({
  className,
  iconContainerClassName,
  iconSize = 22,
}: FullscreenButtonProps = {}) {
  const controller = usePlayerController();
  const fullscreen = usePlayerState(({ ui }) => ui.fullscreen);
  const { icons } = usePlayerTheme();
  const Icon = fullscreen ? icons.fullscreenExit : icons.fullscreenEnter;
  const icon = (
    <Icon
      size={iconSize}
      active={fullscreen}
      style={{ transform: "rotate(90deg)" }}
    />
  );
  return (
    <PlayerIconButton
      label="Toggle fullscreen"
      className={className}
      title={fullscreen ? "Exit fullscreen (F)" : "Enter fullscreen (F)"}
      pressed={fullscreen}
      icon={
        iconContainerClassName ? (
          <span
            className={iconContainerClassName}
            data-fullscreen-visual-surface=""
          >
            {icon}
          </span>
        ) : (
          icon
        )
      }
      onClick={() => void controller.toggleFullscreen()}
    />
  );
}
