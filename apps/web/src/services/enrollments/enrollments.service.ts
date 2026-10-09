import { api } from "../../lib/api-client";
import type {
  AcademyEnrollmentListResponse,
  EnrolledCoursesResponse,
  UnenrollCourseResponse,
} from "@veolms/contracts";

export const enrollmentsService = {
  listRecentEnrollments: (params?: {
    limit?: number;
  }): Promise<AcademyEnrollmentListResponse> => {
    return api.get<AcademyEnrollmentListResponse>("/enrollments", { params });
  },
  listEnrolledCourses: (): Promise<EnrolledCoursesResponse> => {
    return api.get<EnrolledCoursesResponse>("/enrollments/courses");
  },
  unenrollFromCourse: (courseId: string): Promise<UnenrollCourseResponse> => {
    return api.delete<UnenrollCourseResponse>(
      `/enrollments/courses/${encodeURIComponent(courseId)}`,
    );
  },
};
