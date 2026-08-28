import { CornersIn, CornersOut } from "@phosphor-icons/react";
import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";
import { PlayerIconButton } from "./PlayerIconButton";

export function FullscreenButton() {
  const controller = usePlayerController();
  const fullscreen = usePlayerState(({ ui }) => ui.fullscreen);
  return (
    <PlayerIconButton
      label="Toggle fullscreen"
      title={fullscreen ? "Exit fullscreen (F)" : "Enter fullscreen (F)"}
      pressed={fullscreen}
      icon={fullscreen ? <CornersIn size={22} /> : <CornersOut size={22} />}
      onClick={() => void controller.toggleFullscreen()}
    />
  );
}
