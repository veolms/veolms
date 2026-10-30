import type { QueryClient } from "@tanstack/react-query";
import { courseKeys } from "../services/courses/courses.keys";
import { learningProgressKeys } from "../services/learning-progress/learning-progress.keys";

/**
 * Once the server has been told where the learner is in a course's videos,
 * its answers that name the lesson they carry on with (the resume answer,
 * the course's access answer) are out of date. They are marked so, not
 * asked for again now: whatever needs one next (the home's hero, a press
 * on a course's play button) asks then.
 */
export function markCourseResumeStale(
  queryClient: QueryClient,
  courseKey: string,
): void {
  for (const queryKey of [
    learningProgressKeys.resumeContext(courseKey),
    courseKeys.access(courseKey),
  ]) {
    void queryClient.invalidateQueries({
      queryKey,
      exact: true,
      refetchType: "none",
    });
  }
}
