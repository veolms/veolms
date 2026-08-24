import { useQuery } from "@tanstack/react-query";
import type {
  Category,
  CourseEditorDataResponse,
  CourseSummary,
  MyCoursesListResponse,
  PublicCourse,
} from "@veolms/contracts";
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

export function useMyCourses() {
  return useQuery<MyCoursesListResponse, ApiError>({
    queryKey: courseKeys.mine(),
    queryFn: () => coursesService.listMyCourses(),
    staleTime: 60 * 1000,
  });
}

export function useCourseEditor(courseId: string | null) {
  return useQuery<CourseEditorDataResponse, ApiError>({
    queryKey: courseId ? courseKeys.editor(courseId) : ["courses", "editor", null],
    queryFn: () => coursesService.getCourseEditor(courseId!),
    enabled: Boolean(courseId),
    staleTime: 30 * 1000,
  });
}

export function useCategories() {
  return useQuery<Category[], ApiError>({
    queryKey: courseKeys.categories(),
    queryFn: () => coursesService.listCategories(),
    staleTime: 5 * 60 * 1000,
  });
}
