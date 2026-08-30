import { ArrowsInSimple, ArrowsOutSimple } from "@phosphor-icons/react";
import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";
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
  return (
    <PlayerIconButton
      label="Toggle fullscreen"
      className={className}
      title={fullscreen ? "Exit fullscreen (F)" : "Enter fullscreen (F)"}
      pressed={fullscreen}
      icon={
        fullscreen ? (
          <ArrowsInSimple
            size={iconSize}
            weight="bold"
            style={{ transform: "rotate(90deg)" }}
          />
        ) : (
          <ArrowsOutSimple
            size={iconSize}
            weight="bold"
            style={{ transform: "rotate(90deg)" }}
          />
        )
      }
      onClick={() => void controller.toggleFullscreen()}
    />
  );
}
