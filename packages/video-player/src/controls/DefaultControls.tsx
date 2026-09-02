import type { ReactNode } from "react";
import { usePlayerState } from "../react/usePlayerState";
import { Timeline } from "../timeline/Timeline";
import { FullscreenButton } from "./FullscreenButton";
import { PictureInPictureButton } from "./PictureInPictureButton";
import { PlayButton } from "./PlayButton";
import { SettingsMenu } from "./SettingsMenu";
import { TheaterButton } from "./TheaterButton";
import { TimeDisplay } from "./TimeDisplay";
import { VolumeControl } from "./VolumeControl";
import { ZoomLevelIndicator } from "./ZoomLevelIndicator";
import { usePlayerMobileInteraction } from "../react/PlayerInteractionMode";

export interface DefaultControlsProps {
  onToggleTheater?: () => void;
  leadingControls?: ReactNode;
  trailingControls?: ReactNode;
  pictureInPicturePlacement?: "settings" | "toolbar";
  settingsMobilePresentation?: "popover" | "sheet";
}

export function DefaultControls({
  leadingControls,
  onToggleTheater,
  pictureInPicturePlacement = "toolbar",
  settingsMobilePresentation = "popover",
  trailingControls,
}: DefaultControlsProps) {
  const controlsVisible = usePlayerState(({ ui }) => ui.controlsVisible);
  const mobileInteraction = usePlayerMobileInteraction();

  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-2 pb-2 pt-14 text-white transition-opacity duration-200 motion-reduce:transition-none sm:px-3 sm:pb-3 ${
        mobileInteraction ? "!px-2 !pb-2" : ""
      } ${
        controlsVisible
          ? "visible opacity-100"
          : "invisible pointer-events-none opacity-0"
      }`}
      data-video-player-controls=""
      data-video-player-control-layer=""
      aria-hidden={!controlsVisible}
      inert={controlsVisible ? undefined : true}
    >
      <Timeline />
      <div
        className={`flex min-w-0 items-center gap-0.5 sm:gap-1 ${mobileInteraction ? "!gap-0.5" : ""}`}
      >
        {leadingControls}
        <PlayButton />
        <VolumeControl />
        <TimeDisplay />
        <span className="min-w-0 flex-1" />
        {trailingControls}
        <ZoomLevelIndicator />
        <SettingsMenu
          includePictureInPicture={pictureInPicturePlacement === "settings"}
          mobilePresentation={settingsMobilePresentation}
        />
        {pictureInPicturePlacement === "toolbar" ? (
          <PictureInPictureButton />
        ) : null}
        {onToggleTheater ? <TheaterButton onToggle={onToggleTheater} /> : null}
        <FullscreenButton />
      </div>
    </div>
  );
}
