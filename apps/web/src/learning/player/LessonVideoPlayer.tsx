import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  VideoPlayer as VeoVideoPlayer,
  type VideoPlayerEvent,
  type VideoPlayerHandle,
  type VideoEngine,
  type VideoSource,
} from "@veolms/video-player";
import type { CourseVideo } from "../courseContent";
import {
  LEARNING_SEEK_INTERVAL_DEFAULT,
  readLearningPreferences,
} from "../../settings/settingsPreferences";
import { LessonAmbientProjection } from "./LessonAmbientProjection";
import {
  LessonCentralControls,
  LessonPlayerControls,
} from "./LessonPlayerControls";
import type { LearningMiniPlayerRequest } from "./learningMiniPlayerTypes";
import {
  consumeMiniPlayerRestore,
  lessonPlayerStorageKeys,
  readAmbientPreference,
  readMutedPreference,
  readResumePosition,
  writeAmbientPreference,
  writeMutedPreference,
  writeResumePosition,
} from "./lessonPlayerPersistence";
import { useLearningPlayerTheme } from "./useLearningPlayerTheme";

const RESUME_PERSIST_INTERVAL_MS = 5_000;
const LESSON_PLAYER_SHORTCUTS = {
  seekBackwardLarge: false,
  seekForwardLarge: false,
  toggleTheaterMode: false,
} as const;

export interface LessonVideoPlayerProps {
  media: CourseVideo;
  lessonTitle: string;
  theaterMode: boolean;
  onTheaterToggle: () => void;
  autoPlayOnMediaChange?: boolean;
  autoplayEnabled?: boolean;
  canGoNext?: boolean;
  canGoPrevious?: boolean;
  onAutoplayEnabledChange?: (enabled: boolean) => void;
  onGoNext?: () => void;
  onGoPrevious?: () => void;
  onLessonEnded?: () => void;
  onMinimize?: (request: LearningMiniPlayerRequest) => void;
  onProgressChange?: (progress: number) => void;
  resumePersistenceKey?: string;
  /** Engine injection is useful for deterministic integration testing. */
  engineFactory?: () => VideoEngine;
}

