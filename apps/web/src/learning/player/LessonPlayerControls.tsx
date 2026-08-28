import { Sparkle } from "@phosphor-icons/react";
import { DefaultControls, PlayerIconButton } from "@veolms/video-player";

export interface LessonPlayerControlsProps {
  ambientEnabled: boolean;
  onAmbientEnabledChange: (enabled: boolean) => void;
  onTheaterToggle: () => void;
}

export function LessonPlayerControls({
  ambientEnabled,
  onAmbientEnabledChange,
  onTheaterToggle,
}: LessonPlayerControlsProps) {
  return (
    <DefaultControls
      onToggleTheater={onTheaterToggle}
      trailingControls={
        <PlayerIconButton
          label={
            ambientEnabled ? "Disable ambient mode" : "Enable ambient mode"
          }
          title="Ambient mode"
          pressed={ambientEnabled}
          icon={<Sparkle size={22} />}
          onClick={() => onAmbientEnabledChange(!ambientEnabled)}
        />
      }
    />
  );
}
