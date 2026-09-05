import {
  VideoPlayer,
  type VideoPlayerEvent,
  type VideoPlayerHandle,
} from "@veolms/video-player";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LearningMiniPlayerSession,
  LearningPlayerPlaybackSnapshot,
} from "./learningMiniPlayerTypes";
import {
  writeMiniPlayerRestore,
  writeResumePosition,
} from "./lessonPlayerPersistence";
import {
  openLearningMiniPlayerSession,
  registerLearningMiniPlayerRuntime,
} from "./learningMiniPlayerStore";
import { useLearningMiniPlayerGestures } from "./useLearningMiniPlayerGestures";
import { useLearningPlayerTheme } from "./useLearningPlayerTheme";
import { MiniPlayerControls } from "./MiniPlayerControls";
import { LearningMiniPlayerBufferingIndicator } from "./learningMiniPlayerBufferingIndicator";
import { MiniPlayerInfoBar } from "./MiniPlayerInfoBar";
import { MiniPlayerResizeHandles } from "./MiniPlayerResizeHandles";
import { useLearningPlayerMinimizeShortcut } from "./useLearningPlayerMinimizeShortcut";
import { resolveLearningMiniPlayerLessonPath } from "./persistentMiniPlayerLesson";
import { LEARNING_MINI_PLAYER_CURRICULUM_SCROLL_CONTROL_BOTTOM_CLEARANCE } from "./learningPlayerMotion";
import { useMiniPlayerCurriculumSections } from "./useMiniPlayerCurriculumSections";
import { Curriculum } from "../Curriculum";
import {
  getCourseVideoForLesson,
  lessonSequence as defaultLessonSequence,
  lessonsById as defaultLessonsById,
  sections as defaultSections,
} from "../courseContent";

const MAX_HANDOFF_DRIFT_SECONDS = 0.35;

export interface LearningMiniPlayerProps {
  session: LearningMiniPlayerSession;
  onClose: () => void;
  onPrepared?: () => void;
  onRestore: () => void;
  onOpenCourseOverview?: () => void;
  preparing?: boolean;
}

