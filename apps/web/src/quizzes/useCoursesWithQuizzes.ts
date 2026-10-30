import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { ManagedCourseSummary } from "@veolms/contracts";
import { quizKeys, quizzesService } from "../services/quizzes";

/**
 * The courses a quiz report can be about: those with at least one quiz,
 * most recently updated first. Each course's quiz list is the one the page
 * reads for the chosen course, so it is fetched once and shared.
 *
 * Until every count has arrived, and for a course whose count could not be
 * read, the course is kept: a slow request must not empty the picker.
 */
export function useCoursesWithQuizzes(
  courses: readonly ManagedCourseSummary[] | undefined,
): readonly ManagedCourseSummary[] {
  const list = useMemo(() => courses ?? [], [courses]);
  const quizCounts = useQueries({
    queries: list.map((course) => ({
      queryKey: quizKeys.courseAssignments(course.id),
      queryFn: () => quizzesService.listCourseAssignments(course.id),
      staleTime: 15_000,
    })),
  });
  const counted = quizCounts.every((query) => !query.isPending);
  const countKey = quizCounts
    .map((query) => (query.data ? query.data.length : "?"))
    .join(",");

  return useMemo(() => {
    const counts = countKey.split(",");
    const kept = counted
      ? list.filter((_, index) => counts[index] !== "0")
      : [...list];
    return kept.sort((a, b) => updatedTime(b) - updatedTime(a));
  }, [counted, countKey, list]);
}

function updatedTime(course: ManagedCourseSummary): number {
  const value = course.updatedAt ?? course.createdAt;
  return value ? Date.parse(value) : 0;
}
