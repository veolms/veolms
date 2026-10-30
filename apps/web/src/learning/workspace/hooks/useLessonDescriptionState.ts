import { useCallback, useMemo } from "react";
import { useLessonDescription } from "../../../services/courses";
import type { AdaptedCurriculum } from "../../courseCurriculumAdapter";
import {
  resolveLessonDescriptionState,
  type LessonDescriptionState,
} from "../../lessonWithoutVideo";
import type { useLearningCourse } from "../../useLearningCourse";
import { isPlaceholderLesson } from "../../staticLessonPage";
import type { useCourseQuizAssignments } from "../../../services/quizzes/quizzes.queries";
import type { CourseLesson } from "@veolms/contracts";
import type { ApiError } from "../../../lib/api-error";

export interface UseLessonDescriptionStateArgs {
  isApiRoute: boolean;
  courseOverview: ReturnType<typeof useLearningCourse>["data"];
  courseOverviewError: ApiError | null;
  isCourseOverviewError: boolean;
  isCourseOverviewFetching: boolean;
  refetchCourseOverview: () => Promise<unknown>;
  selectedLesson: number;
  adaptedCurriculum: AdaptedCurriculum | null;
  firstCurriculumLessonId: number | undefined;
  courseQuizAssignments: ReturnType<typeof useCourseQuizAssignments>;
  hasLessonQuiz: (lessonNumber: number) => boolean;
  retryPlaybackBootstrap: () => void;
}

export interface UseLessonDescriptionStateResult {
  courseUnavailable: "failed" | "not-found" | "no-lessons" | null;
  retryCourseOverview: () => void;
  selectedLessonQuizAttached: boolean | undefined;
  stageLesson: CourseLesson | undefined;
  isLessonDescriptionPending: boolean;
  lessonDescriptionState: LessonDescriptionState;
  retryLessonDescription: () => void;
}

export function useLessonDescriptionState({
  isApiRoute,
  courseOverview,
  courseOverviewError,
  isCourseOverviewError,
  isCourseOverviewFetching,
  refetchCourseOverview,
  selectedLesson,
  adaptedCurriculum,
  firstCurriculumLessonId,
  courseQuizAssignments,
  hasLessonQuiz,
  retryPlaybackBootstrap,
}: UseLessonDescriptionStateArgs): UseLessonDescriptionStateResult {
  // There is no lesson to show: the course did not load (a wrong address,
  // or a course that has been unpublished), or it has no lessons. The page
  // used to carry on as if a lesson were there, with an empty title, a video
  // that could only be retried in vain and discussions that never finished
  // checking access. A lesson opened from a discussion link is no
  // different: it used to keep the whole page up around a course it did
  // not have, with the course's id for a title.
  //
  // "not-found" is the server saying there is no such course; "failed" is
  // everything else (the server could not be reached, or it failed), where
  // the course may well be there and trying again is the thing to do.
  const courseUnavailable: "not-found" | "failed" | "no-lessons" | null =
    !isApiRoute
      ? null
      : isCourseOverviewError && !isCourseOverviewFetching && !courseOverview
        ? courseOverviewError?.status === 404
          ? "not-found"
          : "failed"
        : courseOverview && firstCurriculumLessonId === undefined
          ? "no-lessons"
          : null;
  const retryCourseOverview = useCallback(() => {
    // The video was asked for while the course was failing, so it is asked
    // for again along with the course.
    retryPlaybackBootstrap();
    void refetchCourseOverview();
  }, [refetchCourseOverview, retryPlaybackBootstrap]);

  // What stands where the video goes, whether the server is asked for one,
  // and whether opening the lesson finishes it. A lesson the course lists
  // with no video (a quiz lesson whose quiz was deleted, for one) is asked
  // for none; see `lessonWithoutVideo`.
  const selectedLessonQuizAttached = hasLessonQuiz(selectedLesson)
    ? true
    : courseQuizAssignments.data === undefined
      ? undefined
      : false;
  const overviewLesson = adaptedCurriculum?.lessonsByNumber.get(selectedLesson);
  // A lesson's description comes with the course: a video's or a quiz's is
  // for everyone, so the page is built with it and a lesson without one
  // simply has none. Only a reading lesson's text is left out for a viewer
  // it is not open to everyone for; that one is asked for on its own, and
  // the server answers it by the rule the lesson plays by.
  const asksForDescription = Boolean(
    overviewLesson &&
    !isPlaceholderLesson(overviewLesson) &&
    overviewLesson.contentType === "document" &&
    !overviewLesson.description,
  );
  const lessonDescriptionQuery = useLessonDescription(
    courseOverview?.course.id,
    overviewLesson?.id,
    { enabled: asksForDescription },
  );
  const fetchedLessonDescription = lessonDescriptionQuery.data;
  // The lesson as the course lists it: what the stage is planned from, and
  // where a reading lesson's text comes from.
  const stageLesson = useMemo(() => {
    if (
      !overviewLesson ||
      !fetchedLessonDescription ||
      fetchedLessonDescription.lessonId !== overviewLesson.id ||
      fetchedLessonDescription.description ===
        (overviewLesson.description ?? null)
    ) {
      return overviewLesson;
    }
    return {
      ...overviewLesson,
      description: fetchedLessonDescription.description,
    };
  }, [fetchedLessonDescription, overviewLesson]);
  // The overview leaves out the description of a lesson the viewer may not
  // open, and may leave out every lesson's, so a lesson it gives none is not
  // known until its own request ends.
  const overviewHasLessonDescription = Boolean(overviewLesson?.description);
  const isLessonDescriptionPending =
    lessonDescriptionQuery.isLoading && !overviewHasLessonDescription;
  // The server refuses the description of a lesson the viewer may not open
  // as it refuses its video: 401 to sign in, 403 to get the course. A
  // two-factor step that is still owed is a sign-in too, as for the video.
  const lessonDescriptionError = lessonDescriptionQuery.error;
  const lessonDescriptionRefusal =
    lessonDescriptionError?.status === 401 ||
    lessonDescriptionError?.code === "MFA_REQUIRED"
      ? "login"
      : lessonDescriptionError?.status === 403
        ? "locked"
        : null;
  // Whether the open lesson's description is known. A lesson with no video
  // is its description, so its stage and its completion wait for this.
  const lessonDescriptionState = resolveLessonDescriptionState({
    overviewHasDescription: overviewHasLessonDescription,
    request: !(
      courseOverview?.course.id &&
      overviewLesson?.id &&
      asksForDescription
    )
      ? "idle"
      : fetchedLessonDescription !== undefined
        ? "answered"
        : lessonDescriptionQuery.isError && !lessonDescriptionQuery.isFetching
          ? (lessonDescriptionRefusal ?? "failed")
          : "loading",
  });
  const refetchLessonDescription = lessonDescriptionQuery.refetch;
  const retryLessonDescription = useCallback(() => {
    void refetchLessonDescription();
  }, [refetchLessonDescription]);
  return {
    courseUnavailable,
    retryCourseOverview,
    selectedLessonQuizAttached,
    stageLesson,
    isLessonDescriptionPending,
    lessonDescriptionState,
    retryLessonDescription,
  };
}