export function LearningMiniPlayer({
  session,
  onClose,
  onPrepared,
  onRestore,
  onOpenCourseOverview,
  preparing = false,
}: LearningMiniPlayerProps) {
  const playerRef = useRef<VideoPlayerHandle>(null);
  const miniPlayerRef = useRef<HTMLElement>(null);
  const playerTheme = useLearningPlayerTheme();
  const currentTimeRef = useRef(session.currentTime);
  const preparationCompletedRef = useRef(false);
  const preparationFramePendingRef = useRef(false);
  const preparationStartedRef = useRef(false);
  const pendingPreparationRef = useRef<LearningPlayerPlaybackSnapshot | null>(
    null,
  );

  const persistCurrentTime = useCallback(() => {
    const currentTime =
      playerRef.current?.getSnapshot().media.currentTime ??
      currentTimeRef.current;
    writeResumePosition(session.mediaKey, currentTime);
    return currentTime;
  }, [session.mediaKey]);

  const getPlaybackSnapshot = useCallback(() => {
    const snapshot = playerRef.current?.getSnapshot().media;
    return {
      currentTime: snapshot?.currentTime ?? currentTimeRef.current,
      muted: snapshot?.muted ?? session.muted,
      playbackRate: snapshot?.playbackRate ?? session.playbackRate,
      playing: snapshot?.playing ?? session.playing,
      volume: snapshot?.volume ?? session.volume,
    };
  }, [session.muted, session.playbackRate, session.playing, session.volume]);

  useEffect(
    () =>
      registerLearningMiniPlayerRuntime({
        getPlaybackSnapshot,
        mediaKey: session.mediaKey,
        preparePlaybackHandoff: () => playerRef.current?.setMuted(true),
      }),
    [getPlaybackSnapshot, session.mediaKey],
  );

  const handleClose = useCallback(() => {
    persistCurrentTime();
    onClose();
  }, [onClose, persistCurrentTime]);

  const handleRestore = useCallback(() => {
    const snapshot = playerRef.current?.getSnapshot();
    persistCurrentTime();
    writeMiniPlayerRestore(session.mediaKey, snapshot?.media.playing ?? false);
    onRestore();
  }, [onRestore, persistCurrentTime, session.mediaKey]);

  useLearningPlayerMinimizeShortcut({
    enabled: true,
    onTrigger: handleRestore,
    onClose: handleClose,
  });

  const [isExpanded, setIsExpanded] = useState(false);
  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const miniPlayerGestures = useLearningMiniPlayerGestures(
    miniPlayerRef,
    handleClose,
    true,
    handleRestore,
    isExpanded,
  );

  const selectedLesson = session.selectedLesson ?? 1;
  const {
    sectionIds,
    expandedSectionIds,
    setExpandedSectionIds,
    expandAllSections,
    collapseAllSections,
  } = useMiniPlayerCurriculumSections(defaultSections, selectedLesson);
  const selectedLessonIndex = defaultLessonSequence.indexOf(selectedLesson);
  const previousLessonId =
    selectedLessonIndex > 0
      ? defaultLessonSequence[selectedLessonIndex - 1]
      : undefined;
  const nextLessonId =
    selectedLessonIndex >= 0 &&
    selectedLessonIndex < defaultLessonSequence.length - 1
      ? defaultLessonSequence[selectedLessonIndex + 1]
      : undefined;

  const handleSelectLesson = useCallback(
    (lessonNumber: number) => {
      const newLesson = defaultLessonsById.get(lessonNumber);
      if (!newLesson) return;
      const newMedia = getCourseVideoForLesson(lessonNumber);
      const lessonIndex = defaultLessonSequence.indexOf(lessonNumber);
      const lessonPath =
        resolveLearningMiniPlayerLessonPath({
          courseRouteKey: session.courseSlug,
          lessonNumber,
          lessonPath: session.lessonPath,
        }) ?? session.lessonPath;
      const newSession: LearningMiniPlayerSession = {
        ...session,
        lessonTitle: newLesson[1],
        lessonIndex: lessonIndex >= 0 ? lessonIndex + 1 : undefined,
        totalLessons: defaultLessonSequence.length,
        selectedLesson: lessonNumber,
        source: {
          src: newMedia.src,
          type: "application/x-mpegurl",
          startTime: 0,
        },
        mediaKey: newMedia.fileName,
        currentTime: 0,
        playing: true,
        lessonPath,
      };
      openLearningMiniPlayerSession(newSession);
    },
    [session],
  );

  const handleGoPrevious = useCallback(() => {
    if (previousLessonId !== undefined) handleSelectLesson(previousLessonId);
  }, [handleSelectLesson, previousLessonId]);

  const handleGoNext = useCallback(() => {
    if (nextLessonId !== undefined) handleSelectLesson(nextLessonId);
  }, [handleSelectLesson, nextLessonId]);

  const finishPreparation = useCallback(() => {
    const playback =
      session.getLivePlaybackSnapshot?.() ?? pendingPreparationRef.current;
    if (!preparing || preparationCompletedRef.current || !playback) return;

    const candidate = playerRef.current?.getSnapshot().media;
    if (
      playback.playing &&
      candidate &&
      Math.abs(playback.currentTime - candidate.currentTime) >
        MAX_HANDOFF_DRIFT_SECONDS
    ) {
      preparationFramePendingRef.current = false;
      pendingPreparationRef.current = playback;
      playerRef.current?.seekTo(playback.currentTime);
      return;
    }

    preparationCompletedRef.current = true;
    preparationFramePendingRef.current = false;
    pendingPreparationRef.current = null;
    playerRef.current?.setVolume(playback.volume);
    playerRef.current?.setMuted(playback.muted);
    session.preparePlaybackHandoff?.();
    onPrepared?.();
  }, [onPrepared, preparing, session]);

  const completePreparation = useCallback(() => {
    const playback =
      session.getLivePlaybackSnapshot?.() ?? pendingPreparationRef.current;
    if (
      !preparing ||
      preparationCompletedRef.current ||
      preparationFramePendingRef.current ||
      !playback
    ) {
      return;
    }
    pendingPreparationRef.current = playback;
    if (!playback.playing) {
      finishPreparation();
      return;
    }

    const player = playerRef.current;
    if (!player) {
      return;
    }
    const candidate = player.getSnapshot().media;
    if (
      Math.abs(playback.currentTime - candidate.currentTime) >
      MAX_HANDOFF_DRIFT_SECONDS
    ) {
      player.seekTo(playback.currentTime);
      return;
    }
    if (!candidate.playing || candidate.buffering || candidate.seeking) return;

    preparationFramePendingRef.current = true;
    void player.waitForPresentedFrame().then(finishPreparation);
  }, [finishPreparation, preparing, session]);

  const handleEvent = useCallback(
    (event: VideoPlayerEvent) => {
      if (event.type === "timeupdate") {
        currentTimeRef.current = event.detail.currentTime;
      } else if (event.type === "playing") {
        completePreparation();
      } else if (event.type === "seeked") {
        completePreparation();
      } else if (event.type === "pause" || event.type === "ended") {
        persistCurrentTime();
      }
    },
    [completePreparation, persistCurrentTime],
  );

  const handleReady = useCallback(() => {
    if (preparing && preparationStartedRef.current) return;
    if (preparing) preparationStartedRef.current = true;
    const livePlayback = session.getLivePlaybackSnapshot?.() ?? {
      currentTime: session.currentTime,
      muted: session.muted,
      playbackRate: session.playbackRate,
      playing: session.playing,
      volume: session.volume,
    };
    currentTimeRef.current = livePlayback.currentTime;
    playerRef.current?.seekTo(livePlayback.currentTime);
    playerRef.current?.setPlaybackRate(livePlayback.playbackRate);

    if (!preparing) return;
    pendingPreparationRef.current = livePlayback;
    playerRef.current?.setVolume(livePlayback.volume);
    playerRef.current?.setMuted(true);
    if (!livePlayback.playing) {
      completePreparation();
      return;
    }
    void playerRef.current?.play().catch(() => {
      preparationStartedRef.current = false;
      pendingPreparationRef.current = null;
    });
  }, [completePreparation, preparing, session]);

  useEffect(
    () => () => {
      persistCurrentTime();
    },
    [persistCurrentTime],
  );

  return (
    <aside
      ref={miniPlayerRef}
      className="fixed right-3 z-130 m-0 w-[min(82vw,22rem)] min-w-50 max-w-[calc(100vw-1.5rem)] touch-none overflow-hidden rounded-xl border-0 bg-black p-0 shadow-[0_18px_48px_rgba(0,0,0,0.52)] ring-1 ring-white/14 ring-inset select-none flex flex-col group/mini-player-shell data-[mini-player-mode=dragging]:cursor-grabbing data-[mini-player-mode=dismissing]:pointer-events-none data-[mini-player-mode=dismissing]:transition-[transform,opacity] data-[mini-player-mode=dismissing]:duration-200 data-[mini-player-mode=dismissing]:ease-[cubic-bezier(0.22,1,0.36,1)] data-[mini-player-preparing]:pointer-events-none data-[mini-player-preparing]:opacity-0 motion-reduce:transition-none"
      style={{
        bottom: "calc(70px + env(safe-area-inset-bottom))",
        ...miniPlayerGestures.style,
      }}
      aria-label={`Mini player for ${session.lessonTitle}`}
      aria-describedby="learning-mini-player-gesture-help"
      popover="manual"
      data-learning-mini-player=""
      data-mini-player-mode={miniPlayerGestures.mode}
      data-mini-player-preparing={preparing || undefined}
      {...miniPlayerGestures.gestureProps}
    >
      <span id="learning-mini-player-gesture-help" className="sr-only">
        Drag to move, resize from an edge, pinch to resize, or swipe down
        quickly to close.
      </span>
      <MiniPlayerResizeHandles expanded={isExpanded} />
      <VideoPlayer
        ref={playerRef}
        source={{ ...session.source, startTime: session.currentTime }}
        theme={playerTheme}
        engine="shaka"
        autoPlay={preparing ? false : session.playing}
        keyboardEnabled={false}
        zoomEnabled={false}
        mediaProps={{ muted: preparing || session.muted }}
        onReady={handleReady}
        onEvent={handleEvent}
        ariaLabel={`Mini player video for ${session.lessonTitle}`}
        className="!rounded-none"
        playerClassName="!rounded-none !shadow-none"
        centralControl={false}
        playbackFeedback={false}
        bufferingIndicator={<LearningMiniPlayerBufferingIndicator />}
        controls={
          <MiniPlayerControls
            lessonTitle={session.lessonTitle}
            courseTitle={session.courseTitle}
            lessonIndex={session.lessonIndex}
            totalLessons={session.totalLessons}
            canGoNext={nextLessonId !== undefined}
            canGoPrevious={previousLessonId !== undefined}
            onGoNext={handleGoNext}
            onGoPrevious={handleGoPrevious}
            onClose={handleClose}
            onRestore={handleRestore}
          />
        }
      />
      <MiniPlayerInfoBar
        lessonTitle={session.lessonTitle}
        courseTitle={session.courseTitle}
        lessonIndex={session.lessonIndex}
        totalLessons={session.totalLessons}
        expanded={isExpanded}
        onToggleExpand={toggleExpanded}
        onRestore={handleRestore}
        sectionIds={sectionIds}
        expandedSectionIds={expandedSectionIds}
        onExpandAllSections={expandAllSections}
        onCollapseAllSections={collapseAllSections}
        onOpenCourseOverview={onOpenCourseOverview}
        contextMenuPortalHostRef={miniPlayerRef}
      />
      {isExpanded ? (
        <div
          className="hidden min-[641px]:flex flex-col w-full h-(--learning-mini-player-playlist-height,320px) shrink-0 overflow-hidden"
          data-learning-mini-player-gesture-ignore=""
          data-learning-mini-player-playlist-shell=""
        >
          <Curriculum
            hideHero
            sections={defaultSections}
            lessonsById={defaultLessonsById}
            selectedLesson={selectedLesson}
            onSelectLesson={handleSelectLesson}
            courseTitle={session.courseTitle ?? ""}
            persistenceKey={session.courseSlug ?? "default"}
            scrollControlBottomClearance={
              LEARNING_MINI_PLAYER_CURRICULUM_SCROLL_CONTROL_BOTTOM_CLEARANCE
            }
            expandedSectionIds={expandedSectionIds}
            onExpandedSectionIdsChange={(sectionIds) =>
              setExpandedSectionIds([...sectionIds])
            }
            onOpenCourseOverview={onOpenCourseOverview}
          />
        </div>
      ) : null}
    </aside>
  );
}
