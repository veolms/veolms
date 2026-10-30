import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { LessonResource } from "@veolms/contracts";
import { type Lesson, createLessonsById } from "../../courseContent";
import { useCourseQuizAssignments } from "../../../services/quizzes/quizzes.queries";
import {
  adaptCourseOverviewToCurriculum,
  type AdaptedCurriculum,
  type AdaptedCurriculumSection,
} from "../../courseCurriculumAdapter";
import { VideoPlaybackBootstrapError } from "../../videoPlaybackBootstrap";
import { COURSE_CONTENT_DRAWER_QUERY } from "../workspaceConstants";
import { safeResumeVideo } from "../workspaceDom";
import type { MyQuizAssignment } from "@veolms/contracts";
import type { useCourseOverview } from "../../../services/courses";

export interface UseCurriculumModelArgs {
  initialLessonView: "video" | "quiz";
  quizAssignment: MyQuizAssignment | null;
  quizAssignments: readonly MyQuizAssignment[] | null;
  isAuthenticated: boolean;
  courseOverview: ReturnType<typeof useCourseOverview>["data"];
  selectedLesson: number;
  autoPlayOnLessonChange: boolean;
  playerWrapRef: RefObject<HTMLDivElement | null>;
}

export interface UseCurriculumModelResult {
  isCourseContentDrawerLayout: () => boolean;
  adaptedCurriculum: AdaptedCurriculum | null;
  curriculumSections: AdaptedCurriculumSection[];
  curriculumLessonsById: Map<number, Lesson>;
  firstCurriculumLessonId: number | undefined;
  currentLesson: Lesson;
  playbackBootstrapError: VideoPlaybackBootstrapError | null;
  setPlaybackBootstrapError: Dispatch<
    SetStateAction<VideoPlaybackBootstrapError | null>
  >;
  courseAccessRefused: boolean;
  courseQuizAssignments: ReturnType<typeof useCourseQuizAssignments>;
  setActiveLessonView: Dispatch<SetStateAction<"video" | "quiz">>;
  hasLessonQuiz: (lessonNumber: number) => boolean;
  curriculumLessonResources: Map<
    number,
    readonly {
      id: string;
      mediaAssetId: string;
      title: string;
      mediaAsset?:
        | {
            originalFilename: string;
            mimeType: string;
            sizeBytes: number;
            status:
              "uploading" | "uploaded" | "processing" | "ready" | "failed";
          }
        | undefined;
    }[]
  >;
  curriculumQuizLessonNumbers: Set<number>;
  currentLessonUuid: string | undefined;
  currentQuizAssignment:
    | MyQuizAssignment
    | {
        id: string;
        courseId: string;
        quizTitle: string;
        maxAttempts: number;
        activeAttemptId: null;
        attemptCount: number;
        bestScore: null;
        latestPassed: null;
      }
    | null;
  isDedicatedQuizLesson: boolean;
  showingQuiz: boolean;
}

