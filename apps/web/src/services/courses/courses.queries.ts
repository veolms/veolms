import { useQuery } from "@tanstack/react-query";
import type { CourseSummary, PublicCourse } from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { courseKeys } from "./courses.keys";
import { coursesService } from "./courses.service";

export function useCourses() {
  return useQuery<{ courses: CourseSummary[] }, ApiError>({
    queryKey: courseKeys.lists(),
    queryFn: () => coursesService.list(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCourse(slug: string) {
  return useQuery<PublicCourse, ApiError>({
    queryKey: courseKeys.detail(slug),
    queryFn: () => coursesService.getBySlug(slug),
    enabled: Boolean(slug),
    staleTime: 5 * 60 * 1000,
  });
}