export function LessonVideoPlayer({
  autoPlayOnMediaChange = false,
  autoplayEnabled = true,
  canGoNext = false,
  canGoPrevious = false,
  engineFactory,
  lessonTitle,
  media,
  onProgressChange,
  onAutoplayEnabledChange = () => undefined,
  onGoNext = () => undefined,
  onGoPrevious = () => undefined,
  onLessonEnded,
  onMinimize,
  onTheaterToggle,
  resumePersistenceKey,
  theaterMode,
}: LessonVideoPlayerProps) {
  const playerRef = useRef<VideoPlayerHandle>(null);
  const swipeStartRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const latestPositionRef = useRef(0);
  const lastPersistedAtRef = useRef<number | null>(null);
  const preferencesReadyRef = useRef(false);
  const captionsEnabledRef = useRef(false);
  // Keep the server and first client render deterministic, then restore the
  // device preference after hydration just like the legacy lesson player.
  const [muted, setMuted] = useState(false);
  const [ambientEnabled, setAmbientEnabled] = useState(false);
  const [seekIntervalSeconds, setSeekIntervalSeconds] = useState(
    LEARNING_SEEK_INTERVAL_DEFAULT,
  );
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const playerTheme = useLearningPlayerTheme();
  const mediaKey = resumePersistenceKey ?? media.fileName;
  const activeMediaKeyRef = useRef(mediaKey);
  const requestedMediaKeyRef = useRef(mediaKey);
  const restoreAutoplayRef = useRef(consumeMiniPlayerRestore(mediaKey));
  requestedMediaKeyRef.current = mediaKey;

  const source = useMemo<VideoSource>(() => {
    const isHls = /\.m3u8(?:$|[?#])/i.test(media.src);
    return {
      id: mediaKey,
      src: media.src,
      type: isHls ? "application/x-mpegurl" : "video/mp4",
      kind: isHls ? "hls" : "file",
      // The catalog duration can be stale after an asset replacement. Shaka
      // receives the stored position and the loaded event clamps it against
      // the actual media duration before progress is reported.
      startTime: readResumePosition(mediaKey),
      metadata: {
        duration: media.duration,
        title: lessonTitle,
      },
      streaming: isHls ? { abrEnabled: true } : undefined,
      textTracks: [
        {
          src: "/assets/designing-users.vtt",
          language: "en",
          label: "English",
          kind: "captions",
          mimeType: "text/vtt",
        },
      ],
    };
  }, [lessonTitle, media.duration, media.src, mediaKey]);

  const persistResumePosition = useCallback((force = false) => {
    const position = latestPositionRef.current;
    if (!Number.isFinite(position) || position <= 0) return;

    const now = Date.now();
    if (
      !force &&
      lastPersistedAtRef.current !== null &&
      now - lastPersistedAtRef.current < RESUME_PERSIST_INTERVAL_MS
    ) {
      return;
    }

    writeResumePosition(activeMediaKeyRef.current, position);
    lastPersistedAtRef.current = now;
  }, []);

  const handleEvent = useCallback(
    (event: VideoPlayerEvent) => {
      if (event.type === "loaded") {
        const loadedMediaKey = event.detail.source.id;
        if (loadedMediaKey && loadedMediaKey !== requestedMediaKeyRef.current) {
          return;
        }
        activeMediaKeyRef.current =
          loadedMediaKey ?? requestedMediaKeyRef.current;
        const snapshot = playerRef.current?.getSnapshot();
        const actualDuration = event.detail.duration;
        const loadedPosition = snapshot?.media.currentTime ?? 0;
        const clampedPosition =
          actualDuration > 0
            ? Math.min(loadedPosition, Math.max(0, actualDuration - 1))
            : loadedPosition;
        if (clampedPosition !== loadedPosition) {
          playerRef.current?.seekTo(clampedPosition);
        }
        latestPositionRef.current = clampedPosition;
        lastPersistedAtRef.current = null;
        if (clampedPosition > 0 && actualDuration > 0) {
          onProgressChange?.(
            Math.max(
              0,
              Math.min(100, (clampedPosition / actualDuration) * 100),
            ),
          );
        }

        if (captionsEnabledRef.current) {
          const preferredTrack =
            snapshot?.media.textTracks.find(
              (track) => track.language === "en",
            ) ?? snapshot?.media.textTracks[0];
          if (preferredTrack) {
            playerRef.current?.selectTextTrack(preferredTrack.id);
          }
        }
      } else if (event.type === "timeupdate") {
        if (activeMediaKeyRef.current !== requestedMediaKeyRef.current) return;
        latestPositionRef.current = event.detail.currentTime;
        persistResumePosition();
        if (event.detail.duration > 0) {
          onProgressChange?.(
            Math.max(
              0,
              Math.min(
                100,
                (event.detail.currentTime / event.detail.duration) * 100,
              ),
            ),
          );
        }
      } else if (event.type === "pause") {
        const snapshot = playerRef.current?.getSnapshot();
        if (snapshot) latestPositionRef.current = snapshot.media.currentTime;
        persistResumePosition(true);
      } else if (event.type === "ended") {
        const snapshot = playerRef.current?.getSnapshot();
        if (snapshot) latestPositionRef.current = snapshot.media.currentTime;
        persistResumePosition(true);
        if (activeMediaKeyRef.current === requestedMediaKeyRef.current) {
          onProgressChange?.(100);
          onLessonEnded?.();
        }
      } else if (event.type === "volumechange") {
        setMuted(event.detail.muted);
        if (preferencesReadyRef.current) {
          writeMutedPreference(event.detail.muted);
        }
      } else if (event.type === "texttrackchange") {
        captionsEnabledRef.current = event.detail.track !== null;
      }
    },
    [onLessonEnded, onProgressChange, persistResumePosition],
  );

  const minimizePlayer = useCallback(() => {
    if (!onMinimize) return;
    const snapshot = playerRef.current?.getSnapshot();
    if (snapshot?.ui.fullscreen) return;
    const currentTime =
      snapshot?.media.currentTime ?? latestPositionRef.current;
    latestPositionRef.current = currentTime;
    persistResumePosition(true);
    onMinimize({
      currentTime,
      lessonTitle,
      mediaKey,
      muted: snapshot?.media.muted ?? muted,
      playbackRate: snapshot?.media.playbackRate ?? 1,
      playing: snapshot?.media.playing ?? false,
      source: { ...source, startTime: currentTime },
    });
  }, [lessonTitle, mediaKey, muted, onMinimize, persistResumePosition, source]);

  const handleSwipePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (
        !onMinimize ||
        event.pointerType === "mouse" ||
        !window.matchMedia("(max-width: 640px)").matches ||
        playerRef.current?.getSnapshot().ui.fullscreen
      ) {
        return;
      }
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "[data-player-control], [role='slider'], [data-video-player-mobile-sheet]",
        )
      ) {
        return;
      }
      swipeStartRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [onMinimize],
  );

  const handleSwipePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = swipeStartRef.current;
      if (!start || start.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      if (deltaY <= 0 || deltaY < Math.abs(deltaX) * 1.15) return;
      event.preventDefault();
      setSwipeOffset(Math.min(132, deltaY));
    },
    [],
  );

  const finishSwipe = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
      const start = swipeStartRef.current;
      if (!start || start.pointerId !== event.pointerId) return;
      swipeStartRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const shouldMinimize = !cancelled && swipeOffset >= 84;
      setSwipeOffset(0);
      if (shouldMinimize) minimizePlayer();
    },
    [minimizePlayer, swipeOffset],
  );

  const handleAmbientEnabledChange = useCallback((enabled: boolean) => {
    setAmbientEnabled(enabled);
    writeAmbientPreference(enabled);
  }, []);

  const handleTheaterModeChange = useCallback(
    (active: boolean) => {
      if (active !== theaterMode) onTheaterToggle();
    },
    [onTheaterToggle, theaterMode],
  );

  useEffect(() => {
    if (!preferencesReady) return;
    playerRef.current?.setMuted(muted);
  }, [muted, preferencesReady]);

  useEffect(() => {
    setMuted(readMutedPreference());
    setAmbientEnabled(readAmbientPreference());
    setSeekIntervalSeconds(readLearningPreferences().seekIntervalSeconds);
    preferencesReadyRef.current = true;
    setPreferencesReady(true);

    const syncPreferences = (event: StorageEvent) => {
      if (event.key === lessonPlayerStorageKeys.muted) {
        setMuted(event.newValue === "true" || event.newValue === "on");
      } else if (event.key === lessonPlayerStorageKeys.ambient) {
        if (event.newValue === "on") setAmbientEnabled(true);
        if (event.newValue === "off") setAmbientEnabled(false);
      }
    };
    window.addEventListener("storage", syncPreferences);
    return () => {
      preferencesReadyRef.current = false;
      window.removeEventListener("storage", syncPreferences);
    };
  }, []);

  useEffect(() => {
    return () => persistResumePosition(true);
  }, [mediaKey, persistResumePosition]);

  useEffect(() => {
    const handleLessonNavigationShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        !event.shiftKey ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "input, textarea, select, [role='textbox'], [contenteditable]:not([contenteditable='false'])",
        )
      ) {
        return;
      }

      if (event.code === "KeyN" && canGoNext) {
        event.preventDefault();
        onGoNext();
      } else if (event.code === "KeyP" && canGoPrevious) {
        event.preventDefault();
        onGoPrevious();
      }
    };

    window.addEventListener("keydown", handleLessonNavigationShortcut);
    return () =>
      window.removeEventListener("keydown", handleLessonNavigationShortcut);
  }, [canGoNext, canGoPrevious, onGoNext, onGoPrevious]);

  return (
    <VeoVideoPlayer
      key={mediaKey}
      ref={playerRef}
      source={source}
      theme={playerTheme}
      engine="shaka"
      engineFactory={engineFactory}
      autoPlay={autoPlayOnMediaChange || restoreAutoplayRef.current}
      ariaLabel={`Lesson video player for ${lessonTitle}`}
      theaterMode={theaterMode}
      onTheaterModeChange={handleTheaterModeChange}
      shortcuts={LESSON_PLAYER_SHORTCUTS}
      seekIntervalSeconds={seekIntervalSeconds}
      emptyTapBehavior="responsive"
      controlsIdleDelay={5_000}
      onEvent={handleEvent}
      lockLandscapeOnFullscreen
      mediaProps={{ muted }}
      className="transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none"
      style={{
        opacity: swipeOffset > 0 ? Math.max(0.72, 1 - swipeOffset / 520) : 1,
        touchAction: "pan-x pinch-zoom",
        transform:
          swipeOffset > 0
            ? `translateY(${Math.round(swipeOffset * 0.22)}px) scale(${Math.max(0.93, 1 - swipeOffset / 1800)})`
            : undefined,
        transitionDuration: swipeStartRef.current ? "0ms" : undefined,
      }}
      onPointerDown={handleSwipePointerDown}
      onPointerMove={handleSwipePointerMove}
      onPointerUp={(event) => finishSwipe(event)}
      onPointerCancel={(event) => finishSwipe(event, true)}
      playerClassName="border-0 rounded-[13px] max-sm:overflow-visible"
      centralControl={
        <LessonCentralControls
          canGoNext={canGoNext}
          canGoPrevious={canGoPrevious}
          onGoNext={onGoNext}
          onGoPrevious={onGoPrevious}
        />
      }
      controls={
        <LessonPlayerControls
          ambientEnabled={ambientEnabled}
          autoplayEnabled={autoplayEnabled}
          canGoNext={canGoNext}
          canGoPrevious={canGoPrevious}
          onAmbientEnabledChange={handleAmbientEnabledChange}
          onAutoplayEnabledChange={onAutoplayEnabledChange}
          onGoNext={onGoNext}
          onGoPrevious={onGoPrevious}
          onMinimize={onMinimize ? minimizePlayer : undefined}
        />
      }
      overlays={
        <LessonAmbientProjection
          enabled={ambientEnabled}
          theaterMode={theaterMode}
        />
      }
    />
  );
}
