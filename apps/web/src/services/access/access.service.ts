import { api } from "../../lib/api-client";
import type {
  AccessGrant,
  CourseAccessChangeResponse,
  CourseValidityResponse,
  CreateManualAccessGrantRequest,
  ExtendCourseAccessRequest,
} from "@veolms/contracts";

const courseAccessPath = (userId: string, courseId: string) =>
  `/access/users/${encodeURIComponent(userId)}/courses/${encodeURIComponent(courseId)}`;

export const accessService = {
  /** Opens a published course for a learner, lifetime or until a date. */
  grantCourseAccess: (
    input: CreateManualAccessGrantRequest,
  ): Promise<AccessGrant> => {
    return api.post<AccessGrant>("/access/grants", input);
  },

  /** Takes a learner's access to a course away. No money is returned. */
  revokeCourseAccess: (
    userId: string,
    courseId: string,
  ): Promise<CourseAccessChangeResponse> => {
    return api.delete<CourseAccessChangeResponse>(
      courseAccessPath(userId, courseId),
    );
  },

  /** Extends a learner's access to a course, or makes it lifetime. */
  extendCourseAccess: (
    userId: string,
    courseId: string,
    body: ExtendCourseAccessRequest,
  ): Promise<CourseValidityResponse> => {
    return api.post<CourseValidityResponse>(
      `${courseAccessPath(userId, courseId)}/validity`,
      body,
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
