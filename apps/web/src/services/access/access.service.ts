import { api } from "../../lib/api-client";
import type { CourseAccessChangeResponse } from "@veolms/contracts";

const courseAccessPath = (userId: string, courseId: string) =>
  `/access/users/${encodeURIComponent(userId)}/courses/${encodeURIComponent(courseId)}`;

export const accessService = {
  /** Takes a learner's access to a course away. No money is returned. */
  revokeCourseAccess: (
    userId: string,
    courseId: string,
  ): Promise<CourseAccessChangeResponse> => {
    return api.delete<CourseAccessChangeResponse>(
      courseAccessPath(userId, courseId),
    );
  },

  /** Gives back access that was revoked, as it was before. */
  restoreCourseAccess: (
    userId: string,
    courseId: string,
  ): Promise<CourseAccessChangeResponse> => {
    return api.post<CourseAccessChangeResponse>(
      `${courseAccessPath(userId, courseId)}/restore`,
    );
  },
};
