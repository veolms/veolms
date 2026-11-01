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

/**
 * Shared so the list can be prefetched under the key the hook reads. The
 * tab keeps a copy of it for reloads (`services/accountSessionCopies.ts`).
 */
export const enrolledCoursesQueryOptions = () => ({
  queryKey: enrollmentKeys.courses(),
  queryFn: (): Promise<EnrolledCoursesResponse> =>
    enrollmentsService.listEnrolledCourses(),
  staleTime: 60 * 1000,
  // Asked again whenever the learner comes back to the tab, however fresh:
  // a course bought on another device then shows without a reload.
  refetchOnWindowFocus: "always" as const,
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

/** Leaves a free course. Everything that depends on what the learner owns is refreshed. */
export function useUnenrollFromCourse() {
  const queryClient = useQueryClient();
  return useMutation<UnenrollCourseResponse, ApiError, string>({
    mutationFn: (courseId: string) =>
      enrollmentsService.unenrollFromCourse(courseId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: courseKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      // An admin's unenrollment clears their progress in the course.
      void queryClient.invalidateQueries({ queryKey: ["learning-progress"] });
      void queryClient.invalidateQueries({ queryKey: ["learning-goals"] });
      // The mutation settles once the enrolled list is fresh, so the course
      // card has already changed when the confirmation closes.
      return queryClient.invalidateQueries({ queryKey: enrollmentKeys.all });
    },
  });
}
