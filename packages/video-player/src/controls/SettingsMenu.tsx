import type { ReactNode } from "react";
import { formatMediaTime } from "../accessibility/formatMediaTime";
import { formatPlaybackRate } from "../playback/playbackRates";
import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";
import { usePlayerTheme } from "../themes/PlayerThemeContext";
import {
  PlayerMenuItem,
  PopoverMenu,
  type PopoverMenuMobilePresentation,
} from "./menus";
import { PlaybackRateSlider } from "./PlaybackRateSlider";

const SETTINGS_OPEN_TURN_DEGREES = 60;

export interface SettingsMenuProps {
  includePictureInPicture?: boolean;
  mobilePresentation?: PopoverMenuMobilePresentation;
  /** Application-specific settings appended to the main settings view. */
  extraMainItems?: ReactNode;
  triggerClassName?: string;
}

export function SettingsMenu({
  extraMainItems,
  includePictureInPicture = false,
  mobilePresentation = "popover",
  triggerClassName,
}: SettingsMenuProps = {}) {
  const controller = usePlayerController();
  const theme = usePlayerTheme();
  const {
    audio: AudioIcon,
    back: BackIcon,
    chapters: ChaptersIcon,
    disclosure: DisclosureIcon,
    pictureInPicture: PictureInPictureIcon,
    playbackRate: PlaybackRateIcon,
    quality: QualityIcon,
    settings: SettingsIcon,
  } = theme.icons;
  const {
    activeChapterId,
    chapters,
    media,
    pictureInPictureActive,
    pictureInPictureAvailable,
    view,
  } = usePlayerState(
    (snapshot) => ({
      activeChapterId: snapshot.activeChapterId,
      chapters: snapshot.chapters,
      media: snapshot.media,
      pictureInPictureActive: snapshot.ui.pictureInPicture,
      pictureInPictureAvailable: snapshot.capabilities.pictureInPicture,
      view: snapshot.ui.settingsView,
    }),
    (left, right) =>
      left.activeChapterId === right.activeChapterId &&
      left.chapters === right.chapters &&
      left.media === right.media &&
      left.pictureInPictureActive === right.pictureInPictureActive &&
      left.pictureInPictureAvailable === right.pictureInPictureAvailable &&
      left.view === right.view,
  );

  const qualityLabel = media.autoQuality
    ? "Auto"
    : (media.qualities.find((item) => item.id === media.selectedQualityId)
        ?.label ?? "Auto");
  const audioLabel =
    media.audioTracks.find((item) => item.id === media.selectedAudioTrackId)
      ?.label ??
    media.audioTracks[0]?.label ??
    "Default";

  const openView = (next: typeof view) => controller.setSettingsView(next);
  const settingsOpen = view !== "closed";
  const triggerAppearanceClass =
    triggerClassName ?? "!h-9 !bg-transparent !px-3 hover:!bg-white/12";

  return (
    <PopoverMenu
      label="Settings"
      menuLabel="Video settings"
      mobilePresentation={mobilePresentation}
      align="end"
      side="top"
      panelClassName="!backdrop-blur-none"
      triggerClassName={`player-control !w-auto !min-h-0 !border-0 !py-0 ${triggerAppearanceClass}`}
      open={settingsOpen}
      onOpenChange={(open) => openView(open ? "main" : "closed")}
      trigger={
        <SettingsIcon
          data-settings-icon={theme.id === "youtube" ? "gear-six" : theme.id}
          data-settings-icon-state={settingsOpen ? "open" : "closed"}
          size={22}
          className="origin-center transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] max-sm:size-5 motion-reduce:transition-none"
          style={{
            transform: `rotate(${theme.motion.settingsClosedRotation + (settingsOpen ? SETTINGS_OPEN_TURN_DEGREES : 0)}deg)`,
          }}
          active={settingsOpen}
        />
      }
    >
      {({ close }) => (
        <div
          className={`[&_button]:min-h-11 sm:[&_button]:min-h-10 ${
            view === "playback-rate" ? "min-w-72" : "min-w-60"
          }`}
        >
          {view !== "main" ? (
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              data-menu-keep-open=""
              data-video-player-settings-back=""
              className="-mx-2 mb-1 flex min-h-10 w-[calc(100%+1rem)] items-center gap-2 rounded-none border-b border-[color-mix(in_srgb,var(--video-player-menu-text,#fff)_10%,transparent)] px-5 pb-2 text-left text-sm font-semibold text-(--video-player-menu-text) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--video-player-menu-text) sm:-mx-1.5 sm:w-[calc(100%+0.75rem)] sm:px-4.5"
              onClick={() => openView("main")}
            >
              <BackIcon size={18} />
              {view === "playback-rate"
                ? "Playback speed"
                : view === "quality"
                  ? "Quality"
                  : view === "audio"
                    ? "Audio"
                    : "Chapters"}
            </button>
          ) : null}

          {view === "main" ? (
            <>
              <PlayerMenuItem
                data-menu-keep-open=""
                label="Quality"
                description={qualityLabel}
                leading={<QualityIcon size={19} />}
                trailing={<DisclosureIcon size={17} />}
                onClick={() => openView("quality")}
              />
              <PlayerMenuItem
                data-menu-keep-open=""
                label="Playback speed"
                description={formatPlaybackRate(media.playbackRate)}
                leading={<PlaybackRateIcon size={19} />}
                trailing={<DisclosureIcon size={17} />}
                onClick={() => openView("playback-rate")}
              />
              {media.audioTracks.length > 1 ? (
                <PlayerMenuItem
                  data-menu-keep-open=""
                  label="Audio"
                  description={audioLabel}
                  leading={<AudioIcon size={19} />}
                  trailing={<DisclosureIcon size={17} />}
                  onClick={() => openView("audio")}
                />
              ) : null}
              {chapters.length > 0 ? (
                <PlayerMenuItem
                  data-menu-keep-open=""
                  label="Chapters"
                  description={
                    chapters.find((item) => item.id === activeChapterId)?.title
                  }
                  leading={<ChaptersIcon size={19} />}
                  trailing={<DisclosureIcon size={17} />}
                  onClick={() => openView("chapters")}
                />
              ) : null}
              {includePictureInPicture && pictureInPictureAvailable ? (
                <PlayerMenuItem
                  label={
                    pictureInPictureActive
                      ? "Exit picture in picture"
                      : "Picture in picture"
                  }
                  description={
                    pictureInPictureActive
                      ? "Playing above other apps"
                      : "Play above other apps"
                  }
                  leading={
                    <PictureInPictureIcon
                      size={19}
                      active={pictureInPictureActive}
                    />
                  }
                  onClick={() => {
                    void controller.togglePictureInPicture();
                    close();
                  }}
                />
              ) : null}
              {extraMainItems}
            </>
          ) : null}

          {view === "quality" ? (
            <>
              <PlayerMenuItem
                label="Auto"
                selected={media.autoQuality}
                onClick={() => {
                  controller.selectQuality(null);
                  close();
                }}
              />
              {media.qualities
                .filter(
                  (quality, index, qualities) =>
                    qualities.findIndex(
                      (candidate) => candidate.label === quality.label,
                    ) === index,
                )
                .sort((left, right) => (right.height ?? 0) - (left.height ?? 0))
                .map((quality) => (
                  <PlayerMenuItem
                    key={quality.id}
                    label={quality.label}
                    selected={
                      !media.autoQuality &&
                      quality.id === media.selectedQualityId
                    }
                    onClick={() => {
                      controller.selectQuality(quality.id);
                      close();
                    }}
                  />
                ))}
            </>
          ) : null}

          {view === "playback-rate" ? (
            <PlaybackRateSlider
              playbackRate={media.playbackRate}
              onRateChange={(rate) => controller.setPlaybackRate(rate)}
            />
          ) : null}

          {view === "audio"
            ? media.audioTracks.map((track) => (
                <PlayerMenuItem
                  key={track.id}
                  label={track.label || track.language}
                  description={track.language}
                  selected={track.id === media.selectedAudioTrackId}
                  onClick={() => {
                    controller.selectAudioTrack(track.id);
                    close();
                  }}
                />
              ))
            : null}

          {view === "chapters"
            ? chapters.map((chapter) => (
                <PlayerMenuItem
                  key={chapter.id}
                  label={chapter.title}
                  description={formatMediaTime(chapter.startTime)}
                  selected={chapter.id === activeChapterId}
                  onClick={() => {
                    controller.seekTo(chapter.startTime);
                    close();
                  }}
                />
              ))
            : null}
        </div>
      )}
    </PopoverMenu>
  );
}
