import { SpeakerHigh } from "@phosphor-icons/react";

import { usePlayerController } from "../../react/context";
import { useTracks } from "../../react/usePlayerState";
import { MenuTriggerContent } from "./MenuTriggerContent";
import { PlayerMenuItem } from "./PlayerMenuItem";
import { PopoverMenu } from "./PopoverMenu";
import type { PlayerMenuCommonProps } from "./menuTypes";

export interface AudioTrackMenuProps extends PlayerMenuCommonProps {
  onAudioTrackChange?: (trackId: string) => void;
}

export function AudioTrackMenu({
  align,
  className,
  defaultOpen,
  disabled,
  onAudioTrackChange,
  onOpenChange,
  open,
  panelClassName,
  side,
  trigger,
  triggerClassName,
}: AudioTrackMenuProps) {
  const controller = usePlayerController();
  const { audioTracks, selectedAudioTrackId } = useTracks();
  const activeTrack =
    audioTracks.find((track) => track.id === selectedAudioTrackId) ??
    audioTracks.find((track) => track.active);
  const currentLabel = activeTrack?.label || activeTrack?.language || "Audio";

  return (
    <PopoverMenu
      label={`Audio track, ${currentLabel}`}
      menuLabel="Audio tracks"
      trigger={
        trigger ?? (
          <MenuTriggerContent
            icon={<SpeakerHigh className="size-4" />}
            value={currentLabel}
          />
        )
      }
      className={className}
      triggerClassName={triggerClassName}
      panelClassName={panelClassName}
      side={side}
      align={align}
      disabled={disabled || audioTracks.length === 0}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      {audioTracks.map((track) => (
        <PlayerMenuItem
          key={track.id}
          label={track.label || track.language || "Audio track"}
          description={formatAudioDescription(track)}
          selected={
            track.id === selectedAudioTrackId ||
            (!selectedAudioTrackId && track.active)
          }
          onClick={() => {
            controller.selectAudioTrack(track.id);
            onAudioTrackChange?.(track.id);
          }}
        />
      ))}
    </PopoverMenu>
  );
}

function formatAudioDescription(track: {
  language: string;
  roles: readonly string[];
  channelsCount?: number;
}): string | undefined {
  const parts = [track.language, ...track.roles];
  if (track.channelsCount) parts.push(`${track.channelsCount} channels`);
  const uniqueParts = Array.from(new Set(parts.filter(Boolean)));
  return uniqueParts.length > 0 ? uniqueParts.join(" · ") : undefined;
}
