import { useEffect, useMemo } from "react";
import type { NextLessonInfo } from "../../player";
import type { Lesson } from "../../courseContent";
import { mediaService } from "../../../services/media";
import { NON_VIDEO_LESSON_LABELS } from "../../lessonWithoutVideo";
import {
  getCourseThumbnail,
  getCourseThumbnailSrcSet,
} from "../../courseMetadata";
import type {
  AdaptedCurriculum,
  AdaptedCurriculumSection,
} from "../../courseCurriculumAdapter";
import { useLearningProgress } from "../../useLearningProgress";
import {
  useLiveLessonProgressSource,
  type LiveLessonProgress,
} from "../../player/liveLessonProgress";
import { seedResumePositionFromProgress } from "../../player/lessonPlayerPersistence";
import { LESSON_PROGRESS_COMPLETE_THRESHOLD } from "../workspaceConstants";
import { isPlaceholderLesson } from "../../staticLessonPage";
import type { useCourseOverview } from "../../../services/courses";

export interface UseLessonProgressStateArgs {
  courseSlug: string | undefined;
  userId: string | undefined;
  isApiRoute: boolean;
  courseOverview: ReturnType<typeof useCourseOverview>["data"];
  isCourseOverviewError: boolean;
  selectedLesson: number;
  localLessonProgress: Record<number, number>;
  adaptedCurriculum: AdaptedCurriculum | null;
  curriculumSections: AdaptedCurriculumSection[];
  curriculumLessonsById: Map<number, Lesson>;
  courseAccessRefused: boolean;
}

export interface UseLessonProgressStateResult {
  lessonSequence: number[];
  recordProgress: (lessonNumber: number, progressPercent: number) => void;
  detachedProgressTarget:
    | {
        userId: string;
        courseKey: string;
        lessonIdsByNumber: ReadonlyMap<number, string> | undefined;
      }
    | undefined;
  lessonProgress: Record<number, number>;
  /** The learner's progress has arrived (see `useLearningProgress`). */
  progressKnown: boolean;
  /** The same progress for the player, which must not re-render with it. */
  liveLessonProgress: LiveLessonProgress;
  courseComplete: boolean;
  currentLessonIndex: number;
  previousLessonId: number | undefined;
  nextLessonId: number | undefined;
  courseThumbnail: string | undefined;
  courseThumbnailSrcSet: string | undefined;
  nextLessonInfo: NextLessonInfo | undefined;
}

