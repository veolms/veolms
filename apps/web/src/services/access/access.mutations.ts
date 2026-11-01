import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CourseAccessChangeResponse } from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { enrollmentKeys } from "../enrollments/enrollments.keys";
import { studentKeys } from "../students/students.keys";
import { accessService } from "./access.service";

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
