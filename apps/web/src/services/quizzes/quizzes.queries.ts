import { useQuery } from "@tanstack/react-query";
import type { ApiError } from "../../lib/api-error";
import { quizKeys } from "./quizzes.keys";
import { quizzesService } from "./quizzes.service";
export function useMyQuizzes(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: quizKeys.mine(),
    queryFn: quizzesService.listMine,
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}
export function useQuiz(id: string | null | undefined) {
  return useQuery({
    queryKey: id ? quizKeys.detail(id) : [...quizKeys.all, "detail", null],
    queryFn: () => quizzesService.get(id!),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}
export function useMyQuizAssignments(options?: { enabled?: boolean }) {
  return useQuery<
    {
      assignments: Awaited<
        ReturnType<typeof quizzesService.listMineAssignments>
      >["assignments"];
    },
    ApiError
  >({
    queryKey: quizKeys.mineAssignments(),
    queryFn: quizzesService.listMineAssignments,
    enabled: options?.enabled ?? true,
    staleTime: 15_000,
  });
}
export function useQuizAttempt(id: string | null | undefined) {
  return useQuery({
    queryKey: id ? quizKeys.attempt(id) : [...quizKeys.all, "attempt", null],
    queryFn: () => quizzesService.getAttempt(id!),
    enabled: Boolean(id),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}
export function useQuizResult(id: string | null | undefined) {
  return useQuery({
    queryKey: id ? quizKeys.result(id) : [...quizKeys.all, "result", null],
    queryFn: () => quizzesService.getResult(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}
export function useCourseQuizAssignments(
  courseId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: courseId
      ? quizKeys.courseAssignments(courseId)
      : [...quizKeys.assignments(), "course", null],
    queryFn: () => quizzesService.listCourseAssignments(courseId!),
    enabled: Boolean(courseId) && (options?.enabled ?? true),
    staleTime: 15_000,
  });
}
export function useQuizHistory(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: quizKeys.history(),
    queryFn: quizzesService.history,
    enabled: options?.enabled ?? true,
    staleTime: 15_000,
  });
}
export function useQuizAnalytics(assignmentId: string | null | undefined) {
  return useQuery({
    queryKey: assignmentId
      ? quizKeys.analytics(assignmentId)
      : [...quizKeys.all, "analytics", null],
    queryFn: () => quizzesService.assignmentAnalytics(assignmentId!),
    enabled: Boolean(assignmentId),
    staleTime: 15_000,
  });
}
export function useCourseQuizAnalytics(courseId: string | null | undefined) {
  return useQuery({
    queryKey: courseId
      ? quizKeys.courseAnalytics(courseId)
      : [...quizKeys.all, "course-analytics", null],
    queryFn: () => quizzesService.courseAnalytics(courseId!),
    enabled: Boolean(courseId),
    staleTime: 15_000,
  });
}
export function useStudentQuizReport(studentId: string | null | undefined) {
  return useQuery({
    queryKey: studentId
      ? quizKeys.studentReport(studentId)
      : [...quizKeys.all, "student-report", null],
    queryFn: () => quizzesService.studentReport(studentId!),
    enabled: Boolean(studentId),
    staleTime: 15_000,
  });
}
