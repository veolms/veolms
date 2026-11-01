import { useMemo } from "react";
import type { AdaptedCurriculum } from "../../courseCurriculumAdapter";
import type {
  LessonContentAccessState,
  LessonParticipationState,
} from "../../Discussion";
import type {
  useCourseAccess,
  useCourseOverview,
} from "../../../services/courses";

export interface UseLessonAccessArgs {
  isAuthenticated: boolean;
  isAuthResolutionPending: boolean;
  courseAccessQuery: ReturnType<typeof useCourseAccess>;
  courseOverview: ReturnType<typeof useCourseOverview>["data"];
  selectedLesson: number;
  adaptedCurriculum: AdaptedCurriculum | null;
}

export interface UseLessonAccessResult {
  lessonContentAccess: LessonContentAccessState;
  lockedLessonNumbers: ReadonlySet<number>;
  lessonContentAccessReason: "login" | "access" | null;
  lessonParticipationState: LessonParticipationState;
  canParticipateInLessonDiscussion: boolean;
}

/**
 * What the visitor may do on the lesson page, read from the server's answer
 * for the course (`GET /courses/:slug/access`). The server decides by the
 * rule it plays lessons by, so a lesson shown unlocked plays and a locked
 * one is refused: whether it holds a grant, is a free course open to anyone
 * signed in, or is managed or reviewed by the visitor.
 */
export function useLessonAccess({
  isAuthenticated,
  isAuthResolutionPending,
  courseAccessQuery,
  courseOverview,
  selectedLesson,
  adaptedCurriculum,
}: UseLessonAccessArgs): UseLessonAccessResult {
  const courseAccess = courseAccessQuery.data;
  const opensEveryLesson = courseAccess?.access === "full";

  const lessonContentAccess = useMemo<LessonContentAccessState>(() => {
    if (!courseOverview || !adaptedCurriculum) return "pending";

    const lesson = adaptedCurriculum.lessonsByNumber.get(selectedLesson);
    if (!lesson) return "pending";

    // Anyone may read a published lesson's discussions, enrolled or not and
    // signed in or not, so they do not wait to learn who the visitor is:
    // they load alongside the rest of the lesson. Taking part is another
    // matter (`lessonParticipationState`).
    const isPublicLesson =
      courseOverview.course.status === "published" && lesson.isPublished;
    if (isPublicLesson) return "granted";
    if (isAuthResolutionPending) return "pending";
    if (!isAuthenticated) return "denied";
    if (!courseAccess) return "pending";
    return opensEveryLesson ? "granted" : "denied";
  }, [
    adaptedCurriculum,
    courseAccess,
    courseOverview,
    isAuthResolutionPending,
    isAuthenticated,
    opensEveryLesson,
    selectedLesson,
  ]);

  /**
   * The lessons this visitor cannot play: every lesson that is not a
   * preview, unless the server says they open every lesson, and except the
   * course's first lesson when it opens to them. Nothing is marked until
   * the server has answered, so locks never flash on and off.
   */
  const lockedLessonNumbers = useMemo<ReadonlySet<number>>(() => {
    const locked = new Set<number>();
    if (!courseAccess || !adaptedCurriculum || opensEveryLesson) {
      return locked;
    }
    const firstLessonNumber = Math.min(
      ...adaptedCurriculum.lessonsByNumber.keys(),
    );
    for (const [number, lesson] of adaptedCurriculum.lessonsByNumber) {
      if (lesson.isPreview) continue;
      if (courseAccess.firstLessonOpen && number === firstLessonNumber) {
        continue;
      }
      locked.add(number);
    }
    return locked;
  }, [adaptedCurriculum, courseAccess, opensEveryLesson]);

  const lessonContentAccessReason =
    lessonContentAccess === "denied"
      ? courseAccess?.lockedLessonsNeed === "sign-in" || !isAuthenticated
        ? "login"
        : "access"
      : null;

  const lessonParticipationState = useMemo<LessonParticipationState>(() => {
    if (isAuthResolutionPending || !courseOverview || !adaptedCurriculum) {
      return "pending";
    }
    if (!isAuthenticated) return "denied";
    if (!courseAccess) return "pending";
    // Posting has its own rule: a free course open to everyone plays for a
    // learner who never enrolled, who posts only once enrolled.
    return courseAccess.mayJoinDiscussions ? "granted" : "denied";
  }, [
    adaptedCurriculum,
    courseAccess,
    courseOverview,
    isAuthResolutionPending,
    isAuthenticated,
  ]);

  const canParticipateInLessonDiscussion =
    lessonContentAccess === "granted" && lessonParticipationState === "granted";
  return {
    lessonContentAccess,
    lockedLessonNumbers,
    lessonContentAccessReason,
    lessonParticipationState,
    canParticipateInLessonDiscussion,
  };
}
