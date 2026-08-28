import { Subtitles } from "@phosphor-icons/react";

import { usePlayerController } from "../../react/context";
import { useTracks } from "../../react/usePlayerState";
import { MenuTriggerContent } from "./MenuTriggerContent";
import { PlayerMenuItem } from "./PlayerMenuItem";
import { PopoverMenu } from "./PopoverMenu";
import type { PlayerMenuCommonProps } from "./menuTypes";

export interface CaptionsMenuProps extends PlayerMenuCommonProps {
  onTextTrackChange?: (trackId: string | null) => void;
}

export function CaptionsMenu({
  align,
  className,
  defaultOpen,
  disabled,
  onOpenChange,
  onTextTrackChange,
  open,
  panelClassName,
  side,
  trigger,
  triggerClassName,
}: CaptionsMenuProps) {
  const controller = usePlayerController();
  const { selectedTextTrackId, textTracks } = useTracks();
  const activeTrack =
    textTracks.find((track) => track.id === selectedTextTrackId) ??
    textTracks.find((track) => track.active);
  const currentLabel = activeTrack?.label || activeTrack?.language || "Off";

  return (
    <PopoverMenu
      label={`Captions, ${currentLabel}`}
      menuLabel="Captions"
      trigger={
        trigger ?? (
          <MenuTriggerContent
            icon={<Subtitles className="size-4" />}
            value={currentLabel}
          />
        )
      }
      className={className}
      triggerClassName={triggerClassName}
      panelClassName={panelClassName}
      side={side}
      align={align}
      disabled={disabled || textTracks.length === 0}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      <PlayerMenuItem
        label="Off"
        selected={!selectedTextTrackId && !activeTrack}
        onClick={() => {
          controller.selectTextTrack(null);
          onTextTrackChange?.(null);
        }}
      />
      {textTracks.map((track) => (
        <PlayerMenuItem
          key={track.id}
          label={track.label || track.language || "Caption track"}
          description={formatCaptionDescription(track)}
          selected={
            track.id === selectedTextTrackId ||
            (!selectedTextTrackId && track.active)
          }
          onClick={() => {
            controller.selectTextTrack(track.id);
            onTextTrackChange?.(track.id);
          }}
        />
      ))}
    </PopoverMenu>
  );
}

function formatCaptionDescription(track: {
  language: string;
  forced?: boolean;
  roles: readonly string[];
}): string | undefined {
  const parts = [track.language, track.forced ? "Forced" : "", ...track.roles];
  const uniqueParts = Array.from(new Set(parts.filter(Boolean)));
  return uniqueParts.length > 0 ? uniqueParts.join(" · ") : undefined;
}
