import {
  ArrowLeft,
  CaretRight,
  Gear,
  ListBullets,
  SlidersHorizontal,
  SpeakerHigh,
  Speedometer,
  Subtitles,
} from "@phosphor-icons/react";
import { formatMediaTime } from "../accessibility/formatMediaTime";
import {
  DEFAULT_PLAYBACK_RATES,
  formatPlaybackRate,
  playbackRatesMatch,
} from "../playback/playbackRates";
import { usePlayerController } from "../react/context";
import { usePlayerState } from "../react/usePlayerState";
import { PlayerMenuItem, PopoverMenu } from "./menus";
import { PlaybackRateSlider } from "./PlaybackRateSlider";

export function SettingsMenu() {
  const controller = usePlayerController();
  const { activeChapterId, chapters, media, view } = usePlayerState(
    (snapshot) => ({
      activeChapterId: snapshot.activeChapterId,
      chapters: snapshot.chapters,
      media: snapshot.media,
      view: snapshot.ui.settingsView,
    }),
    (left, right) =>
      left.activeChapterId === right.activeChapterId &&
      left.chapters === right.chapters &&
      left.media === right.media &&
      left.view === right.view,
  );

  const qualityLabel = media.autoQuality
    ? "Auto"
    : (media.qualities.find((item) => item.id === media.selectedQualityId)
        ?.label ?? "Auto");
  const captionLabel =
    media.textTracks.find((item) => item.id === media.selectedTextTrackId)
      ?.label ?? "Off";
  const audioLabel =
    media.audioTracks.find((item) => item.id === media.selectedAudioTrackId)
      ?.label ??
    media.audioTracks[0]?.label ??
    "Default";

  const openView = (next: typeof view) => controller.setSettingsView(next);

  return (
    <PopoverMenu
      label="Settings"
      menuLabel="Video settings"
      align="end"
      side="top"
      triggerClassName="player-control !size-9 !min-h-0 !border-0 !bg-transparent !p-0 hover:!bg-white/12"
      open={view !== "closed"}
      onOpenChange={(open) => openView(open ? "main" : "closed")}
      trigger={<Gear size={22} />}
    >
      {({ close }) => (
        <div className="min-w-60">
          {view !== "main" ? (
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="mb-1 flex min-h-10 w-full items-center gap-2 border-b border-white/10 px-3 pb-2 text-left text-sm font-semibold text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
              onClick={() => openView("main")}
            >
              <ArrowLeft size={18} />
              {view === "playback-rate"
                ? "Playback speed"
                : view === "quality"
                  ? "Quality"
                  : view === "captions"
                    ? "Captions"
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
                leading={<SlidersHorizontal size={19} />}
                trailing={<CaretRight size={17} />}
                onClick={() => openView("quality")}
              />
              <PlayerMenuItem
                data-menu-keep-open=""
                label="Playback speed"
                description={formatPlaybackRate(media.playbackRate)}
                leading={<Speedometer size={19} />}
                trailing={<CaretRight size={17} />}
                onClick={() => openView("playback-rate")}
              />
              <PlayerMenuItem
                data-menu-keep-open=""
                label="Captions"
                description={captionLabel}
                leading={<Subtitles size={19} />}
                trailing={<CaretRight size={17} />}
                onClick={() => openView("captions")}
              />
              {media.audioTracks.length > 1 ? (
                <PlayerMenuItem
                  data-menu-keep-open=""
                  label="Audio"
                  description={audioLabel}
                  leading={<SpeakerHigh size={19} />}
                  trailing={<CaretRight size={17} />}
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
                  leading={<ListBullets size={19} />}
                  trailing={<CaretRight size={17} />}
                  onClick={() => openView("chapters")}
                />
              ) : null}
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
            <>
              <div role="none" className="grid grid-cols-2 gap-1">
                {DEFAULT_PLAYBACK_RATES.map((rate) => (
                  <PlayerMenuItem
                    key={rate}
                    label={rate === 1 ? "Normal" : formatPlaybackRate(rate)}
                    selected={playbackRatesMatch(rate, media.playbackRate)}
                    onClick={() => {
                      controller.setPlaybackRate(rate);
                      close();
                    }}
                  />
                ))}
              </div>
              <PlaybackRateSlider
                playbackRate={media.playbackRate}
                onRateChange={(rate) => controller.setPlaybackRate(rate)}
              />
            </>
          ) : null}

          {view === "captions" ? (
            <>
              <PlayerMenuItem
                label="Off"
                selected={media.selectedTextTrackId === null}
                onClick={() => {
                  controller.selectTextTrack(null);
                  close();
                }}
              />
              {media.textTracks.map((track) => (
                <PlayerMenuItem
                  key={track.id}
                  label={track.label || track.language}
                  description={track.language}
                  selected={track.id === media.selectedTextTrackId}
                  onClick={() => {
                    controller.selectTextTrack(track.id);
                    close();
                  }}
                />
              ))}
            </>
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
