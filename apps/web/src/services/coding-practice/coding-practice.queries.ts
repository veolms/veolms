import { useQuery } from "@tanstack/react-query";
import { getApiError } from "../../lib/api-error";
import { codingKeys } from "./coding-practice.keys";
import { codingPracticeService } from "./coding-practice.service";

/** A 4xx answer will not change on a retry (no access, no exercise). */
function retryUnlessRefused(count: number, error: unknown) {
  const status = getApiError(error).status;
  return count < 2 && !(status >= 400 && status < 500);
}

/** The course editor's Practice panel: the course's exercises. */
export function useCourseCodingExercises(
  courseId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: codingKeys.courseExercises(courseId ?? "none"),
    queryFn: () => codingPracticeService.listCourseExercises(courseId!),
    enabled: Boolean(courseId) && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useCodingExercise(exerciseId: string | null | undefined) {
  return useQuery({
    queryKey: codingKeys.exercise(exerciseId ?? "none"),
    queryFn: () => codingPracticeService.getExercise(exerciseId!),
    enabled: Boolean(exerciseId),
    staleTime: 30_000,
  });
}

/** The course's practice list in the lessons playlist. */
export function useCoursePractice(courseId: string | null | undefined) {
  return useQuery({
    queryKey: codingKeys.coursePractice(courseId ?? "none"),
    queryFn: () => codingPracticeService.listCoursePractice(courseId!),
    enabled: Boolean(courseId),
    staleTime: 60_000,
    retry: retryUnlessRefused,
  });
}

/** A lecture's practice under its video (empty for most lectures). */
export function useLecturePractice(
  courseId: string | null | undefined,
  lessonId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: codingKeys.lecturePractice(
      courseId ?? "none",
      lessonId ?? "none",
    ),
    queryFn: () =>
      codingPracticeService.listLecturePractice(courseId!, lessonId!),
    enabled: Boolean(courseId && lessonId) && (options?.enabled ?? true),
    staleTime: 60_000,
    retry: retryUnlessRefused,
  });
}

/** One practice exercise for the learner. */
export function useCodingPractice(assignmentId: string | null | undefined) {
  return useQuery({
    queryKey: codingKeys.practice(assignmentId ?? "none"),
    queryFn: () => codingPracticeService.getPractice(assignmentId!),
    enabled: Boolean(assignmentId),
    staleTime: 60_000,
    retry: retryUnlessRefused,
  });
}

export function useCodingSubmissions(
  assignmentId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: codingKeys.submissions(assignmentId ?? "none"),
    queryFn: () => codingPracticeService.listSubmissions(assignmentId!),
    enabled: Boolean(assignmentId) && (options?.enabled ?? true),
    staleTime: 15_000,
  });
}

export function useCodingAnalytics(assignmentId: string | null | undefined) {
  return useQuery({
    queryKey: codingKeys.analytics(assignmentId ?? "none"),
    queryFn: () => codingPracticeService.getAnalytics(assignmentId!),
    enabled: Boolean(assignmentId),
    staleTime: 30_000,
  });
}

export function useLearnerCodingSubmissions(
  assignmentId: string | null | undefined,
  studentId: string | null | undefined,
) {
  return useQuery({
    queryKey: codingKeys.learnerSubmissions(
      assignmentId ?? "none",
      studentId ?? "none",
    ),
    queryFn: () =>
      codingPracticeService.getLearnerSubmissions(assignmentId!, studentId!),
    enabled: Boolean(assignmentId && studentId),
    staleTime: 30_000,
  });
}
