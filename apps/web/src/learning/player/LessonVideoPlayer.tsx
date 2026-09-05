import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  type CourseLessonsSecondPressHoldProps,
} from "./LessonPlayerControls";
import type { LearningMiniPlayerRequest } from "./learningMiniPlayerTypes";
import {
  getInitialLearningPlayerPreferences,
  publishLearningPlayerBootstrap,
} from "../learningPlayerPreferences";
import {
  getLearningMiniPlayerRuntimeSnapshot,
  prepareLearningMiniPlayerPlaybackHandoff,
} from "./learningMiniPlayerStore";
import {
  clampPlayerVolume,
  consumeMiniPlayerRestore,
  lessonPlayerStorageKeys,
  readAmbientPreference,
  readResumePosition,
  writeAmbientPreference,
  writeMutedPreference,
  writePlaybackRatePreference,
  writeResumePosition,
  writeVolumePreference,
} from "./lessonPlayerPersistence";
import { createLearningLessonVideoSource } from "./lessonVideoSource";
import { useLearningPlayerTheme } from "./useLearningPlayerTheme";
import { MiniPlayerControls } from "./MiniPlayerControls";
import { LearningMiniPlayerBufferingIndicator } from "./learningMiniPlayerBufferingIndicator";
import {
  useLessonPlayerMinimizeGesture,
  type LessonPlayerMinimizeGestureState,
} from "./useLessonPlayerMinimizeGesture";
import { useLearningPlayerMinimizeShortcut } from "./useLearningPlayerMinimizeShortcut";
import { cn } from "../../lib/utils";

const RESUME_PERSIST_INTERVAL_MS = 5_000;
const MAX_MINI_PLAYER_RESTORE_DRIFT_SECONDS = 0.35;
const LESSON_PLAYER_SHORTCUTS = {
  seekBackwardLarge: false,
  seekForwardLarge: false,
  toggleTheaterMode: false,
  togglePictureInPicture: false,
} as const;

type FullscreenCoursePanelStyle = CSSProperties & {
  "--learning-fullscreen-panel-offset-x": string;
  "--learning-fullscreen-video-offset-x": string;
  "--learning-fullscreen-video-pane-width": string;
  "--learning-fullscreen-video-width": string;
};

