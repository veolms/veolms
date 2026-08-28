import type { ReactNode } from "react";
import { usePlayerState } from "../react/usePlayerState";
import { Timeline } from "../timeline/Timeline";
import { FullscreenButton } from "./FullscreenButton";
import { PictureInPictureButton } from "./PictureInPictureButton";
import { PlayButton } from "./PlayButton";
import { SeekButton } from "./SeekButton";
import { SettingsMenu } from "./SettingsMenu";
import { TheaterButton } from "./TheaterButton";
import { TimeDisplay } from "./TimeDisplay";
import { VolumeControl } from "./VolumeControl";

export interface DefaultControlsProps {
  onToggleTheater?: () => void;
  leadingControls?: ReactNode;
  trailingControls?: ReactNode;
}

export function DefaultControls({
  leadingControls,
  onToggleTheater,
  trailingControls,
}: DefaultControlsProps) {
  const controlsVisible = usePlayerState(({ ui }) => ui.controlsVisible);

  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-2 pb-2 pt-14 text-white transition-opacity duration-200 motion-reduce:transition-none sm:px-3 sm:pb-3 ${
        controlsVisible
          ? "opacity-100"
          : "pointer-events-none opacity-0"
      }`}
      data-video-player-controls=""
      aria-hidden={!controlsVisible}
    >
      <Timeline />
      <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
        {leadingControls}
        <PlayButton />
        <span className="hidden sm:contents">
          <SeekButton seconds={-10} />
          <SeekButton seconds={10} />
        </span>
        <VolumeControl />
        <TimeDisplay />
        <span className="min-w-0 flex-1" />
        {trailingControls}
        <SettingsMenu />
        <PictureInPictureButton />
        {onToggleTheater ? <TheaterButton onToggle={onToggleTheater} /> : null}
        <FullscreenButton />
      </div>
    </div>
  );
}