export function useLessonProgressState({
  courseSlug,
  userId,
  isApiRoute,
  courseOverview,
  isCourseOverviewError,
  selectedLesson,
  localLessonProgress,
  adaptedCurriculum,
  curriculumSections,
  curriculumLessonsById,
  courseAccessRefused,
}: UseLessonProgressStateArgs): UseLessonProgressStateResult {
  const lessonSequence = useMemo(
    () =>
      curriculumSections.flatMap(({ lessons }) => lessons.map(([id]) => id)),
    [curriculumSections],
  );
  // Without the stand-ins a page built for one lesson numbers the other
  // sections with (`isPlaceholderLesson`): they have no lesson's id, and
  // matched against the kept progress they had every item of those
  // sections dropped until the curriculum file was in (a change on screen
  // after the first paint, and progress not sent yet lost with it).
  const lessonIdsByNumber = useMemo<ReadonlyMap<number, string> | undefined>(
    () =>
      adaptedCurriculum
        ? new Map(
            [...adaptedCurriculum.lessonsByNumber.entries()]
              .filter(([, lesson]) => !isPlaceholderLesson(lesson))
              .map(
                ([lessonNumber, lesson]) => [lessonNumber, lesson.id] as const,
              ),
          )
        : undefined,
    [adaptedCurriculum],
  );
  const {
    lessonProgress: persistedLessonProgress,
    progressKnown,
    recordProgress,
  } = useLearningProgress({
    courseKey: courseOverview?.course.slug,
    userId,
    lessonIdsByNumber,
    enabled:
      Boolean(courseOverview?.course.slug) &&
      !(
        courseAccessRefused &&
        (courseOverview?.pricing?.pricingType === "paid" ||
          courseOverview?.canSelfEnroll === false)
      ),
  });
  // Handed to the persistent player so progress is still recorded while it
  // plays as the mini player, after this page has unmounted.
  const progressCourseKey = courseOverview?.course.slug;
  const detachedProgressTarget = useMemo(
    () =>
      userId && progressCourseKey
        ? { userId, courseKey: progressCourseKey, lessonIdsByNumber }
        : undefined,
    [lessonIdsByNumber, progressCourseKey, userId],
  );
  // Lessons this account has started elsewhere resume where it left them,
  // for the player and for the hover/next-lesson preload alike (both read
  // the position stored in this browser).
  useEffect(() => {
    if (!courseSlug || !adaptedCurriculum) return;
    const coursePersistenceKey = encodeURIComponent(courseSlug);
    for (const [lessonNumber, progress] of Object.entries(
      persistedLessonProgress,
    )) {
      const durationSeconds = adaptedCurriculum.lessonsByNumber.get(
        Number(lessonNumber),
      )?.durationSeconds;
      if (!durationSeconds) continue;
      seedResumePositionFromProgress(
        `${coursePersistenceKey}-lesson-${lessonNumber}`,
        progress,
        durationSeconds,
      );
    }
  }, [adaptedCurriculum, courseSlug, persistedLessonProgress]);

  const lessonProgress = useMemo(() => {
    if (Object.keys(localLessonProgress).length === 0) {
      return persistedLessonProgress;
    }
    const merged = { ...persistedLessonProgress };
    for (const [lessonNumber, progress] of Object.entries(
      localLessonProgress,
    )) {
      const number = Number(lessonNumber);
      merged[number] = Math.max(merged[number] ?? 0, progress);
    }
    return merged;
  }, [localLessonProgress, persistedLessonProgress]);
  const liveLessonProgress = useLiveLessonProgressSource(lessonProgress);
  // Every lesson is finished, by the rule that gives a lesson its check mark
  // in the list. The end screen says the course is complete only then.
  const courseComplete = useMemo(
    () =>
      lessonSequence.every(
        (lessonNumber) =>
          curriculumLessonsById.get(lessonNumber)?.[3] === "done" ||
          (lessonProgress[lessonNumber] ?? 0) >=
            LESSON_PROGRESS_COMPLETE_THRESHOLD,
      ),
    [curriculumLessonsById, lessonProgress, lessonSequence],
  );
  const currentLessonIndex = lessonSequence.indexOf(selectedLesson);
  const previousLessonId =
    currentLessonIndex > 0 ? lessonSequence[currentLessonIndex - 1] : undefined;
  const nextLessonId =
    currentLessonIndex >= 0 && currentLessonIndex < lessonSequence.length - 1
      ? lessonSequence[currentLessonIndex + 1]
      : undefined;
  const courseThumbnail = useMemo(() => {
    if (courseOverview) {
      return courseOverview.course.thumbnailUrl || undefined;
    }
    if (isCourseOverviewError) {
      return undefined;
    }
    return isApiRoute ? undefined : getCourseThumbnail(courseSlug);
  }, [courseOverview, courseSlug, isApiRoute, isCourseOverviewError]);
  const courseThumbnailSrcSet =
    courseOverview?.course.thumbnailSrcSet
      ?.map(({ url, width }) => `${url} ${width}w`)
      .join(", ") ||
    (!isApiRoute && !isCourseOverviewError
      ? getCourseThumbnailSrcSet(courseSlug)
      : undefined);
  const nextLessonInfo = useMemo<NextLessonInfo | undefined>(() => {
    if (nextLessonId === undefined) return undefined;
    const lesson = curriculumLessonsById.get(nextLessonId);
    if (!lesson) return undefined;
    const section = curriculumSections.find(({ lessons }) =>
      lessons.some(([id]) => id === nextLessonId),
    );
    const nextLessonMediaId =
      adaptedCurriculum?.lessonsByNumber.get(nextLessonId)?.contentMediaId;
    const nextIndex = lessonSequence.indexOf(nextLessonId);
    return {
      id: nextLessonId,
      title: lesson[1],
      // A reading or a quiz has no length to show; it is named instead.
      duration: (lesson[5] && NON_VIDEO_LESSON_LABELS[lesson[5]]) || lesson[2],
      sectionTitle: section?.title,
      thumbnailSrc: nextLessonMediaId
        ? mediaService.getVideoThumbnailUrl(nextLessonMediaId)
        : courseThumbnail,
      lectureNumber: nextIndex >= 0 ? nextIndex + 1 : undefined,
      totalLessons: lessonSequence.length,
    };
  }, [
    adaptedCurriculum,
    courseThumbnail,
    curriculumLessonsById,
    curriculumSections,
    lessonSequence,
    nextLessonId,
  ]);
  return {
    lessonSequence,
    recordProgress,
    detachedProgressTarget,
    lessonProgress,
    progressKnown,
    liveLessonProgress,
    courseComplete,
    currentLessonIndex,
    previousLessonId,
    nextLessonId,
    courseThumbnail,
    courseThumbnailSrcSet,
    nextLessonInfo,
  };
}
