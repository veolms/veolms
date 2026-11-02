import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CourseAccessChangeResponse } from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { enrollmentKeys } from "../enrollments/enrollments.keys";
import { studentKeys } from "../students/students.keys";
import { accessService } from "./access.service";

/**
 * Staff open one or more published courses for a learner, one request
 * each, in order. A failure stops there: the courses before it stay open,
 * and the student screens are refreshed either way.
 */
export function useGrantCourseAccess() {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: enrollmentKeys.all });
    return queryClient.invalidateQueries({ queryKey: studentKeys.all });
  };

  return useMutation<
    void,
    ApiError,
    { userId: string; courseIds: readonly string[]; validUntil: string | null }
  >({
    mutationFn: async ({ userId, courseIds, validUntil }) => {
      for (const courseId of courseIds) {
        await accessService.grantCourseAccess({ userId, courseId, validUntil });
      }
    },
    onSettled: refresh,
  });
}

export interface CourseAccessTarget {
  userId: string;
  courseId: string;
}

/**
 * Staff revoke or restore one learner's access to one course. The mutation
 * settles once the student screens are fresh, so the course card has already
 * changed when the confirmation closes.
 */
export function useChangeCourseAccess(action: "revoke" | "restore") {
  const queryClient = useQueryClient();

  return useMutation<CourseAccessChangeResponse, ApiError, CourseAccessTarget>({
    mutationFn: ({ userId, courseId }) =>
      action === "revoke"
        ? accessService.revokeCourseAccess(userId, courseId)
        : accessService.restoreCourseAccess(userId, courseId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: enrollmentKeys.all });
      return queryClient.invalidateQueries({ queryKey: studentKeys.all });
    },
  });
}
