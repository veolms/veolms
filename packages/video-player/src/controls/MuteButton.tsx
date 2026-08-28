import {
  SpeakerHigh,
  SpeakerLow,
  SpeakerX,
} from "@phosphor-icons/react";
import { usePlayerController } from "../react/context";
import { useVolume } from "../react/usePlayerState";
import { PlayerIconButton } from "./PlayerIconButton";

export interface MuteButtonProps {
  className?: string;
  iconSize?: number;
}

export function MuteButton({ className, iconSize = 22 }: MuteButtonProps) {
  const controller = usePlayerController();
  const { muted, volume } = useVolume();
  const silent = muted || volume === 0;
  const icon = silent ? (
    <SpeakerX size={iconSize} />
  ) : volume < 0.5 ? (
    <SpeakerLow size={iconSize} />
  ) : (
    <SpeakerHigh size={iconSize} />
  );

  return (
    <PlayerIconButton
      className={className}
      label={silent ? "Unmute" : "Mute"}
      icon={icon}
      pressed={silent}
      onClick={() => controller.toggleMuted()}
    />
  );
}