export function useCurriculumModel({
  initialLessonView,
  quizAssignment,
  quizAssignments,
  isAuthenticated,
  courseOverview,
  selectedLesson,
  autoPlayOnLessonChange,
  playerWrapRef,
}: UseCurriculumModelArgs): UseCurriculumModelResult {
  const isCourseContentDrawerLayout = useCallback(
    () => window.matchMedia(COURSE_CONTENT_DRAWER_QUERY).matches,
    [],
  );

  const adaptedCurriculum = useMemo(() => {
    if (!courseOverview) return null;
    return adaptCourseOverviewToCurriculum(courseOverview);
  }, [courseOverview]);

  const curriculumSections = useMemo(
    () => adaptedCurriculum?.sections ?? [],
    [adaptedCurriculum],
  );
  const curriculumLessonsById = useMemo(
    () => createLessonsById(curriculumSections),
    [curriculumSections],
  );
  const firstCurriculumLessonId = curriculumSections
    .find(({ lessons }) => lessons.length > 0)
    ?.lessons.at(0)?.[0];
  const firstCurriculumLesson = firstCurriculumLessonId
    ? curriculumLessonsById.get(firstCurriculumLessonId)
    : undefined;
  const fallbackEmptyLesson = useMemo<Lesson>(
    () => [selectedLesson || 1, "", "", "todo"],
    [selectedLesson],
  );
  const currentLesson =
    curriculumLessonsById.get(selectedLesson) ||
    firstCurriculumLesson ||
    fallbackEmptyLesson;
  const [playbackBootstrapError, setPlaybackBootstrapError] =
    useState<VideoPlaybackBootstrapError | null>(null);
  // The server has just refused this account the lesson's video because it
  // has no access to the course. It refuses the course's quizzes on the same
  // grounds, and its progress too when the course is sold or restricted, so
  // neither is asked for only to be told so again.
  const courseAccessRefused =
    playbackBootstrapError?.code === "COURSE_ACCESS_DENIED";
  const courseQuizAssignments = useCourseQuizAssignments(
    courseOverview?.course.id,
    { enabled: isAuthenticated && !courseAccessRefused },
  );
  const [activeLessonView, setActiveLessonView] = useState<"video" | "quiz">(
    initialLessonView,
  );

  useEffect(() => {
    setActiveLessonView((currentView) =>
      currentView === initialLessonView ? currentView : initialLessonView,
    );
  }, [initialLessonView]);

  const getLessonUuid = useCallback(
    (lessonNumber: number): string | undefined => {
      const les = curriculumLessonsById.get(lessonNumber);
      if (les && les[6]) return les[6];
      return adaptedCurriculum?.lessonsByNumber.get(lessonNumber)?.id;
    },
    [curriculumLessonsById, adaptedCurriculum],
  );

  const hasLessonQuiz = useCallback(
    (lessonNumber: number): boolean => {
      const lesson = curriculumLessonsById.get(lessonNumber);
      if (lesson?.[5] === "quiz") return true;
      const uuid = getLessonUuid(lessonNumber);
      if (!uuid) {
        return lessonNumber === selectedLesson
          ? Boolean(quizAssignment)
          : false;
      }
      return Boolean(
        quizAssignments?.some((a) => a.lessonId === uuid) ||
        courseQuizAssignments.data?.some((a) => a.lessonId === uuid) ||
        (lessonNumber === selectedLesson &&
          quizAssignment &&
          (!quizAssignment.lessonId || quizAssignment.lessonId === uuid)),
      );
    },
    [
      curriculumLessonsById,
      getLessonUuid,
      selectedLesson,
      quizAssignment,
      quizAssignments,
      courseQuizAssignments.data,
    ],
  );

  const curriculumLessonResources = useMemo(() => {
    const resourcesByLesson = new Map<number, readonly LessonResource[]>();
    for (const [lessonNumber, lesson] of adaptedCurriculum?.lessonsByNumber ??
      []) {
      if (lesson.resources?.length) {
        resourcesByLesson.set(lessonNumber, lesson.resources);
      }
    }
    return resourcesByLesson;
  }, [adaptedCurriculum]);
  const curriculumQuizLessonNumbers = useMemo(
    () =>
      new Set(
        [...curriculumLessonsById.keys()].filter((lessonNumber) =>
          hasLessonQuiz(lessonNumber),
        ),
      ),
    [curriculumLessonsById, hasLessonQuiz],
  );

  const currentLessonUuid = getLessonUuid(selectedLesson);
  const currentQuizAssignment = useMemo(() => {
    if (currentLessonUuid && quizAssignments) {
      const found = quizAssignments.find(
        (a) => a.lessonId === currentLessonUuid,
      );
      if (found) return found;
    }
    if (currentLessonUuid && courseQuizAssignments.data) {
      const foundCourse = courseQuizAssignments.data.find(
        (a) => a.lessonId === currentLessonUuid,
      );
      if (foundCourse) {
        // Only what the attempt panel is given; this list carries no
        // attempt state, so the panel starts without an active attempt.
        return {
          id: foundCourse.id,
          courseId: foundCourse.courseId,
          quizTitle: foundCourse.quizTitle,
          maxAttempts: foundCourse.maxAttempts,
          activeAttemptId: null,
          attemptCount: 0,
          bestScore: null,
          latestPassed: null,
        };
      }
    }
    if (
      quizAssignment &&
      (!currentLessonUuid || quizAssignment.lessonId === currentLessonUuid)
    ) {
      return quizAssignment;
    }
    return null;
  }, [
    currentLessonUuid,
    quizAssignments,
    courseQuizAssignments.data,
    quizAssignment,
  ]);

  const isDedicatedQuizLesson = currentLesson[5] === "quiz";
  const hasQuizContent =
    Boolean(currentQuizAssignment) ||
    (isDedicatedQuizLesson && !currentLessonUuid);
  const showingQuiz = activeLessonView === "quiz";
  const isQuizLesson = showingQuiz;

  useLayoutEffect(() => {
    const main = playerWrapRef.current?.closest<HTMLElement>(".courses-main");
    if (!main) return;
    if (showingQuiz) {
      main.setAttribute("data-learning-quiz-active", "true");
      const video = document.querySelector<HTMLVideoElement>(
        "video:not([data-player-standby])",
      );
      if (video && !video.paused) {
        video.pause();
      }
    } else {
      main.removeAttribute("data-learning-quiz-active");
      if (autoPlayOnLessonChange) {
        const video = document.querySelector<HTMLVideoElement>(
          "video:not([data-player-standby])",
        );
        safeResumeVideo(video);
      }
    }
    return () => {
      main.removeAttribute("data-learning-quiz-active");
    };
  }, [autoPlayOnLessonChange, showingQuiz, playerWrapRef]);

  useEffect(() => {
    if (!showingQuiz) return;

    const pauseAllMedia = () => {
      if (typeof document === "undefined") return;
      const mediaElements =
        document.querySelectorAll<HTMLMediaElement>("video, audio");
      for (const el of mediaElements) {
        if (!el.paused && typeof el.pause === "function") {
          try {
            el.pause();
          } catch {
            // ignore error
          }
        }
      }
    };

    pauseAllMedia();

    const handlePlayCapture = (event: Event) => {
      const target = event.target;
      if (
        target instanceof HTMLMediaElement &&
        typeof target.pause === "function"
      ) {
        try {
          target.pause();
        } catch {
          // ignore error
        }
      }
    };

    window.addEventListener("play", handlePlayCapture, true);
    window.addEventListener("playing", handlePlayCapture, true);

    return () => {
      window.removeEventListener("play", handlePlayCapture, true);
      window.removeEventListener("playing", handlePlayCapture, true);
    };
  }, [showingQuiz]);
  return {
    isCourseContentDrawerLayout,
    adaptedCurriculum,
    curriculumSections,
    curriculumLessonsById,
    firstCurriculumLessonId,
    currentLesson,
    playbackBootstrapError,
    setPlaybackBootstrapError,
    courseAccessRefused,
    courseQuizAssignments,
    setActiveLessonView,
    hasLessonQuiz,
    curriculumLessonResources,
    curriculumQuizLessonNumbers,
    currentLessonUuid,
    currentQuizAssignment,
    isDedicatedQuizLesson,
    showingQuiz,
  };
}
