import { upsertCoursePlayerSessionFromRoute } from "../coursePlayerNavigation";
import {
  getCourseVideoForLesson,
  lessonsById as defaultLessonsById,
  sections as defaultSections,
} from "../courseContent";
import {
  getCachedVideoPlaybackBootstrap,
  refreshVideoPlaybackToken,
} from "../videoPlaybackBootstrap";
import type {
  VideoPlaybackBootstrap,
  VideoPlaybackToken,
} from "@veolms/contracts";
import type {
  LearningPlayerPresentation,
  PersistentLearningPlayerRegistration,
} from "./PersistentLearningPlayerHost";

export interface PersistentMiniPlayerLessonChangeOptions {
  playbackBootstrap?: VideoPlaybackBootstrap | null;
  playbackSuspended?: boolean;
  refreshPlaybackToken?: () => Promise<VideoPlaybackToken>;
}

export function courseRouteKeyFromLessonPath(
  path?: string | null,
): string | null {
  if (!path) return null;
  const learnMatch = /^\/learn\/([^/?#]+)/.exec(path);
  if (learnMatch?.[1]) return decodeURIComponent(learnMatch[1]);
  const courseMatch = /^\/courses\/([^/?#]+)/.exec(path);
  if (courseMatch?.[1]) return decodeURIComponent(courseMatch[1]);
  return null;
}

export function resolveLearningMiniPlayerLessonPath({
  courseRouteKey,
  lessonNumber,
  lessonPath,
}: {
  courseRouteKey?: string | null;
  lessonNumber?: number;
  lessonPath?: string | null;
}): string | null {
  const courseId = courseRouteKey || courseRouteKeyFromLessonPath(lessonPath);
  if (!courseId) {
    return lessonPath?.startsWith("/learn/") ? lessonPath : null;
  }

  const search = lessonPath?.includes("?")
    ? lessonPath.slice(lessonPath.indexOf("?"))
    : "";
  return upsertCoursePlayerSessionFromRoute(
    courseId,
    search,
    lessonNumber ?? 1,
  );
}

export function buildPersistentMiniPlayerLessonSequence(
  registration: PersistentLearningPlayerRegistration,
): number[] {
  const sections = registration.curriculumSections ?? defaultSections;
  return sections.flatMap(({ lessons }) => lessons.map(([id]) => id));
}

export function applyPersistentMiniPlayerLessonChange(
  registration: PersistentLearningPlayerRegistration,
  lessonNumber: number,
  options?: PersistentMiniPlayerLessonChangeOptions,
): PersistentLearningPlayerRegistration | null {
  if (lessonNumber === registration.selectedLesson) return null;

  const lessonsById =
    registration.curriculumLessonsById ?? defaultLessonsById;
  const lesson = lessonsById.get(lessonNumber);
  if (!lesson) return null;

  if (
    registration.isLessonAvailable &&
    !registration.isLessonAvailable(lessonNumber)
  ) {
    return null;
  }

  const lessonSequence = buildPersistentMiniPlayerLessonSequence(registration);
  const lessonIndex = lessonSequence.indexOf(lessonNumber);
  if (lessonIndex < 0) return null;

  const media = getCourseVideoForLesson(lessonNumber);
  const search = registration.lessonPath.includes("?")
    ? registration.lessonPath.slice(registration.lessonPath.indexOf("?"))
    : "";
  const lessonPath = upsertCoursePlayerSessionFromRoute(
    registration.courseRouteKey,
    search,
    lessonNumber,
  );
  const resumePersistenceKey = `${registration.courseRouteKey}-lesson-${lessonNumber}`;
  const previousLessonId =
    lessonIndex > 0 ? lessonSequence[lessonIndex - 1] : undefined;
  const nextLessonId =
    lessonIndex < lessonSequence.length - 1
      ? lessonSequence[lessonIndex + 1]
      : undefined;

  const courseSlug =
    registration.courseSlug ??
    courseRouteKeyFromLessonPath(registration.lessonPath) ??
    registration.courseRouteKey;

  const resolvedBootstrap =
    options && "playbackBootstrap" in options
      ? options.playbackBootstrap
      : courseSlug
        ? getCachedVideoPlaybackBootstrap({ courseSlug, lessonNumber })
        : null;

  const refreshPlaybackToken =
    options?.refreshPlaybackToken ??
    (courseSlug
      ? () => refreshVideoPlaybackToken({ courseSlug, lessonNumber })
      : registration.playerProps.refreshPlaybackToken);

  const playbackSuspended =
    options?.playbackSuspended !== undefined
      ? options.playbackSuspended
      : registration.playerProps.playbackSuspended;

  return {
    ...registration,
    selectedLesson: lessonNumber,
    lessonPath,
    mediaKey: resumePersistenceKey,
    playerProps: {
      ...registration.playerProps,
      media,
      playbackBootstrap: resolvedBootstrap,
      refreshPlaybackToken,
      playbackSuspended,
      lessonTitle: lesson[1],
      lessonIndex: lessonIndex + 1,
      totalLessons: lessonSequence.length,
      canGoNext: nextLessonId !== undefined,
      canGoPrevious: previousLessonId !== undefined,
      autoPlayOnMediaChange: true,
      resumePersistenceKey,
    },
  };
}

export function resolveMiniPlayerCourseId({
  presentation,
  persistentCourseRouteKey,
  persistentCourseSlug,
  persistentLessonPath,
  miniPlayerCourseSlug,
  miniPlayerLessonPath,
}: {
  presentation?: LearningPlayerPresentation | null;
  persistentCourseRouteKey?: string | null;
  persistentCourseSlug?: string | null;
  persistentLessonPath?: string | null;
  miniPlayerCourseSlug?: string | null;
  miniPlayerLessonPath?: string | null;
}): string | undefined {
  const fromPersistentPlayer =
    presentation === "mini"
      ? persistentCourseRouteKey ||
        persistentCourseSlug ||
        courseRouteKeyFromLessonPath(persistentLessonPath)
      : undefined;

  return (
    fromPersistentPlayer ||
    miniPlayerCourseSlug ||
    courseRouteKeyFromLessonPath(miniPlayerLessonPath) ||
    undefined
  );
}
