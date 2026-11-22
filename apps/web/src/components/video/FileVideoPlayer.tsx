import "../../learning/learning-feature.css";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/DownloadSimple";
import {
  ShakaVideoEngine,
  usePlayerState,
  VideoPlayer,
  type VideoSource,
} from "@veolms/video-player";
import { useMemo } from "react";

import { cn } from "../../lib/utils";
import {
  LessonCentralControls,
  LessonPlayerControls,
} from "../../learning/player/LessonPlayerControls";
import { LearningMiniPlayerBufferingIndicator } from "../../learning/player/learningMiniPlayerBufferingIndicator";
import { useLearningPlayerTheme } from "../../learning/player/useLearningPlayerTheme";

export interface FileVideoPlayerProps {
  /** The video file: a chat or support link, an attachment URL, a blob. */
  src: string;
  /** Its type (an MP4 when unknown). */
  mimeType?: string | null;
  /** Its name, for the settings and screen readers. */
  title: string;
  poster?: string;
  autoPlay?: boolean;
  /** Where the download button saves it from; no button without one. */
  downloadUrl?: string | null;
  className?: string;
  /** The player's keys (Space, the arrows); off where a text box beside it
   *  needs them. */
  keyboardEnabled?: boolean;
  /** The file could not be played. */
  onError?: (error: Error) => void;
  /**
   * A stream to play instead of the file at `src` (a protected HLS stream
   * with its segment token, as a course trailer's).
   */
  source?: VideoSource;
}

const SHORTCUTS = {
  seekBackwardLarge: false,
  seekForwardLarge: false,
  toggleTheaterMode: false,
  togglePictureInPicture: false,
} as const;
const noop = () => undefined;
const createEngine = () => new ShakaVideoEngine();

/**
 * A single video file (a chat or support attachment, a video in a post)
 * played by the lesson page's player, with its controls, theme, keys and
 * gestures. What belongs to a course is left out (previous and next,
 * autoplay, the lessons list, ambient mode). The file is handed to the
 * video element as it is, so the browser fetches it in byte ranges as it
 * plays (object storage answers ranges), never all of it at once.
 */
export default function FileVideoPlayer({
  src,
  mimeType,
  title,
  poster,
  autoPlay = false,
  downloadUrl,
  className,
  keyboardEnabled = true,
  onError,
  source: streamSource,
}: FileVideoPlayerProps) {
  const theme = useLearningPlayerTheme();
  const source = useMemo<VideoSource>(
    () =>
      streamSource ?? {
        id: src,
        src,
        kind: "file",
        // A type the browser plays itself: Shaka hands the file to the video
        // element, which reads it in ranges.
        type: mimeType?.startsWith("video/") ? mimeType : "video/mp4",
      },
    [src, mimeType, streamSource],
  );

  return (
    <VideoPlayer
      source={source}
      poster={poster}
      theme={theme}
      engine="shaka"
      engineFactory={createEngine}
      autoPlay={autoPlay}
      keyboardEnabled={keyboardEnabled}
      onPlayerError={onError}
      shortcuts={SHORTCUTS}
      emptyTapBehavior="responsive"
      keepControlsVisibleUntilFirstPlay={!autoPlay}
      ariaLabel={`Video: ${title}`}
      className={cn("size-full", className)}
      playerClassName="!shadow-none"
      centralControl={
        <LessonCentralControls
          showLessonNavigation={false}
          canGoNext={false}
          canGoPrevious={false}
          onGoNext={noop}
          onGoPrevious={noop}
        />
      }
      controls={
        <LessonPlayerControls
          showAutoplayControl={false}
          showLessonNavigation={false}
          showAmbientControl={false}
          settingsPresentation="popover"
          ambientEnabled={false}
          autoplayEnabled={false}
          canGoNext={false}
          canGoPrevious={false}
          lessonTitle={title}
          onAmbientEnabledChange={noop}
          onAutoplayEnabledChange={noop}
          onGoNext={noop}
          onGoPrevious={noop}
        />
      }
      overlays={
        downloadUrl ? (
          <PlayerDownloadButton url={downloadUrl} name={title} />
        ) : null
      }
      bufferingIndicator={<LearningMiniPlayerBufferingIndicator />}
    />
  );
}

/** Download, in the top corner, shown and hidden with the controls. */
function PlayerDownloadButton({ url, name }: { url: string; name: string }) {
  const visible = usePlayerState(({ ui }) => ui.controlsVisible);
  return (
    <a
      href={url}
      download={name}
      aria-label={`Download ${name}`}
      title="Download"
      data-player-control-hit-area="download"
      className={cn(
        "pointer-events-auto absolute top-2 right-2 z-40 inline-flex size-9.5 items-center justify-center rounded-full bg-(--video-player-control-surface) text-(--video-player-control-text) transition-opacity duration-150 hover:bg-(--video-player-control-surface-hover) focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-(--video-player-control-text)",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <DownloadSimple size={19} weight="bold" />
    </a>
  );
}
