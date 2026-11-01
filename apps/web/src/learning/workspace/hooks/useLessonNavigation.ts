import {
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import { publishLearningPlayerBootstrap } from "../../learningPlayerPreferences";
import { writeAutoplayPreference } from "../../player/lessonPlayerPersistence";
import type { Lesson } from "../../courseContent";
import type { LessonStagePlan } from "../../lessonWithoutVideo";
import {
  getPhoneLessonDrawerCollapsedSnapPoint,
  getSideLessonDrawerBounds,
} from "../../useLessonDrawerHeroControl";
import {
  LESSON_DRAWER_FALLBACK_SNAP_POINT,
  LESSON_PROGRESS_COMPLETE_THRESHOLD,
} from "../workspaceConstants";
import { safeResumeVideo } from "../workspaceDom";
import { getVideoPlaybackBootstrap } from "../../videoPlaybackBootstrap";

export interface UseLessonNavigationArgs {
  lessonId: number;
  courseSlug: string | undefined;
  onSelectLesson: (lessonId: number, view?: "video" | "quiz") => void;
  selectedLesson: number;
  setSelectedLesson: Dispatch<SetStateAction<number>>;
  pendingLessonSelectionRef: RefObject<number | null>;
  setLocalLessonProgress: Dispatch<SetStateAction<Record<number, number>>>;
  setAutoPlayOnLessonChange: Dispatch<SetStateAction<boolean>>;
  setAutoplayEnabled: Dispatch<SetStateAction<boolean>>;
  lessonDrawer: boolean;
  setLessonDrawer: Dispatch<SetStateAction<boolean>>;
  phoneLessonDrawer: boolean;
  playerWrapRef: RefObject<HTMLDivElement | null>;
  curriculumLessonsById: Map<number, Lesson>;
  firstCurriculumLessonId: number | undefined;
  setActiveLessonView: Dispatch<SetStateAction<"video" | "quiz">>;
  hasLessonQuiz: (lessonNumber: number) => boolean;
  lessonStagePlan: LessonStagePlan;
  recordProgress: (lessonNumber: number, progressPercent: number) => void;
  previousLessonId: number | undefined;
  nextLessonId: number | undefined;
}

export interface UseLessonNavigationResult {
  getLessonDrawerCollapsedSnapPoint: () => number;
  getLessonDrawerViewportBounds: (preferredWidth: number) => {
    top: number;
    bottom: number;
    borderRadius: string;
    left: number;
    width: number;
  } | null;
  resumeLessonVideoPlayback: () => void;
  selectLesson: (lessonNumber: number, view?: "video" | "quiz") => void;
  handleOpenLessonQuiz: (lessonNumber: number) => void;
  updateAutoplayEnabled: (enabled: boolean) => void;
  goToPreviousLesson: () => void;
  goToNextLesson: () => void;
  updateSelectedLessonProgress: (progress: number) => void;
  handleLessonEnded: () => void;
}

export function useLessonNavigation({
  lessonId,
  onSelectLesson,
  selectedLesson,
  setSelectedLesson,
  pendingLessonSelectionRef,
  setLocalLessonProgress,
  setAutoPlayOnLessonChange,
  setAutoplayEnabled,
  lessonDrawer,
  setLessonDrawer,
  phoneLessonDrawer,
  playerWrapRef,
  curriculumLessonsById,
  firstCurriculumLessonId,
  setActiveLessonView,
  hasLessonQuiz,
  lessonStagePlan,
  recordProgress,
  previousLessonId,
  nextLessonId,
  courseSlug,
}: UseLessonNavigationArgs): UseLessonNavigationResult {
  const getLessonDrawerCollapsedSnapPoint = useCallback(() => {
    return getPhoneLessonDrawerCollapsedSnapPoint(
      window.innerHeight,
      playerWrapRef.current?.getBoundingClientRect().bottom,
      LESSON_DRAWER_FALLBACK_SNAP_POINT,
    );
  }, [playerWrapRef]);

  const getLessonDrawerViewportBounds = useCallback(
    (preferredWidth: number) => {
      if (phoneLessonDrawer) return null;

      const playerBounds = playerWrapRef.current?.getBoundingClientRect();
      if (
        !playerBounds ||
        !Number.isFinite(playerBounds.left) ||
        !Number.isFinite(playerBounds.width) ||
        playerBounds.width <= 0
      ) {
        return null;
      }

      const mainSurface =
        playerWrapRef.current?.closest<HTMLElement>(".courses-main");
      const frameSurface =
        playerWrapRef.current?.closest<HTMLElement>(".courses-main-frame") ??
        mainSurface;
      const mainSurfaceBounds = mainSurface?.getBoundingClientRect();
      const horizontalSurfaceBounds =
        mainSurfaceBounds && mainSurfaceBounds.width > 0
          ? mainSurfaceBounds
          : playerBounds;
      const sideBounds = getSideLessonDrawerBounds(
        horizontalSurfaceBounds,
        window.innerWidth,
        preferredWidth,
      );
      if (!sideBounds) return null;

      const verticalSurfaceBounds = mainSurfaceBounds ?? playerBounds;
      const readVisibleRadius = (element: HTMLElement | null | undefined) => {
        if (!element) return null;
        const radius = window.getComputedStyle(element).borderTopRightRadius;
        const pixels = Number.parseFloat(radius);
        return Number.isFinite(pixels) && pixels > 0 ? radius : null;
      };

      return {
        ...sideBounds,
        top: Math.max(0, verticalSurfaceBounds.top),
        bottom: Math.max(0, window.innerHeight - verticalSurfaceBounds.bottom),
        borderRadius:
          readVisibleRadius(frameSurface) ??
          readVisibleRadius(mainSurface) ??
          "18px",
      };
    },
    [phoneLessonDrawer, playerWrapRef],
  );

  const resumeLessonVideoPlayback = useCallback(() => {
    setActiveLessonView("video");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("view")) {
        url.searchParams.delete("view");
        window.history.replaceState(
          null,
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
      }
    }
    setAutoPlayOnLessonChange(true);
    requestAnimationFrame(() => {
      const video = document.querySelector<HTMLVideoElement>(
        "video:not([data-player-standby])",
      );
      safeResumeVideo(video);
    });
  }, [setActiveLessonView, setAutoPlayOnLessonChange]);

  const selectLesson = useCallback(
    (lessonNumber: number, view?: "video" | "quiz") => {
      const targetLesson = curriculumLessonsById.get(lessonNumber);
      const isTargetDedicatedQuiz = targetLesson?.[5] === "quiz";
      const targetHasQuiz = hasLessonQuiz(lessonNumber);

      if (
        view === "quiz" ||
        (view === undefined && isTargetDedicatedQuiz && targetHasQuiz)
      ) {
        setActiveLessonView("quiz");
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.set("view", "quiz");
          window.history.replaceState(
            null,
            "",
            `${url.pathname}${url.search}${url.hash}`,
          );
        }
      } else {
        resumeLessonVideoPlayback();
      }
      if (lessonNumber === selectedLesson) return;
      // The lesson's bootstrap is asked for at the click, not once the page
      // has rendered for the new lesson (0.3-0.75 s later on production);
      // the player's own request for it shares this one.
      if (courseSlug && !isTargetDedicatedQuiz && view !== "quiz") {
        void getVideoPlaybackBootstrap({ courseSlug, lessonNumber }).catch(
          () => undefined,
        );
      }
      pendingLessonSelectionRef.current = lessonNumber;
      setSelectedLesson(lessonNumber);
      if (view !== undefined) {
        onSelectLesson(lessonNumber, view);
      } else {
        onSelectLesson(lessonNumber);
      }
    },
    [
      courseSlug,
      curriculumLessonsById,
      hasLessonQuiz,
      onSelectLesson,
      resumeLessonVideoPlayback,
      selectedLesson,
      pendingLessonSelectionRef,
      setActiveLessonView,
      setSelectedLesson,
    ],
  );

  const handleOpenLessonQuiz = useCallback(
    (lessonNumber: number) => {
      setActiveLessonView("quiz");
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("view", "quiz");
        window.history.replaceState(
          null,
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
      }
      if (lessonNumber !== selectedLesson) {
        selectLesson(lessonNumber, "quiz");
      }
      if (phoneLessonDrawer && lessonDrawer) {
        setLessonDrawer(false);
      }
    },
    [
      lessonDrawer,
      phoneLessonDrawer,
      selectLesson,
      selectedLesson,
      setActiveLessonView,
      setLessonDrawer,
    ],
  );

  const updateAutoplayEnabled = useCallback(
    (enabled: boolean) => {
      setAutoplayEnabled(enabled);
      writeAutoplayPreference(enabled);
      publishLearningPlayerBootstrap({ autoplay: enabled });
    },
    [setAutoplayEnabled],
  );

  const goToPreviousLesson = useCallback(() => {
    if (previousLessonId !== undefined) selectLesson(previousLessonId);
  }, [previousLessonId, selectLesson]);

  const goToNextLesson = useCallback(() => {
    if (nextLessonId !== undefined) selectLesson(nextLessonId);
  }, [nextLessonId, selectLesson]);

  const updateSelectedLessonProgress = useCallback(
    (progress: number) => {
      const roundedProgress = Math.max(0, Math.min(100, Math.round(progress)));
      const nextProgress =
        roundedProgress >= LESSON_PROGRESS_COMPLETE_THRESHOLD
          ? 100
          : roundedProgress;
      // Not a transition. On 2026-10-22 one here looped until React stopped
      // with "Maximum update depth exceeded" (error #185) after a seek:
      // every progress change registered the persistent player again, a
      // sync update in the layout's commit; the transition kept losing to
      // those renders and was replayed on each, and `recordProgress` stamped
      // a new time on every replay. Neither holds any more (progress reaches
      // the player through `liveLessonProgress`, and a replayed
      // `recordProgress` gives back the same state); seeking was checked
      // with the transition put back, but it has not been restored.
      setLocalLessonProgress((current) => {
        if (current[selectedLesson] === nextProgress) return current;
        return { ...current, [selectedLesson]: nextProgress };
      });
      // Kept by `recordProgress` under the learner's account; the course
      // cards read it from there (`catalogueCardProgress.ts`).
      recordProgress(selectedLesson, nextProgress);
    },
    [recordProgress, selectedLesson, setLocalLessonProgress],
  );

  const handleLessonEnded = useCallback(() => {
    updateSelectedLessonProgress(100);
  }, [updateSelectedLessonProgress]);

  // A lesson with no video and no quiz has nothing to watch or pass: its
  // title, description and resources are all of it. Opening it is finishing
  // it, so the course can still reach 100%. Recorded once the route and the
  // selection agree on the lesson, for a viewer whose progress the server
  // accepts.
  const selectedLessonCompletesWhenOpened = lessonStagePlan.completesWhenOpened;
  useEffect(() => {
    if (!selectedLessonCompletesWhenOpened || lessonId !== selectedLesson) {
      return;
    }
    updateSelectedLessonProgress(100);
  }, [
    lessonId,
    selectedLesson,
    selectedLessonCompletesWhenOpened,
    updateSelectedLessonProgress,
  ]);

  useEffect(() => {
    const pendingLessonSelection = pendingLessonSelectionRef.current;
    if (pendingLessonSelection !== null) {
      if (lessonId !== pendingLessonSelection) return;
      pendingLessonSelectionRef.current = null;
    }

    const requestedLessonId = lessonId;
    const nextLessonId = curriculumLessonsById.has(requestedLessonId)
      ? requestedLessonId
      : firstCurriculumLessonId;
    if (nextLessonId === undefined || nextLessonId === selectedLesson) return;
    setAutoPlayOnLessonChange(true);
    setSelectedLesson(nextLessonId);
    if (nextLessonId !== lessonId) onSelectLesson(nextLessonId);
  }, [
    curriculumLessonsById,
    firstCurriculumLessonId,
    lessonId,
    onSelectLesson,
    selectedLesson,
    pendingLessonSelectionRef,
    setAutoPlayOnLessonChange,
    setSelectedLesson,
  ]);
  return {
    getLessonDrawerCollapsedSnapPoint,
    getLessonDrawerViewportBounds,
    resumeLessonVideoPlayback,
    selectLesson,
    handleOpenLessonQuiz,
    updateAutoplayEnabled,
    goToPreviousLesson,
    goToNextLesson,
    updateSelectedLessonProgress,
    handleLessonEnded,
  };
}
