import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type VideoHTMLAttributes,
} from "react";
import type { ChapterInput } from "../chapters/chapterTypes";
import { BufferingIndicator } from "../controls/BufferingIndicator";
import { CentralPlayButton } from "../controls/CentralPlayButton";
import { DefaultControls } from "../controls/DefaultControls";
import { ErrorOverlay } from "../controls/ErrorOverlay";
import { PlayerGestureSurface } from "../controls/PlayerGestureSurface";
import { PlayerHud } from "../controls/PlayerHud";
import type { VideoEngine } from "../core/VideoEngine";
import type { VideoSource } from "../core/types";
import { NativeVideoEngine } from "../engines/native/NativeVideoEngine";
import { ShakaVideoEngine } from "../engines/shaka/ShakaVideoEngine";
import type { PlayerShortcutOverrides } from "../keyboard";
import type {
  StoryboardLoader,
  StoryboardSource,
} from "./PlayerMetadataBridge";
import { PlayerBehaviorBridge } from "./PlayerBehaviorBridge";
import { PlayerMedia, type PlayerMediaProps } from "./PlayerMedia";
import { PlayerMetadataBridge } from "./PlayerMetadataBridge";
import { PlayerRoot, type VideoPlayerHandle } from "./PlayerRoot";
import type {
  VideoPlayerEvent,
  VideoPlayerEventListener,
} from "./playerEvents";
import { classNames } from "../utils/classNames";
import type { TimelineMarker } from "../timeline/timelineMath";
import type { PlayerTheme } from "../themes/playerThemes";

export interface VideoPlayerProgress {
  currentTime: number;
  duration: number;
  progress: number;
}

export type VideoPlayerEngine = "shaka" | "native";
export type VideoPlayerEmptyTapBehavior = "toggle-controls" | "toggle-playback";

export interface VideoPlayerProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "onError" | "onProgress"
> {
  source: VideoSource;
  engine?: VideoPlayerEngine;
  engineFactory?: () => VideoEngine;
  autoPlay?: boolean;
  poster?: string;
  mediaProps?: Omit<PlayerMediaProps, "poster">;
  chapters?: readonly ChapterInput[];
  manualChapters?: readonly ChapterInput[];
  description?: string;
  storyboard?: StoryboardSource;
  storyboardLoader?: StoryboardLoader;
  markers?: readonly TimelineMarker[];
  controls?: ReactNode | false;
  /** Replaces the default central play affordance. Pass false to omit it. */
  centralControl?: ReactNode | false;
  overlays?: ReactNode;
  keyboardEnabled?: boolean;
  shortcuts?: PlayerShortcutOverrides;
  /** Seconds used by Left/Right arrow keys and double-tap seeking. */
  seekIntervalSeconds?: number;
  /** Action performed by a single pointer tap on empty video space. */
  emptyTapBehavior?: VideoPlayerEmptyTapBehavior;
  controlsIdleDelay?: number;
  theaterMode?: boolean;
  onTheaterModeChange?: (active: boolean) => void;
  onProgress?: (progress: VideoPlayerProgress) => void;
  /** Compatibility callback for applications that persist a percentage. */
  onProgressChange?: (progress: number) => void;
  onReady?: (duration: number) => void;
  onPlayerError?: (error: Error) => void;
  onEvent?: VideoPlayerEventListener;
  onStoryboardError?: (error: unknown) => void;
  accentColor?: string;
  /** Built-in theme id or a custom package-level theme definition. */
  theme?: PlayerTheme;
  playerClassName?: string;
  mediaClassName?: string;
  ariaLabel?: string;
  lockLandscapeOnFullscreen?: boolean;
}

interface ScreenOrientationWithLock {
  lock?: (orientation: "landscape") => Promise<void>;
  unlock?: () => void;
}

interface WebkitFullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
}

function currentFullscreenElement(): Element | null {
  if (typeof document === "undefined") return null;
  return (
    document.fullscreenElement ??
    (document as WebkitFullscreenDocument).webkitFullscreenElement ??
    null
  );
}