export interface LessonVideoPlayerProps {
  media: CourseVideo;
  lessonTitle: string;
  courseTitle?: string;
  lessonIndex?: number;
  totalLessons?: number;
  theaterMode: boolean;
  onTheaterToggle: () => void;
  autoPlayOnMediaChange?: boolean;
  autoplayEnabled?: boolean;
  canGoNext?: boolean;
  canGoPrevious?: boolean;
  courseLessonsOpen?: boolean;
  courseLessonsDrawerOpen?: boolean;
  courseLessonsPanel?: ReactNode;
  courseLessonsSecondPressHold?: CourseLessonsSecondPressHoldProps;
  courseLessonsShortcutLabel?: string;
  courseLessonsSidePanel?: boolean;
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
  courseLessonsDrawerOpen = false,
  courseLessonsPanel,
  courseLessonsSecondPressHold,
  courseLessonsShortcutLabel,
  courseLessonsSidePanel = false,
  courseLessonsVideoWidthPercent = 60,
  courseTitle,
  engineFactory,
  lessonIndex,
  lessonTitle,
  media,
  totalLessons,
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
  const [initialPlayerPreferences] = useState(
    getInitialLearningPlayerPreferences,
  );
  const playerPrefsRef = useRef({ ...initialPlayerPreferences });
  const playbackPrefsAppliedRef = useRef(false);
  const applyingPlaybackPrefsRef = useRef(false);
  const [muted, setMuted] = useState(initialPlayerPreferences.muted);
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
    const resumeFromLastPosition =
      readLearningPreferences().resumeFromLastPosition;
    return createLearningLessonVideoSource({
      media,
      lessonTitle,
      mediaKey,
      startTime: resumeFromLastPosition ? readResumePosition(mediaKey) : 0,
    });
  }, [lessonTitle, media, mediaKey]);

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
        applyingPlaybackPrefsRef.current = true;
        try {
          playerRef.current?.setPlaybackRate(
            playerPrefsRef.current.playbackRate,
          );
          playerRef.current?.setVolume(playerPrefsRef.current.volume);
          playerRef.current?.setMuted(
            restoreAutoplayRef.current !== null
              ? true
              : playerPrefsRef.current.muted,
          );
        } finally {
          applyingPlaybackPrefsRef.current = false;
          playbackPrefsAppliedRef.current = true;
        }
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
        if (
          restoreAutoplayRef.current !== null ||
          handoffMutingRef.current ||
          applyingPlaybackPrefsRef.current
        ) {
          return;
        }
        setMuted(event.detail.muted);
        playerPrefsRef.current.muted = event.detail.muted;
        if (preferencesReadyRef.current) {
          writeMutedPreference(event.detail.muted);
          if (playbackPrefsAppliedRef.current) {
            playerPrefsRef.current.volume = event.detail.volume;
            writeVolumePreference(event.detail.volume);
            publishLearningPlayerBootstrap({
              muted: event.detail.muted,
              volume: event.detail.volume,
            });
          } else {
            publishLearningPlayerBootstrap({ muted: event.detail.muted });
          }
        }
      } else if (event.type === "ratechange") {
        playerPrefsRef.current.playbackRate = event.detail.playbackRate;
        writePlaybackRatePreference(event.detail.playbackRate);
        publishLearningPlayerBootstrap({
          playbackRate: event.detail.playbackRate,
        });
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
      courseTitle,
      lessonIndex,
      totalLessons,
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
    minimizeGesture.animateMinimize();
  }, [minimizeGesture, onMinimize]);

  useLearningPlayerMinimizeShortcut({
    enabled: presentation === "full" && Boolean(onMinimize),
    onTrigger: () => {
      void minimizePlayerFromControl();
    },
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

  useLayoutEffect(() => {
    if (restoreAutoplayRef.current !== null) return;
    const player = playerRef.current;
    if (!player) return;
    const prefs = playerPrefsRef.current;
    applyingPlaybackPrefsRef.current = true;
    try {
      player.setVolume(prefs.volume);
      player.setMuted(prefs.muted);
      player.setPlaybackRate(prefs.playbackRate);
    } finally {
      applyingPlaybackPrefsRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    if (restoreAutoplayRef.current !== null) return;
    playerRef.current?.setMuted(muted);
    publishLearningPlayerBootstrap({ muted });
  }, [muted, preferencesReady]);

  useEffect(() => {
    setAmbientEnabled(readAmbientPreference());
    setSeekIntervalSeconds(readLearningPreferences().seekIntervalSeconds);
    preferencesReadyRef.current = true;
    setPreferencesReady(true);

    const syncPreferences = (event: StorageEvent) => {
      if (event.key === lessonPlayerStorageKeys.muted) {
        const nextMuted = event.newValue === "true" || event.newValue === "on";
        setMuted(nextMuted);
        playerPrefsRef.current.muted = nextMuted;
      } else if (event.key === lessonPlayerStorageKeys.volume) {
        const nextVolume = clampPlayerVolume(Number(event.newValue));
        playerPrefsRef.current.volume = nextVolume;
        if (playbackPrefsAppliedRef.current) {
          playerRef.current?.setVolume(nextVolume);
        }
      } else if (event.key === lessonPlayerStorageKeys.playbackRate) {
        const nextRate = Number(event.newValue);
        if (!Number.isFinite(nextRate) || nextRate <= 0) return;
        playerPrefsRef.current.playbackRate = nextRate;
        playerRef.current?.setPlaybackRate(nextRate);
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
  const playerShellStyle = fullscreenCoursePanelActive
    ? ({
        "--learning-fullscreen-video-pane-width": `${courseLessonsVideoWidthPercent}dvw`,
        "--learning-fullscreen-video-width":
          "min(var(--learning-fullscreen-video-pane-width), calc(100dvh * 16 / 9))",
        "--learning-fullscreen-panel-offset-x":
          "max(0px, calc(var(--learning-fullscreen-video-pane-width) - var(--learning-fullscreen-video-width)))",
        "--learning-fullscreen-video-offset-x":
          "calc(var(--learning-fullscreen-panel-offset-x) / 2)",
      } as FullscreenCoursePanelStyle)
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
      keepControlsVisibleUntilFirstPlay
      keepPosterVisibleUntilFirstPlay
      onEvent={handleEvent}
      lockLandscapeOnFullscreen
      mediaProps={{
        muted: restoreAutoplayRef.current !== null ? true : muted,
      }}
      className={cn(
        presentation === "full" &&
          "touch-pan-x touch-pinch-zoom min-[641px]:touch-pan-y",
        presentation === "mini"
          ? "!rounded-none"
          : fullscreenCoursePanelActive
            ? "flex h-full items-center justify-start overflow-hidden bg-black"
            : undefined,
      )}
      data-learning-player-controls-suppressed={
        minimizeGesture.controlsSuppressed ? "" : undefined
      }
      data-learning-player-motion-surface=""
      style={playerShellStyle}
      {...(presentation === "full" ? minimizeGesture.handlers : {})}
      playerClassName={
        presentation === "mini"
          ? "!rounded-none !shadow-none"
          : fullscreenCoursePanelActive
            ? "border-0 !h-auto !max-h-full !w-(--learning-fullscreen-video-width) !max-w-none !translate-x-(--learning-fullscreen-video-offset-x) !shrink-0 !rounded-none !shadow-none"
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
            courseTitle={courseTitle}
            lessonIndex={lessonIndex}
            totalLessons={totalLessons}
            canGoNext={canGoNext}
            canGoPrevious={canGoPrevious}
            onGoNext={onGoNext}
            onGoPrevious={onGoPrevious}
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
            courseLessonsDrawerOpen={courseLessonsDrawerOpen}
            courseLessonsPanel={courseLessonsPanel}
            courseLessonsSecondPressHold={courseLessonsSecondPressHold}
            courseLessonsShortcutLabel={courseLessonsShortcutLabel}
            courseLessonsSidePanel={courseLessonsSidePanel}
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
      playbackFeedback={
        presentation === "mini" || minimizeGesture.controlsSuppressed
          ? false
          : undefined
      }
      bufferingIndicator={
        presentation === "mini" ? (
          <LearningMiniPlayerBufferingIndicator />
        ) : undefined
      }
    />
  );
}
