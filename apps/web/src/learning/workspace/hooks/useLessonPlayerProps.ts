import type { getRightPanelShortcutLabel } from "../../../keyboardShortcuts";
import { useCallback, useEffect, useMemo, useRef, type JSX } from "react";
import type {
  LessonPlayerMinimizeGestureState,
  LessonVideoPlayerProps,
  NextLessonInfo,
} from "../../player";
import type { LearningMiniPlayerRequest } from "../../player/learningMiniPlayerTypes";
import { type Lesson, createLessonVideo } from "../../courseContent";
import { mediaService } from "../../../services/media";
import {
  VideoPlaybackBootstrapError,
  getVideoPlaybackBootstrap,
} from "../../videoPlaybackBootstrap";
import { preloadLessonPlayback } from "../../earlyHlsPreload";
import type { VideoPlaybackBootstrap } from "@veolms/contracts";
import type { CourseLesson } from "@veolms/contracts";
import type { LessonAudioSource } from "./useLessonStagePlan";
import type { useSecondPressHold } from "../../../gestures/useSecondPressHold";
import type { OctopusKind } from "../../../components/OctopusIllustration";

/** How long a lesson plays before its neighbours' bootstraps are fetched. */
const NEIGHBOUR_BOOTSTRAP_DELAY_MS = 2_500;

export interface UseLessonPlayerPropsArgs {
  /** An audio lesson's file, played in the player (see useLessonStagePlan). */
  audioSource?: LessonAudioSource | null;
  retryAudioSource?: () => void;
  /** The audio file's address is on its way. */
  audioSourcePending?: boolean;
  courseSlug: string | undefined;
  onMinimizePlayer: ((request: LearningMiniPlayerRequest) => void) | undefined;
  onMiniPlayerRestoreReady: (() => void) | undefined;
  selectedLesson: number;
  autoPlayOnLessonChange: boolean;
  autoplayEnabled: boolean;
  courseTitle: string;
  coursePersistenceKey: string;
  lessonDrawer: boolean;
  courseContentDrawerViewport: boolean;
  phoneLessonDrawer: boolean;
  curriculumCollapsed: boolean;
  theaterMode: boolean;
  chaptersPanelHost: HTMLDivElement | null;
  updatePlayerMinimizeGesture: (
    state: LessonPlayerMinimizeGestureState,
  ) => void;
  currentLesson: Lesson;
  playbackBootstrapError: VideoPlaybackBootstrapError | null;
  showingQuiz: boolean;
  protectedPlayback: boolean;
  playbackBootstrap: VideoPlaybackBootstrap | null;
  refreshPlaybackToken: () => Promise<{ token: string; expiresAt: number }>;
  retryPlaybackBootstrap: () => void;
  playbackAccessError:
    | {
        kind: "login" | "access" | "retry" | "notice";
        message: string;
        actionLabel: string;
        onAction?: () => void;
        title?: string;
        link?: { label: string; href: string };
        illustration?: OctopusKind;
        article?: string;
      }
    | null
    | undefined;
  lessonTextPending: boolean;
  playbackBootstrapPending: boolean;
  lessonSequence: number[];
  courseComplete: boolean;
  currentLessonIndex: number;
  previousLessonId: number | undefined;
  nextLessonId: number | undefined;
  courseThumbnail: string | undefined;
  nextLessonInfo: NextLessonInfo | undefined;
  shortPlayer: boolean;
  seekTimeOnly: boolean;
  selectedLessonRecord: CourseLesson | null;
  selectedLessonDescription: string | null;
  curriculumShortcutLabel: ReturnType<typeof getRightPanelShortcutLabel>;
  updateAutoplayEnabled: (enabled: boolean) => void;
  goToPreviousLesson: () => void;
  goToNextLesson: () => void;
  updateSelectedLessonProgress: (progress: number) => void;
  handleLessonEnded: () => void;
  /** Opens the selected lesson's quiz; left out when it has none. */
  openSelectedLessonQuiz: (() => void) | undefined;
  toggleTheaterMode: () => void;
  toggleLessonDrawerFromPlayer: (presentation: "drawer" | "side") => void;
  handleMobileLandscapeFullscreenChange: (active: boolean) => void;
  playerCourseLessonsSidePanel: boolean;
  playerCourseLessonsSecondPressHold:
    | {
        isSecondPressHolding: boolean;
        handlers: ReturnType<
          typeof useSecondPressHold<HTMLButtonElement>
        >["handlers"];
      }
    | undefined;
  playerCourseLessonsOpen: boolean;
  fullscreenVideoLayoutWidthPercent: number;
  fullscreenCoursePanel: JSX.Element;
}

