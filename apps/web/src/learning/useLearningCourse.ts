import { useCallback, useMemo } from "react";
import { useRouteLoaderData } from "react-router";
import type {
  CourseOverviewResponse,
  CoursePublicCurriculum,
} from "@veolms/contracts";
import type { ApiError } from "../lib/api-error";
import type { AcademyStaticPageData } from "../routes/academyStaticPageData";
import {
  useCourseAccess,
  useCourseOverview,
  useCoursePublicCurriculum,
  useStaticCurriculum,
} from "../services/courses";
import { curriculumToOverview } from "../courses/staticCurriculum";
import {
  lessonPageSeedToOverview,
  type LessonPageSeed,
} from "./staticLessonPage";

export interface LearningCourse {
  /** The course as the lesson page draws it; undefined until something is in. */
  data: CourseOverviewResponse | undefined;
  /**
   * Whether `data` lists every lesson. A page built for one lesson starts
   * with that lesson's section only, the others' lessons standing in by
   * number (`isPlaceholderLesson`) until the curriculum file is in.
   */
  isComplete: boolean;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
}

const matchesCourse = (
  course: { slug: string; id: string } | undefined,
  courseSlug: string | undefined,
) =>
  Boolean(
    course &&
    courseSlug &&
    (course.slug === courseSlug || course.id === courseSlug),
  );

/** The lesson page seed of the document, when it is for this course. */
export function useLessonPageSeed(
  courseSlug: string | undefined,
): LessonPageSeed | undefined {
  const pageData = useRouteLoaderData("root") as
    AcademyStaticPageData | null | undefined;
  const seed = pageData?.lessonPage;
  return matchesCourse(seed?.curriculum.course, courseSlug) ? seed : undefined;
}

/**
 * Where a lesson page's course comes from: what every visitor sees is in
 * the page itself or in files the site was built with, and only the
 * viewer's own part is asked of the API.
 *
 * - A page loaded at a lesson's address was built with that lesson and its
 *   section (`LessonPageSeed`); the course's whole curriculum is its file,
 *   asked for at once (the page's head preloads it).
 * - A lesson opened from inside the site has no seed of its own: the course
 *   page it came from names the curriculum's version, and with no such page
 *   the file the site was built with is asked for whatever its version.
 * - The API's curriculum is asked for when the site has no such file (the
 *   dev server, a course published after the build) or when its copy is
 *   older than the course: the access answer carries the current version.
 * - The course's creator and admins get the whole overview, unpublished
 *   lessons included, as do learners who hold an archived course, which has
 *   no public curriculum.
 */
export function useLearningCourse(
  courseSlug: string | undefined,
  options?: { enabled?: boolean },
): LearningCourse {
  const enabled = Boolean(courseSlug) && (options?.enabled ?? true);
  const pageData = useRouteLoaderData("root") as
    AcademyStaticPageData | null | undefined;
  const seed = useLessonPageSeed(courseSlug);
  const coursePage = matchesCourse(
    pageData?.courseCurriculum?.curriculum.course,
    courseSlug,
  )
    ? pageData?.courseCurriculum
    : undefined;
  const knownVersion =
    seed?.curriculum.version ?? coursePage?.curriculum.version ?? null;

  const accessQuery = useCourseAccess(courseSlug, { enabled });
  const access = accessQuery.data;
  const isManager = access?.viewer === "manager";
  const builtBeforeChange = Boolean(
    knownVersion && access && access.curriculumVersion !== knownVersion,
  );
  // A course page whose curriculum was small enough to be built whole.
  const wholeFromCoursePage =
    !seed && coursePage?.complete ? coursePage.curriculum : undefined;

  const fileQuery = useStaticCurriculum(
    seed?.curriculum.course.slug ??
      coursePage?.curriculum.course.slug ??
      courseSlug,
    knownVersion,
    {
      enabled:
        enabled && !isManager && !builtBeforeChange && !wholeFromCoursePage,
    },
  );
  const file = fileQuery.data ?? undefined;
  const fileMissing = fileQuery.isFetched && !fileQuery.data;
  // A copy asked for whatever its version, that the course has moved past.
  const fileBehind = Boolean(
    file && access && file.version !== access.curriculumVersion,
  );

  const needsApiCurriculum =
    enabled && !isManager && (builtBeforeChange || fileMissing || fileBehind);
  const apiCurriculum = useCoursePublicCurriculum(courseSlug, {
    enabled: needsApiCurriculum,
  });
  const publicCurriculumMissing =
    apiCurriculum.error?.status === 404 && Boolean(access);

  const usesPersonal = isManager || publicCurriculumMissing;
  const personal = useCourseOverview(courseSlug, {
    enabled: enabled && usesPersonal,
  });

  const whole: CoursePublicCurriculum | undefined =
    (needsApiCurriculum ? apiCurriculum.data : undefined) ??
    (file && !fileBehind ? file : undefined) ??
    wholeFromCoursePage;
  const pricing = access?.pricing ?? null;
  const canSelfEnroll = access?.canSelfEnroll;

  const fromCurriculum = useMemo(() => {
    if (whole) {
      const overview = curriculumToOverview(whole, pricing);
      return canSelfEnroll === undefined
        ? overview
        : { ...overview, canSelfEnroll };
    }
    // Older than the course when it was edited since the build, but better
    // than an empty page while the current curriculum is on its way.
    if (seed) return lessonPageSeedToOverview(seed, pricing);
    return undefined;
  }, [canSelfEnroll, pricing, seed, whole]);

  const data = usesPersonal && personal.data ? personal.data : fromCurriculum;
  const isComplete = data === personal.data ? Boolean(data) : Boolean(whole);

  const isLoading =
    !data &&
    (accessQuery.isLoading ||
      fileQuery.isLoading ||
      apiCurriculum.isLoading ||
      personal.isLoading);
  const error = data
    ? null
    : (personal.error ??
      (publicCurriculumMissing ? null : apiCurriculum.error) ??
      accessQuery.error ??
      null);

  const refetchAccess = accessQuery.refetch;
  const refetchApi = apiCurriculum.refetch;
  const refetchPersonal = personal.refetch;
  const refetchFile = fileQuery.refetch;
  const refetch = useCallback(
    () =>
      Promise.all([
        refetchAccess(),
        needsApiCurriculum ? refetchApi() : undefined,
        usesPersonal ? refetchPersonal() : undefined,
        fileMissing ? refetchFile() : undefined,
      ]),
    [
      fileMissing,
      needsApiCurriculum,
      refetchAccess,
      refetchApi,
      refetchFile,
      refetchPersonal,
      usesPersonal,
    ],
  );

  return {
    data,
    isComplete,
    isLoading,
    isError: Boolean(error) && !isLoading,
    error,
    isFetching:
      accessQuery.isFetching ||
      fileQuery.isFetching ||
      apiCurriculum.isFetching ||
      personal.isFetching,
    refetch,
  };
}
