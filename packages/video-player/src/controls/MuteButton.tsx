import {
  SpeakerHigh,
  SpeakerLow,
  SpeakerNone,
  SpeakerX,
} from "@phosphor-icons/react";
import { usePlayerController } from "../react/context";
import { useVolume } from "../react/usePlayerState";
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
  const icon = silent ? (
    <SpeakerX size={iconSize} weight="fill" />
  ) : volumeLevel === "quiet" ? (
    <SpeakerNone size={iconSize} weight="fill" />
  ) : volumeLevel === "medium" ? (
    <SpeakerLow size={iconSize} weight="fill" />
  ) : (
    <SpeakerHigh size={iconSize} weight="fill" />
  );

  return (
    <PlayerIconButton
      className={className}
      data-volume-level={volumeLevel}
      label={silent ? "Unmute" : "Mute"}
      icon={icon}
      pressed={silent}
      onClick={() => controller.toggleMuted()}
    />
  );
}
