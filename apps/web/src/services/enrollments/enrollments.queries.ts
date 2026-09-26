import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EnrolledCoursesResponse } from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { enrollmentKeys } from "./enrollments.keys";
import { enrollmentsService } from "./enrollments.service";

export function useEnrolledCourses(options?: { enabled?: boolean }) {
  return useQuery<EnrolledCoursesResponse, ApiError>({
    queryKey: enrollmentKeys.courses(),
    queryFn: () => enrollmentsService.listEnrolledCourses(),
    enabled: options?.enabled ?? true,
    staleTime: 60 * 1000,
  });
}

export function useEnrollFreeCourse() {
  const queryClient = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (courseId: string) => enrollmentsService.enrollFreeCourse(courseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: enrollmentKeys.courses() });
    },
  });
}