function createEngineFactory(engine: VideoPlayerEngine): () => VideoEngine {
  return engine === "native"
    ? () => new NativeVideoEngine()
    : () => new ShakaVideoEngine();
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer(
    {
      accentColor,
      ariaLabel = "Video player",
      autoPlay = false,
      chapters,
      centralControl,
      className,
      controls,
      controlsIdleDelay,
      description,
      engine = "shaka",
      engineFactory,
      emptyTapBehavior = "toggle-playback",
      keyboardEnabled = true,
      lockLandscapeOnFullscreen = false,
      manualChapters,
      markers = [],
      mediaClassName,
      mediaProps,
      onEvent,
      onPlayerError,
      onProgress,
      onProgressChange,
      onReady,
      onStoryboardError,
      onTheaterModeChange,
      overlays,
      playerClassName,
      poster,
      seekIntervalSeconds = 10,
      shortcuts,
      source,
      storyboard,
      storyboardLoader,
      style,
      theaterMode = false,
      theme = "youtube",
      ...outerProps
    },
    ref,
  ) {
    const playerRootRef = useRef<HTMLDivElement | null>(null);
    const presentationContainerRef = useRef<HTMLDivElement | null>(null);
    const orientationLockGenerationRef = useRef(0);
    const orientationLockOwnedRef = useRef(false);
    const resolvedEngineFactory = useMemo(
      () => engineFactory ?? createEngineFactory(engine),
      [engine, engineFactory],
    );
    const handleToggleTheater = useCallback(() => {
      onTheaterModeChange?.(!theaterMode);
    }, [onTheaterModeChange, theaterMode]);

    const releaseOrientationLock = useCallback(() => {
      orientationLockGenerationRef.current += 1;
      if (!orientationLockOwnedRef.current || typeof screen === "undefined") {
        return;
      }
      orientationLockOwnedRef.current = false;
      (screen.orientation as unknown as ScreenOrientationWithLock).unlock?.();
    }, []);

    const syncOrientationForFullscreen = useCallback(
      (active: boolean) => {
        if (!lockLandscapeOnFullscreen || typeof screen === "undefined") return;
        if (!active) {
          releaseOrientationLock();
          return;
        }

        const orientation =
          screen.orientation as unknown as ScreenOrientationWithLock;
        const portraitViewport =
          typeof window !== "undefined" &&
          window.innerHeight > window.innerWidth;
        if (!portraitViewport || !orientation.lock) return;

        const generation = orientationLockGenerationRef.current + 1;
        orientationLockGenerationRef.current = generation;
        void orientation
          .lock("landscape")
          .then(() => {
            const stillOwnsRequest =
              generation === orientationLockGenerationRef.current;
            const stillFullscreen =
              currentFullscreenElement() === presentationContainerRef.current;
            if (stillOwnsRequest && stillFullscreen) {
              orientationLockOwnedRef.current = true;
              return;
            }
            orientation.unlock?.();
          })
          .catch(() => undefined);
      },
      [lockLandscapeOnFullscreen, releaseOrientationLock],
    );

    useEffect(() => releaseOrientationLock, [releaseOrientationLock]);

    const handleEvent = useCallback(
      (event: VideoPlayerEvent) => {
        onEvent?.(event);
        if (event.type === "timeupdate") {
          const duration = event.detail.duration;
          const progress =
            duration > 0 ? (event.detail.currentTime / duration) * 100 : 0;
          const detail = {
            currentTime: event.detail.currentTime,
            duration,
            progress,
          };
          onProgress?.(detail);
          onProgressChange?.(progress);
        } else if (event.type === "loaded") {
          onReady?.(event.detail.duration);
        } else if (event.type === "error") {
          onPlayerError?.(event.detail.error);
        } else if (
          event.type === "fullscreenchange" &&
          lockLandscapeOnFullscreen
        ) {
          syncOrientationForFullscreen(event.detail.active);
        }
      },
      [
        lockLandscapeOnFullscreen,
        onEvent,
        onPlayerError,
        onProgress,
        onProgressChange,
        onReady,
        syncOrientationForFullscreen,
      ],
    );

    const rootStyle = {
      ...style,
      ...(accentColor ? { "--video-player-accent": accentColor } : undefined),
    } as CSSProperties;
    const playerThemeStyle = accentColor
      ? ({ "--video-player-accent": accentColor } as CSSProperties)
      : undefined;
    const resolvedPoster = poster ?? source.metadata?.poster;

    return (
      <div
        {...outerProps}
        ref={presentationContainerRef}
        className={classNames(
          "video-shell relative isolate w-full",
          theaterMode && "video-shell--theater",
          className,
        )}
        style={rootStyle}
      >
        <PlayerRoot
          ref={ref}
          containerRef={playerRootRef}
          presentationContainerRef={presentationContainerRef}
          source={source}
          autoPlay={autoPlay}
          engineFactory={resolvedEngineFactory}
          markers={markers}
          theaterMode={theaterMode}
          onEvent={handleEvent}
          theme={theme}
          style={playerThemeStyle}
          role="region"
          aria-label={ariaLabel}
          tabIndex={0}
          className={classNames(
            "youtube-player group relative z-10 aspect-video w-full overflow-hidden rounded-xl bg-black shadow-[0_18px_50px_rgba(0,0,0,.22)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--video-player-accent,#ff7a1a)]",
            theaterMode &&
              "lg:h-[calc(100vh-94px)] lg:min-h-105 lg:aspect-auto",
            playerClassName,
          )}
        >
          <PlayerBehaviorBridge
            rootRef={playerRootRef}
            shortcuts={shortcuts}
            keyboardEnabled={keyboardEnabled}
            controlsIdleDelay={controlsIdleDelay}
            seekIntervalSeconds={seekIntervalSeconds}
            onToggleTheater={
              onTheaterModeChange ? handleToggleTheater : undefined
            }
          />
          <PlayerMetadataBridge
            chapters={chapters}
            manualChapters={manualChapters}
            description={description}
            storyboard={storyboard}
            storyboardLoader={storyboardLoader}
            onStoryboardError={onStoryboardError}
          />
          <PlayerMedia
            {...mediaProps}
            poster={resolvedPoster}
            playsInline={mediaProps?.playsInline ?? true}
            className={classNames(
              "pointer-events-none size-full bg-black object-contain",
              mediaProps?.className,
              mediaClassName,
            )}
          />
          <PlayerGestureSurface
            emptyTapBehavior={emptyTapBehavior}
            seekIntervalSeconds={seekIntervalSeconds}
          />
          {overlays}
          {centralControl === false
            ? null
            : (centralControl ?? <CentralPlayButton />)}
          <BufferingIndicator />
          <PlayerHud />
          <ErrorOverlay />
          {controls === false
            ? null
            : (controls ?? (
                <DefaultControls
                  onToggleTheater={
                    onTheaterModeChange ? handleToggleTheater : undefined
                  }
                />
              ))}
        </PlayerRoot>
      </div>
    );
  },
);