export interface UseLessonPlayerPropsResult {
  seekCurrentLessonToTimestamp: (seconds: number) => void;
  lessonPlayerProps: LessonVideoPlayerProps;
}

export function useLessonPlayerProps({
  courseSlug,
  onMinimizePlayer,
  onMiniPlayerRestoreReady,
  selectedLesson,
  autoPlayOnLessonChange,
  autoplayEnabled,
  courseTitle,
  coursePersistenceKey,
  lessonDrawer,
  courseContentDrawerViewport,
  phoneLessonDrawer,
  curriculumCollapsed,
  theaterMode,
  chaptersPanelHost,
  updatePlayerMinimizeGesture,
  currentLesson,
  playbackBootstrapError,
  showingQuiz,
  protectedPlayback,
  playbackBootstrap,
  refreshPlaybackToken,
  retryPlaybackBootstrap,
  playbackAccessError,
  lessonTextPending,
  playbackBootstrapPending,
  lessonSequence,
  courseComplete,
  currentLessonIndex,
  previousLessonId,
  nextLessonId,
  courseThumbnail,
  nextLessonInfo,
  shortPlayer,
  seekTimeOnly,
  selectedLessonRecord,
  selectedLessonDescription,
  curriculumShortcutLabel,
  updateAutoplayEnabled,
  goToPreviousLesson,
  goToNextLesson,
  updateSelectedLessonProgress,
  handleLessonEnded,
  openSelectedLessonQuiz,
  toggleTheaterMode,
  toggleLessonDrawerFromPlayer,
  handleMobileLandscapeFullscreenChange,
  playerCourseLessonsSidePanel,
  playerCourseLessonsSecondPressHold,
  playerCourseLessonsOpen,
  fullscreenVideoLayoutWidthPercent,
  fullscreenCoursePanel,
  audioSource = null,
  retryAudioSource,
  audioSourcePending = false,
}: UseLessonPlayerPropsArgs): UseLessonPlayerPropsResult {
  const lessonPlayerSeekRef = useRef<((seconds: number) => void) | null>(null);
  const registerLessonPlayerSeek = useCallback(
    (seekToTimestamp: (seconds: number) => void) => {
      lessonPlayerSeekRef.current = seekToTimestamp;
      return () => {
        if (lessonPlayerSeekRef.current === seekToTimestamp) {
          lessonPlayerSeekRef.current = null;
        }
      };
    },
    [],
  );
  const seekCurrentLessonToTimestamp = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    lessonPlayerSeekRef.current?.(seconds);
  }, []);

  // In the lesson's last minute the next one is preloaded once, so autoplay
  // or "Next" starts it from memory. Not earlier: a learner who stops halfway
  // through a long lesson should not pay for the next one.
  const preloadedNextLessonRef = useRef<string | null>(null);
  const handleNearLessonEnd = useCallback(() => {
    if (!courseSlug || nextLessonId === undefined || showingQuiz) return;
    const preloadKey = `${courseSlug}:${selectedLesson}:${nextLessonId}`;
    if (preloadedNextLessonRef.current === preloadKey) return;
    preloadedNextLessonRef.current = preloadKey;
    void preloadLessonPlayback(courseSlug, nextLessonId);
  }, [courseSlug, nextLessonId, selectedLesson, showingQuiz]);

  // The next and previous lessons' bootstraps (a few hundred bytes, no
  // video) are fetched once this lesson has had a moment to start, so
  // "Next", "Previous" and autoplay open them without a round trip to the
  // API first: 0.3-1 s of black on production.
  useEffect(() => {
    if (!courseSlug || showingQuiz) return;
    const neighbours = [nextLessonId, previousLessonId].filter(
      (id): id is number => id !== undefined,
    );
    if (neighbours.length === 0) return;
    const timer = window.setTimeout(() => {
      for (const lessonNumber of neighbours) {
        void getVideoPlaybackBootstrap({ courseSlug, lessonNumber }).catch(
          () => undefined,
        );
      }
    }, NEIGHBOUR_BOOTSTRAP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [courseSlug, nextLessonId, previousLessonId, showingQuiz]);

  const currentLessonTitle = currentLesson[1];
  const selectedLessonDurationSeconds = selectedLessonRecord?.durationSeconds;
  const selectedLessonMediaId = selectedLessonRecord?.contentMediaId;
  // A locked lesson (one waiting for the learner to sign in or to get the
  // course) shows the course's picture behind its lock, a video lesson as
  // much as a reading: the course is what is being unlocked, and a locked
  // video's own still is not served to whoever may not watch it.
  const lessonLocked =
    playbackAccessError?.kind === "login" ||
    playbackAccessError?.kind === "access";
  const currentLessonMedia = useMemo(() => {
    // An audio lesson plays its file as it is; its artwork stands where a
    // video's picture would (see `audioOnly`).
    if (audioSource) {
      return {
        ...createLessonVideo(currentLessonTitle, {
          durationSeconds: selectedLessonDurationSeconds,
        }),
        src: audioSource.url,
        mimeType: audioSource.mimeType,
      };
    }
    return createLessonVideo(currentLessonTitle, {
      durationSeconds: selectedLessonDurationSeconds,
      thumbnailSrc:
        selectedLessonMediaId && !lessonLocked
          ? mediaService.getVideoThumbnailUrl(selectedLessonMediaId)
          : courseThumbnail,
    });
  }, [
    audioSource,
    courseThumbnail,
    currentLessonTitle,
    lessonLocked,
    selectedLessonDurationSeconds,
    selectedLessonMediaId,
  ]);

  const lessonPlayerProps = useMemo<LessonVideoPlayerProps>(
    () => ({
      shortPlayer,
      seekTimeOnly,
      media: currentLessonMedia,
      description: selectedLessonDescription,
      // An audio lesson's file needs no manifest or token: it is the file.
      playbackBootstrap: audioSource ? null : playbackBootstrap,
      playbackAccessError,
      // An audio lesson's file address on its way shows the player's loader
      // (not a reading's text to come).
      playbackBootstrapPending:
        playbackBootstrapPending || lessonTextPending || audioSourcePending,
      readingPending: lessonTextPending,
      playbackUnavailableMessage: audioSource
        ? null
        : (playbackBootstrapError?.message ?? null),
      // An address that expired is replaced by a new one.
      onRetryPlayback: audioSource ? retryAudioSource : retryPlaybackBootstrap,
      refreshPlaybackToken,
      protectedPlayback: audioSource ? false : protectedPlayback,
      audioOnly: Boolean(audioSource),
      audioAnalysable: audioSource?.analysable ?? false,
      lessonTitle: currentLesson[1],
      lessonId:
        currentLesson[6] ??
        selectedLessonRecord?.id ??
        playbackBootstrap?.lessonId,
      watchTimeCourseKey: courseSlug,
      courseTitle,
      lessonIndex: currentLessonIndex >= 0 ? currentLessonIndex + 1 : 1,
      totalLessons: lessonSequence.length,
      theaterMode,
      onTheaterToggle: toggleTheaterMode,
      autoPlayOnMediaChange: showingQuiz ? false : autoPlayOnLessonChange,
      autoplayEnabled,
      playbackSuspended: showingQuiz,
      canGoNext: nextLessonId !== undefined,
      canGoPrevious: previousLessonId !== undefined,
      nextLessonInfo,
      courseComplete,
      courseLessonsOpen: playerCourseLessonsOpen,
      courseLessonsDrawerOpen: lessonDrawer,
      courseLessonsPanel: fullscreenCoursePanel,
      courseLessonsSecondPressHold: playerCourseLessonsSecondPressHold,
      courseLessonsShortcutLabel: curriculumShortcutLabel,
      courseLessonsSidePanel: playerCourseLessonsSidePanel,
      courseLessonsBottomSheet: phoneLessonDrawer,
      courseLessonsVideoWidthPercent: fullscreenVideoLayoutWidthPercent,
      // Only a visible content column can host the chapters panel; otherwise
      // the player slides it over its own right edge.
      chaptersPanelHost:
        curriculumCollapsed || theaterMode || courseContentDrawerViewport
          ? null
          : chaptersPanelHost,
      onAutoplayEnabledChange: updateAutoplayEnabled,
      onCourseLessonsToggle: toggleLessonDrawerFromPlayer,
      onGoNext: goToNextLesson,
      onGoPrevious: goToPreviousLesson,
      onLessonEnded: handleLessonEnded,
      onAttemptQuiz: openSelectedLessonQuiz,
      onMinimize: onMinimizePlayer
        ? (request) => {
            onMinimizePlayer({
              ...request,
              courseSlug,
              selectedLesson,
            });
          }
        : undefined,
      onMinimizeGestureChange: updatePlayerMinimizeGesture,
      onMiniPlayerRestoreReady,
      onMobileLandscapeFullscreenChange: handleMobileLandscapeFullscreenChange,
      onProgressChange: updateSelectedLessonProgress,
      onNearLessonEnd: handleNearLessonEnd,
      onSeekToTimestampReady: registerLessonPlayerSeek,
      resumePersistenceKey: `${coursePersistenceKey}-lesson-${selectedLesson}`,
    }),
    [
      shortPlayer,
      seekTimeOnly,
      autoPlayOnLessonChange,
      autoplayEnabled,
      audioSource,
      retryAudioSource,
      audioSourcePending,
      chaptersPanelHost,
      courseComplete,
      courseContentDrawerViewport,
      coursePersistenceKey,
      courseSlug,
      courseTitle,
      curriculumCollapsed,
      currentLesson,
      currentLessonMedia,
      currentLessonIndex,
      curriculumShortcutLabel,
      fullscreenCoursePanel,
      fullscreenVideoLayoutWidthPercent,
      goToNextLesson,
      goToPreviousLesson,
      handleLessonEnded,
      openSelectedLessonQuiz,
      handleMobileLandscapeFullscreenChange,
      lessonDrawer,
      lessonSequence.length,
      lessonTextPending,
      nextLessonId,
      nextLessonInfo,
      onMiniPlayerRestoreReady,
      onMinimizePlayer,
      playbackBootstrap,
      playbackAccessError,
      playbackBootstrapPending,
      playbackBootstrapError,
      protectedPlayback,
      registerLessonPlayerSeek,
      retryPlaybackBootstrap,
      refreshPlaybackToken,
      playerCourseLessonsOpen,
      playerCourseLessonsSecondPressHold,
      playerCourseLessonsSidePanel,
      phoneLessonDrawer,
      previousLessonId,
      selectedLesson,
      selectedLessonRecord?.id,
      selectedLessonDescription,
      showingQuiz,
      theaterMode,
      toggleLessonDrawerFromPlayer,
      toggleTheaterMode,
      updateAutoplayEnabled,
      updatePlayerMinimizeGesture,
      updateSelectedLessonProgress,
      handleNearLessonEnd,
    ],
  );
  return {
    seekCurrentLessonToTimestamp,
    lessonPlayerProps,
  };
}
