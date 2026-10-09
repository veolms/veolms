import {
  VideoPlayer,
  type VideoPlayerEvent,
  type VideoPlayerHandle,
  type VideoSource,
} from "@veolms/video-player";
import type { VideoPlaybackBootstrap } from "@veolms/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../learning-feature.css";
import type {
  LearningMiniPlayerSession,
  LearningPlayerPlaybackSnapshot,
} from "./learningMiniPlayerTypes";
import {
  clearResumePosition,
  readResumePosition,
  writeMiniPlayerRestore,
  writeResumePosition,
} from "./lessonPlayerPersistence";
import { readLearningPreferences } from "../../settings/settingsPreferences";
import {
  getLearningMiniPlayerSnapshot,
  openLearningMiniPlayerSession,
  registerLearningMiniPlayerRuntime,
} from "./learningMiniPlayerStore";
import {
  getCachedVideoPlaybackBootstrap,
  getVideoPlaybackBootstrap,
  refreshVideoPlaybackToken,
} from "../videoPlaybackBootstrap";
import {
  recordDetachedLearningProgress,
  syncDetachedWatchTime,
  useDetachedLessonProgress,
} from "../detachedLearningProgress";
import {
  addWatchedSeconds,
  createWatchTimeTracker,
} from "../learningWatchTime";
import { createLearningLessonVideoSource } from "./lessonVideoSource";
import { CenteredLoadingSpinner } from "../../components/LoadingSpinner";
import { useAuthStore } from "../../store/auth.store";
import { useLearningMiniPlayerGestures } from "./useLearningMiniPlayerGestures";
import { useLearningPlayerTheme } from "./useLearningPlayerTheme";
import { MiniPlayerControls } from "./MiniPlayerControls";
import { LearningMiniPlayerBufferingIndicator } from "./learningMiniPlayerBufferingIndicator";
import { MiniPlayerInfoBar } from "./MiniPlayerInfoBar";
import { MiniPlayerReadingModeEffects } from "./MiniPlayerReadingModeEffects";
import { MiniPlayerResizeHandles } from "./MiniPlayerResizeHandles";
import { useLearningPlayerMinimizeShortcut } from "./useLearningPlayerMinimizeShortcut";
import { resolveLearningMiniPlayerLessonPath } from "./persistentMiniPlayerLesson";
import { LEARNING_MINI_PLAYER_CURRICULUM_SCROLL_CONTROL_BOTTOM_CLEARANCE } from "./learningPlayerMotion";
import { useMiniPlayerCurriculumSections } from "./useMiniPlayerCurriculumSections";
import { Curriculum } from "../Curriculum";
import {
  createLessonSequence,
  createLessonsById,
  type CourseSection,
} from "../courseContent";
import { adaptCourseOverviewToCurriculum } from "../courseCurriculumAdapter";
import { useCourseOverview } from "../../services/courses";

const EMPTY_CURRICULUM_SECTIONS: CourseSection[] = [];

