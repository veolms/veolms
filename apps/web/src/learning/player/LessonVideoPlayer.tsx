import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
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
  getLearningMiniPlayerRuntimeSnapshot,
  prepareLearningMiniPlayerPlaybackHandoff,
} from "./learningMiniPlayerStore";
import {
  consumeMiniPlayerRestore,
  lessonPlayerStorageKeys,
  readAmbientPreference,
  readMutedPreference,
  readPlaybackRatePreference,
  readResumePosition,
  writeAmbientPreference,
  writeMutedPreference,
  writePlaybackRatePreference,
  writeResumePosition,
} from "./lessonPlayerPersistence";
import { useLearningPlayerTheme } from "./useLearningPlayerTheme";
import { MiniPlayerControls } from "./MiniPlayerControls";
import {
  useLessonPlayerMinimizeGesture,
  type LessonPlayerMinimizeGestureState,
} from "./useLessonPlayerMinimizeGesture";

const RESUME_PERSIST_INTERVAL_MS = 5_000;
const MAX_MINI_PLAYER_RESTORE_DRIFT_SECONDS = 0.35;
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
  courseLessonsOpen?: boolean;
  courseLessonsPanel?: ReactNode;
  courseLessonsVideoWidthPercent?: number;
  onAutoplayEnabledChange?: (enabled: boolean) => void;
  onCourseLessonsToggle?: (presentation: "drawer" | "side") => void;
  onGoNext?: () => void;
  onGoPrevious?: () => void;
  onLessonEnded?: () => void;
  onMinimize?: (request: LearningMiniPlayerRequest) => void;
  onMinimizeGestureStart?: () => void;
  onMinimizeGestureChange?: (state: LessonPlayerMinimizeGestureState) => void;
  minimizeMotionTarget?: () => HTMLElement | null;
  onMiniPlayerRestoreReady?: () => void;
  onMiniClose?: () => void;
  onMiniRestore?: () => void;
  onMobileLandscapeFullscreenChange?: (active: boolean) => void;
  onProgressChange?: (progress: number) => void;
  presentation?: "full" | "mini";
  resumePersistenceKey?: string;
  /** Engine injection is useful for deterministic integration testing. */
  engineFactory?: () => VideoEngine;
}

