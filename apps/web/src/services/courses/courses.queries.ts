import { useQuery } from "@tanstack/react-query";
import type {
  Category,
  CourseEditorDataResponse,
  CourseOverviewResponse,
  CourseSummary,
  CourseValidationResponse,
  DeletedCoursesListResponse,
  DeletedCoursesQuery,
  MyCoursesListResponse,
  PublicCourse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { courseKeys } from "./courses.keys";
import { coursesService } from "./courses.service";

export function useCourses(options?: { enabled?: boolean }) {
  return useQuery<{ courses: CourseSummary[] }, ApiError>({
    queryKey: courseKeys.lists(),
    queryFn: () => coursesService.list(),
    enabled: options?.enabled ?? true,
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

export function useCourseOverview(
  idOrSlug: string | null | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery<CourseOverviewResponse, ApiError>({
    queryKey: idOrSlug
      ? courseKeys.overview(idOrSlug)
      : ["courses", "overview", null],
    queryFn: () => coursesService.getOverview(idOrSlug!),
    enabled: Boolean(idOrSlug && (options?.enabled ?? true)),
    staleTime: 60 * 1000,
  });
}

export function useMyCourses(options?: { enabled?: boolean }) {
  return useQuery<MyCoursesListResponse, ApiError>({
    queryKey: courseKeys.mine(),
    queryFn: () => coursesService.listMyCourses(),
    enabled: options?.enabled ?? true,
    staleTime: 60 * 1000,
  });
}

export function useDeletedCourses(
  params?: DeletedCoursesQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<DeletedCoursesListResponse, ApiError>({
    queryKey: courseKeys.bin(),
    queryFn: () => coursesService.listDeletedCourses(params),
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
  });
}

export function useCourseEditor(courseId: string | null) {
  return useQuery<CourseEditorDataResponse, ApiError>({
    queryKey: courseId
      ? courseKeys.editor(courseId)
      : ["courses", "editor", null],
    queryFn: () => coursesService.getCourseEditor(courseId!),
    enabled: Boolean(courseId),
    staleTime: 30 * 1000,
  });
}

export function useCoursePreview(
  courseId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery<CourseEditorDataResponse, ApiError>({
    queryKey: courseId
      ? courseKeys.preview(courseId)
      : ["courses", "preview", null],
    queryFn: () => coursesService.getPreview(courseId!),
    enabled: Boolean(courseId && (options?.enabled ?? true)),
    staleTime: 0,
  });
}

export function useCourseValidation(
  courseId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery<CourseValidationResponse, ApiError>({
    queryKey: courseId
      ? courseKeys.validation(courseId)
      : ["courses", "validation", null],
    queryFn: () => coursesService.getValidation(courseId!),
    enabled: Boolean(courseId && (options?.enabled ?? true)),
    staleTime: 10 * 1000,
  });
}

export function useCategories(options?: { enabled?: boolean }) {
  return useQuery<Category[], ApiError>({
    queryKey: courseKeys.categories(),
    queryFn: () => coursesService.listCategories(),
    enabled: options?.enabled ?? false,
    staleTime: 5 * 60 * 1000,
  });
}