const MAX_HANDOFF_DRIFT_SECONDS = 0.35;
const RESUME_PERSIST_INTERVAL_MS = 5_000;

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
  // Where to start. A session handed over by the lesson page carries the
  // live position. One read back from storage after a reload only knows
  // where the video was when it was minimized (or 0 for a lesson picked
  // from this player's list), so it restarted from there instead of where
  // the learner had got to. The resume position is saved every few seconds
  // while a lesson plays, so that is used when there is one.
  const startTime = useMemo(
    () =>
      session.getLivePlaybackSnapshot
        ? session.currentTime
        : readResumePosition(session.mediaKey) || session.currentTime,
    [session],
  );
  const currentTimeRef = useRef(startTime);
  const lessonEndedRef = useRef(false);
  const lastResumePersistAtRef = useRef(0);
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
    // A lesson that has finished has no place to resume from; saving its
    // end would reopen it on its last second.
    if (!lessonEndedRef.current) {
      writeResumePosition(session.mediaKey, currentTime);
    }
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
  const { data: courseOverview } = useCourseOverview(session.courseSlug, {
    enabled: Boolean(session.courseSlug),
  });
  const adaptedCurriculum = useMemo(
    () =>
      courseOverview ? adaptCourseOverviewToCurriculum(courseOverview) : null,
    [courseOverview],
  );
  const curriculumSections: CourseSection[] =
    adaptedCurriculum?.sections ?? EMPTY_CURRICULUM_SECTIONS;

  // This player has no lesson page behind it (it was brought back after a
  // reload), so it records what is watched itself. Without this nothing
  // watched here counted, and the lesson list's progress never moved.
  const userId = useAuthStore((state) => state.user?.id);
  const progressCourseKey = courseOverview?.course.slug;
  const progressTarget = useMemo(
    () =>
      userId && progressCourseKey && adaptedCurriculum
        ? {
            userId,
            courseKey: progressCourseKey,
            lessonIdsByNumber: new Map(
              [...adaptedCurriculum.lessonsByNumber.entries()].map(
                ([lessonNumber, lesson]) => [lessonNumber, lesson.id] as const,
              ),
            ),
          }
        : undefined,
    [adaptedCurriculum, progressCourseKey, userId],
  );
  const lessonProgress = useDetachedLessonProgress(progressTarget);
  const recordedProgressRef = useRef<{
    mediaKey: string;
    percent: number;
  } | null>(null);
  const recordProgress = useCallback(
    (progress: number) => {
      if (!progressTarget) return;
      const percent = Math.max(0, Math.min(100, Math.round(progress)));
      const recorded = recordedProgressRef.current;
      if (
        recorded &&
        recorded.mediaKey === session.mediaKey &&
        recorded.percent >= percent
      ) {
        return;
      }
      recordedProgressRef.current = { mediaKey: session.mediaKey, percent };
      recordDetachedLearningProgress(progressTarget, selectedLesson, percent);
    },
    [progressTarget, selectedLesson, session.mediaKey],
  );
  const curriculumLessonsById = useMemo(
    () => createLessonsById(curriculumSections),
    [curriculumSections],
  );
  const lessonSequence = useMemo(
    () => createLessonSequence(curriculumSections),
    [curriculumSections],
  );
  const {
    sectionIds,
    expandedSectionIds,
    setExpandedSectionIds,
    expandAllSections,
    collapseAllSections,
  } = useMiniPlayerCurriculumSections(curriculumSections, selectedLesson);
  const selectedLessonIndex = lessonSequence.indexOf(selectedLesson);
  const previousLessonId =
    selectedLessonIndex > 0
      ? lessonSequence[selectedLessonIndex - 1]
      : undefined;
  const nextLessonId =
    selectedLessonIndex >= 0 && selectedLessonIndex < lessonSequence.length - 1
      ? lessonSequence[selectedLessonIndex + 1]
      : undefined;

  // Latest lesson the user asked for; older bootstrap responses are ignored.
  const requestedLessonRef = useRef<number | null>(null);
  const handleSelectLesson = useCallback(
    (lessonNumber: number) => {
      const newLesson = curriculumLessonsById.get(lessonNumber);
      const courseSlug = session.courseSlug;
      if (!newLesson || !courseSlug) return;
      requestedLessonRef.current = lessonNumber;
      const lessonIndex = lessonSequence.indexOf(lessonNumber);
      const lessonPath =
        resolveLearningMiniPlayerLessonPath({
          courseRouteKey: courseSlug,
          lessonNumber,
          lessonPath: session.lessonPath,
        }) ?? session.lessonPath;
      const openLesson = (manifestUrl: string, mediaKey: string) => {
        // A lesson picked here resumes where it was left, as it does on the
        // lesson page, unless the learner has turned resuming off.
        if (!readLearningPreferences().resumeFromLastPosition) {
          clearResumePosition(mediaKey);
        }
        openLearningMiniPlayerSession({
          ...session,
          lessonTitle: newLesson[1],
          lessonIndex: lessonIndex >= 0 ? lessonIndex + 1 : undefined,
          totalLessons: lessonSequence.length,
          selectedLesson: lessonNumber,
          source: {
            src: manifestUrl,
            type: "application/x-mpegurl",
            startTime: 0,
          },
          mediaKey,
          currentTime: 0,
          playing: true,
          lessonPath,
        });
      };

      const cachedBootstrap = getCachedVideoPlaybackBootstrap({
        courseSlug,
        lessonNumber,
      });
      if (cachedBootstrap) {
        openLesson(cachedBootstrap.manifestUrl, cachedBootstrap.mediaKey);
        return;
      }

      // Lessons only play from their API manifest, so switch once it is known
      // instead of starting the new lesson with a placeholder source.
      void getVideoPlaybackBootstrap({ courseSlug, lessonNumber })
        .then((bootstrap) => {
          const current = getLearningMiniPlayerSnapshot();
          if (
            current &&
            current.courseSlug === courseSlug &&
            requestedLessonRef.current === lessonNumber
          ) {
            openLesson(bootstrap.manifestUrl, bootstrap.mediaKey);
          }
        })
        .catch(() => undefined);
    },
    [curriculumLessonsById, lessonSequence, session],
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

  const watchTimeCourseKeyRef = useRef(progressCourseKey);
  useEffect(() => {
    watchTimeCourseKeyRef.current = progressCourseKey;
  }, [progressCourseKey]);
  const [trackWatchTime] = useState(() =>
    createWatchTimeTracker((seconds) => {
      const courseKey = watchTimeCourseKeyRef.current;
      if (courseKey) addWatchedSeconds(courseKey, seconds);
    }),
  );
  // Sent on a timer as well as with progress: a lesson replayed after it
  // is complete moves no progress to carry it.
  useEffect(() => {
    if (!progressTarget) return undefined;
    const interval = window.setInterval(
      () => syncDetachedWatchTime(progressTarget),
      15_000,
    );
    return () => window.clearInterval(interval);
  }, [progressTarget]);

  const handleEvent = useCallback(
    (event: VideoPlayerEvent) => {
      trackWatchTime(event);
      if (event.type === "timeupdate") {
        currentTimeRef.current = event.detail.currentTime;
        // Saved as the lesson plays, not only on pause: a reload or a
        // closed tab gives no chance to save the position afterwards.
        const now = Date.now();
        if (
          !lessonEndedRef.current &&
          now - lastResumePersistAtRef.current >= RESUME_PERSIST_INTERVAL_MS
        ) {
          lastResumePersistAtRef.current = now;
          writeResumePosition(session.mediaKey, event.detail.currentTime);
        }
        if (event.detail.duration > 0) {
          recordProgress(
            (event.detail.currentTime / event.detail.duration) * 100,
          );
        }
      } else if (event.type === "playing") {
        lessonEndedRef.current = false;
        completePreparation();
      } else if (event.type === "seeked") {
        lessonEndedRef.current = false;
        completePreparation();
      } else if (event.type === "pause") {
        persistCurrentTime();
      } else if (event.type === "ended") {
        lessonEndedRef.current = true;
        clearResumePosition(session.mediaKey);
        recordProgress(100);
      }
    },
    [
      completePreparation,
      persistCurrentTime,
      recordProgress,
      session.mediaKey,
      trackWatchTime,
    ],
  );

  const handleReady = useCallback(() => {
    if (preparing && preparationStartedRef.current) return;
    if (preparing) preparationStartedRef.current = true;
    const livePlayback = session.getLivePlaybackSnapshot?.() ?? {
      currentTime: startTime,
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
  }, [completePreparation, preparing, session, startTime]);

  useEffect(
    () => () => {
      persistCurrentTime();
    },
    [persistCurrentTime],
  );

  // The last few seconds before the page goes away (reload, closed tab).
  useEffect(() => {
    const persistOnPageHide = () => {
      persistCurrentTime();
    };
    window.addEventListener("pagehide", persistOnPageHide);
    return () => window.removeEventListener("pagehide", persistOnPageHide);
  }, [persistCurrentTime]);

  // A session read back from storage after a reload has lost the part of its
  // source that authorises each video request (a function cannot be stored),
  // and the access token it was started with has expired. Played as stored,
  // a protected lesson failed with "connection was interrupted" until it was
  // closed and opened again. Fresh playback details are fetched first, and
  // the source is rebuilt the way the lesson page builds it.
  const sourceAuthorisesRequests =
    typeof session.source.networking?.requestFilter === "function";
  const playbackCourseSlug = session.courseSlug;
  const playbackLessonNumber = session.selectedLesson;
  const needsPlaybackBootstrap =
    !sourceAuthorisesRequests &&
    Boolean(playbackCourseSlug) &&
    playbackLessonNumber !== undefined;
  const [fetchedBootstrap, setFetchedBootstrap] = useState<{
    mediaKey: string;
    bootstrap: VideoPlaybackBootstrap | null;
  } | null>(null);
  const sessionMediaKey = session.mediaKey;
  useEffect(() => {
    if (
      !needsPlaybackBootstrap ||
      !playbackCourseSlug ||
      playbackLessonNumber === undefined
    ) {
      return undefined;
    }
    let cancelled = false;
    void getVideoPlaybackBootstrap({
      courseSlug: playbackCourseSlug,
      lessonNumber: playbackLessonNumber,
    }).then(
      (bootstrap) => {
        if (!cancelled) {
          setFetchedBootstrap({ mediaKey: sessionMediaKey, bootstrap });
        }
      },
      () => {
        // Could not be fetched: fall back to the stored source, which still
        // plays a lesson that needs no token.
        if (!cancelled) {
          setFetchedBootstrap({ mediaKey: sessionMediaKey, bootstrap: null });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [
    needsPlaybackBootstrap,
    playbackCourseSlug,
    playbackLessonNumber,
    sessionMediaKey,
  ]);
  const settledBootstrap =
    fetchedBootstrap?.mediaKey === sessionMediaKey ? fetchedBootstrap : null;
  const awaitingPlaybackBootstrap =
    needsPlaybackBootstrap && settledBootstrap === null;
  const playbackBootstrap = settledBootstrap?.bootstrap ?? null;
  const playerSource = useMemo<VideoSource>(() => {
    if (
      !playbackBootstrap ||
      !playbackCourseSlug ||
      playbackLessonNumber === undefined
    ) {
      return { ...session.source, startTime };
    }
    return createLearningLessonVideoSource({
      media: {
        fileName: sessionMediaKey,
        src: playbackBootstrap.manifestUrl,
        duration:
          playbackBootstrap.duration ?? session.source.metadata?.duration ?? 0,
      },
      lessonTitle: session.lessonTitle,
      mediaKey: sessionMediaKey,
      startTime,
      protectedPlayback: playbackBootstrap.source === "paid-bootstrap-api",
      segmentToken: playbackBootstrap.segmentToken,
      segmentTokenExpiresAt: playbackBootstrap.segmentTokenExpiresAt,
      refreshSegmentToken: playbackBootstrap.segmentToken
        ? () =>
            refreshVideoPlaybackToken({
              courseSlug: playbackCourseSlug,
              lessonNumber: playbackLessonNumber,
            })
        : undefined,
    });
  }, [
    playbackBootstrap,
    playbackCourseSlug,
    playbackLessonNumber,
    session.lessonTitle,
    session.source,
    sessionMediaKey,
    startTime,
  ]);

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
      <MiniPlayerReadingModeEffects />
      {awaitingPlaybackBootstrap ? (
        <div className="aspect-video w-full bg-black text-white/70">
          <CenteredLoadingSpinner
            label="Loading video"
            className="h-full w-full"
            size={22}
          />
        </div>
      ) : (
        <VideoPlayer
          ref={playerRef}
          source={playerSource}
          theme={playerTheme}
          engine="shaka"
          autoPlay={preparing ? false : session.playing}
          keyboardEnabled={false}
          zoomEnabled={false}
          mediaProps={{ muted: preparing || session.muted }}
          onReady={handleReady}
          onEvent={handleEvent}
          onErrorOverlayClose={handleClose}
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
      )}
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
            sections={curriculumSections}
            lessonsById={curriculumLessonsById}
            selectedLesson={selectedLesson}
            lessonProgress={lessonProgress}
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