export function LessonVideoPlayer({
  autoPlayOnMediaChange = false,
  autoplayEnabled = true,
  canGoNext = false,
  canGoPrevious = false,
  courseLessonsOpen = false,
  courseLessonsPanel,
  courseLessonsVideoWidthPercent = 60,
  engineFactory,
  lessonTitle,
  media,
  onProgressChange,
  onAutoplayEnabledChange = () => undefined,
  onCourseLessonsToggle,
  onGoNext = () => undefined,
  onGoPrevious = () => undefined,
  onLessonEnded,
  onMinimize,
  onMinimizeGestureStart,
  onMinimizeGestureChange,
  minimizeMotionTarget,
  onMiniPlayerRestoreReady,
  onMiniClose,
  onMiniRestore,
  onMobileLandscapeFullscreenChange,
  onTheaterToggle,
  resumePersistenceKey,
  theaterMode,
  presentation = "full",
}: LessonVideoPlayerProps) {
  const playerRef = useRef<VideoPlayerHandle>(null);
  const latestPositionRef = useRef(0);
  const lastPersistedAtRef = useRef<number | null>(null);
  const preferencesReadyRef = useRef(false);
  const captionsEnabledRef = useRef(false);
  const handoffMutingRef = useRef(false);
  // Keep the server and first client render deterministic, then restore the
  // device preference after hydration just like the legacy lesson player.
  const [muted, setMuted] = useState(false);
  const [ambientEnabled, setAmbientEnabled] = useState(false);
  const [seekIntervalSeconds, setSeekIntervalSeconds] = useState(
    LEARNING_SEEK_INTERVAL_DEFAULT,
  );
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [mobileLandscapeFullscreen, setMobileLandscapeFullscreen] =
    useState(false);
  const playerTheme = useLearningPlayerTheme();
  const mediaKey = resumePersistenceKey ?? media.fileName;
  const activeMediaKeyRef = useRef(mediaKey);
  const requestedMediaKeyRef = useRef(mediaKey);
  const restoreAutoplayRef = useRef(consumeMiniPlayerRestore(mediaKey));
  const restoreFramePendingRef = useRef(false);
  const restoreResyncAttemptedRef = useRef(false);
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
      streaming: isHls ? { abrEnabled: true, bufferBehind: 600 } : undefined,
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

  const finishMiniPlayerRestore = useCallback(() => {
    if (restoreAutoplayRef.current === null) return;
    const livePlayback = getLearningMiniPlayerRuntimeSnapshot(mediaKey);
    playerRef.current?.setVolume(
      livePlayback?.volume ??
        playerRef.current?.getSnapshot().media.volume ??
        1,
    );
    playerRef.current?.setMuted(livePlayback?.muted ?? muted);
    prepareLearningMiniPlayerPlaybackHandoff(mediaKey);
    restoreAutoplayRef.current = null;
    restoreFramePendingRef.current = false;
    restoreResyncAttemptedRef.current = false;
    onMiniPlayerRestoreReady?.();
  }, [mediaKey, muted, onMiniPlayerRestoreReady]);

  const finishMiniPlayerRestoreAfterPresentedFrame = useCallback(() => {
    if (restoreAutoplayRef.current === null || restoreFramePendingRef.current) {
      return;
    }
    const player = playerRef.current;
    if (!player) return;

    restoreFramePendingRef.current = true;
    void player.waitForPresentedFrame().then(() => {
      restoreFramePendingRef.current = false;
      if (restoreAutoplayRef.current === null) return;
      const livePlayback = getLearningMiniPlayerRuntimeSnapshot(mediaKey);
      const restoredPlayback = player.getSnapshot().media;
      if (
        restoreAutoplayRef.current === true &&
        livePlayback &&
        Math.abs(livePlayback.currentTime - restoredPlayback.currentTime) >
          MAX_MINI_PLAYER_RESTORE_DRIFT_SECONDS
      ) {
        player.seekTo(livePlayback.currentTime);
        return;
      }
      finishMiniPlayerRestore();
    });
  }, [finishMiniPlayerRestore, mediaKey]);

  const tryFinishPlayingMiniPlayerRestore = useCallback(() => {
    if (restoreAutoplayRef.current !== true) return;
    const playerSnapshot = playerRef.current?.getSnapshot().media;
    if (
      !playerSnapshot?.playing ||
      playerSnapshot.buffering ||
      playerSnapshot.seeking
    ) {
      return;
    }

    const livePlayback = getLearningMiniPlayerRuntimeSnapshot(mediaKey);
    if (
      livePlayback &&
      !restoreResyncAttemptedRef.current &&
      Math.abs(livePlayback.currentTime - playerSnapshot.currentTime) >
        MAX_MINI_PLAYER_RESTORE_DRIFT_SECONDS
    ) {
      restoreResyncAttemptedRef.current = true;
      playerRef.current?.seekTo(livePlayback.currentTime);
      return;
    }
    finishMiniPlayerRestoreAfterPresentedFrame();
  }, [finishMiniPlayerRestoreAfterPresentedFrame, mediaKey]);

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
        playerRef.current?.setPlaybackRate(readPlaybackRatePreference());
        if (restoreAutoplayRef.current !== null) {
          const livePlayback = getLearningMiniPlayerRuntimeSnapshot(mediaKey);
          if (livePlayback) {
            latestPositionRef.current = livePlayback.currentTime;
            playerRef.current?.seekTo(livePlayback.currentTime);
            playerRef.current?.setPlaybackRate(livePlayback.playbackRate);
          }
          if (restoreAutoplayRef.current === false) {
            window.setTimeout(finishMiniPlayerRestore, 0);
          }
        }
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
        tryFinishPlayingMiniPlayerRestore();
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
      } else if (event.type === "playing") {
        tryFinishPlayingMiniPlayerRestore();
      } else if (event.type === "seeked") {
        tryFinishPlayingMiniPlayerRestore();
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
        if (restoreAutoplayRef.current !== null || handoffMutingRef.current) {
          return;
        }
        setMuted(event.detail.muted);
        if (preferencesReadyRef.current) {
          writeMutedPreference(event.detail.muted);
        }
      } else if (event.type === "ratechange") {
        writePlaybackRatePreference(event.detail.playbackRate);
      } else if (event.type === "texttrackchange") {
        captionsEnabledRef.current = event.detail.track !== null;
      }
    },
    [
      finishMiniPlayerRestore,
      mediaKey,
      onLessonEnded,
      onProgressChange,
      persistResumePosition,
      tryFinishPlayingMiniPlayerRestore,
    ],
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
      volume: snapshot?.media.volume ?? 1,
      getLivePlaybackSnapshot: () => {
        const liveSnapshot = playerRef.current?.getSnapshot().media;
        return {
          currentTime: liveSnapshot?.currentTime ?? latestPositionRef.current,
          muted: liveSnapshot?.muted ?? muted,
          playbackRate: liveSnapshot?.playbackRate ?? 1,
          playing: liveSnapshot?.playing ?? false,
          volume: liveSnapshot?.volume ?? 1,
        };
      },
      preparePlaybackHandoff: () => {
        handoffMutingRef.current = true;
        playerRef.current?.setMuted(true);
      },
    });
  }, [lessonTitle, mediaKey, muted, onMinimize, persistResumePosition, source]);

  const minimizePlayerFromControl = useCallback(async () => {
    if (!onMinimize) return;
    const player = playerRef.current;
    if (player?.getSnapshot().ui.fullscreen) {
      try {
        await player.exitFullscreen();
      } catch {
        return;
      }
    }
    minimizePlayer();
  }, [minimizePlayer, onMinimize]);

  const minimizeGesture = useLessonPlayerMinimizeGesture({
    enabled: presentation === "full" && Boolean(onMinimize),
    fullscreen: () => playerRef.current?.getSnapshot().ui.fullscreen ?? false,
    motionTarget: minimizeMotionTarget,
    onCommit: minimizePlayer,
    onGestureStart: onMinimizeGestureStart,
    onSettlingMiniPress: onMiniRestore,
    onStateChange: onMinimizeGestureChange,
    preserveTerminalStateOnDisable: presentation === "mini",
  });

  const handleAmbientEnabledChange = useCallback((enabled: boolean) => {
    setAmbientEnabled(enabled);
    writeAmbientPreference(enabled);
  }, []);

  const handleMobileLandscapeFullscreenChange = useCallback(
    (active: boolean) => {
      setMobileLandscapeFullscreen(active);
      onMobileLandscapeFullscreenChange?.(active);
    },
    [onMobileLandscapeFullscreenChange],
  );

  const handleTheaterModeChange = useCallback(
    (active: boolean) => {
      if (active !== theaterMode) onTheaterToggle();
    },
    [onTheaterToggle, theaterMode],
  );

  useEffect(() => {
    if (!preferencesReady) return;
    if (restoreAutoplayRef.current !== null) return;
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

  const fullscreenCoursePanelActive =
    presentation === "full" &&
    mobileLandscapeFullscreen &&
    courseLessonsOpen &&
    Boolean(courseLessonsPanel);
  const playerShellStyle =
    presentation === "full"
      ? ({
          ...minimizeGesture.style,
          ...(fullscreenCoursePanelActive
            ? {
                "--learning-fullscreen-video-width": `${courseLessonsVideoWidthPercent}%`,
              }
            : undefined),
        } as CSSProperties)
      : undefined;

  return (
    <VeoVideoPlayer
      ref={playerRef}
      source={source}
      theme={playerTheme}
      engine="shaka"
      engineFactory={engineFactory}
      autoPlay={autoPlayOnMediaChange || restoreAutoplayRef.current === true}
      keyboardEnabled={presentation === "full"}
      zoomEnabled={presentation === "full"}
      zoomOverflowBoundary={
        presentation === "full" && mobileLandscapeFullscreen
          ? "shell"
          : "player"
      }
      ariaLabel={`Lesson video player for ${lessonTitle}`}
      theaterMode={theaterMode}
      onTheaterModeChange={handleTheaterModeChange}
      shortcuts={LESSON_PLAYER_SHORTCUTS}
      seekIntervalSeconds={seekIntervalSeconds}
      emptyTapBehavior="responsive"
      controlsIdleDelay={5_000}
      onEvent={handleEvent}
      lockLandscapeOnFullscreen
      mediaProps={{
        muted: restoreAutoplayRef.current !== null ? true : muted,
      }}
      className={
        presentation === "mini"
          ? "!rounded-xl"
          : fullscreenCoursePanelActive
            ? "flex h-full items-center justify-start overflow-hidden bg-black"
            : undefined
      }
      data-learning-player-controls-suppressed={
        minimizeGesture.controlsSuppressed ? "" : undefined
      }
      data-learning-player-motion-surface=""
      style={playerShellStyle}
      {...(presentation === "full" ? minimizeGesture.handlers : {})}
      playerClassName={
        presentation === "mini"
          ? "!rounded-xl !shadow-none"
          : fullscreenCoursePanelActive
            ? "border-0 !h-auto !max-h-full !w-(--learning-fullscreen-video-width) !max-w-[calc(100dvh*16/9)] !shrink-0 !rounded-none !shadow-none"
            : "border-0 !rounded-none"
      }
      centralControl={
        presentation === "mini" ? (
          false
        ) : (
          <LessonCentralControls
            canGoNext={canGoNext}
            canGoPrevious={canGoPrevious}
            controlsSuppressed={minimizeGesture.controlsSuppressed}
            onGoNext={onGoNext}
            onGoPrevious={onGoPrevious}
          />
        )
      }
      controls={
        presentation === "mini" ? (
          <MiniPlayerControls
            lessonTitle={lessonTitle}
            onClose={onMiniClose ?? (() => undefined)}
            onRestore={onMiniRestore ?? (() => undefined)}
          />
        ) : (
          <LessonPlayerControls
            ambientEnabled={ambientEnabled}
            autoplayEnabled={autoplayEnabled}
            canGoNext={canGoNext}
            canGoPrevious={canGoPrevious}
            controlsSuppressed={minimizeGesture.controlsSuppressed}
            courseLessonsOpen={courseLessonsOpen}
            courseLessonsPanel={courseLessonsPanel}
            onAmbientEnabledChange={handleAmbientEnabledChange}
            onAutoplayEnabledChange={onAutoplayEnabledChange}
            onCourseLessonsToggle={onCourseLessonsToggle}
            onGoNext={onGoNext}
            onGoPrevious={onGoPrevious}
            onMinimize={onMinimize ? minimizePlayerFromControl : undefined}
            onMobileLandscapeFullscreenChange={
              handleMobileLandscapeFullscreenChange
            }
          />
        )
      }
      overlays={
        presentation === "full" && !minimizeGesture.controlsSuppressed ? (
          <LessonAmbientProjection enabled={ambientEnabled} />
        ) : undefined
      }
      playbackFeedback={minimizeGesture.controlsSuppressed ? false : undefined}
    />
  );
}
