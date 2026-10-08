import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AcademyEnrollmentListResponse,
  EnrolledCoursesResponse,
  UnenrollCourseResponse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { courseKeys } from "../courses/courses.keys";
import { enrollmentKeys } from "./enrollments.keys";
import { enrollmentsService } from "./enrollments.service";

/** Shared so the list can be prefetched under the key the hook reads. */
export const enrolledCoursesQueryOptions = () => ({
  queryKey: enrollmentKeys.courses(),
  queryFn: (): Promise<EnrolledCoursesResponse> =>
    enrollmentsService.listEnrolledCourses(),
  staleTime: 60 * 1000,
});

export function useEnrolledCourses(options?: { enabled?: boolean }) {
  return useQuery<EnrolledCoursesResponse, ApiError>({
    ...enrolledCoursesQueryOptions(),
    enabled: options?.enabled ?? true,
  });
}

export function useRecentEnrollments(options?: {
  enabled?: boolean;
  limit?: number;
}) {
  const limit = options?.limit ?? 10;

  return useQuery<AcademyEnrollmentListResponse, ApiError>({
    queryKey: enrollmentKeys.recent(limit),
    queryFn: () => enrollmentsService.listRecentEnrollments({ limit }),
    enabled: options?.enabled ?? true,
    staleTime: 60 * 1000,
  });
}

export function useEnrollFreeCourse() {
  const queryClient = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (courseId: string) =>
      enrollmentsService.enrollFreeCourse(courseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.courses() });
    },
  });
}

/** Leaves a free course. Everything that depends on what the learner owns is refreshed. */
export function useUnenrollFromCourse() {
  const queryClient = useQueryClient();
  return useMutation<UnenrollCourseResponse, ApiError, string>({
    mutationFn: (courseId: string) =>
      enrollmentsService.unenrollFromCourse(courseId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: courseKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      // The mutation settles once the enrolled list is fresh, so the course
      // card has already changed when the confirmation closes.
      return queryClient.invalidateQueries({ queryKey: enrollmentKeys.all });
    },
  });
}
