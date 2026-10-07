import { api } from "../../lib/api-client";
import type {
  AcademyEnrollmentListResponse,
  EnrolledCoursesResponse,
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
};
