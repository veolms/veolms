import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type {
  Category,
  CourseListResponse,
  CourseEditorDataResponse,
  CourseOverviewResponse,
  CourseValidationResponse,
  DeletedCoursesListResponse,
  DeletedCoursesQuery,
  MyCoursesListResponse,
  PublicCourse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { takeEarlyCourseCataloguePrefetch } from "../../courses/courseCatalogueBootstrap";
import { courseKeys } from "./courses.keys";
import { coursesService } from "./courses.service";

export function useCourses(options?: {
  enabled?: boolean;
  initialData?: CourseListResponse | null;
}) {
  const limit = 50;
  const hasStaticData =
    options?.initialData !== null && options?.initialData !== undefined;
  return useQuery<CourseListResponse, ApiError>({
    queryKey: courseKeys.publicList({ limit }),
    queryFn: async () => {
      const prefetch = takeEarlyCourseCataloguePrefetch();
      const prefetchedData = prefetch ? await prefetch : null;
      return prefetchedData ?? coursesService.list({ limit });
    },
    enabled: options?.enabled ?? true,
    initialData: options?.initialData ?? undefined,
    // SSG data is the authoritative first paint. Avoid a duplicate public
    // catalogue request during the initial course-page hydration.
    initialDataUpdatedAt: hasStaticData ? Date.now() : undefined,
    refetchOnMount: hasStaticData ? false : undefined,
    staleTime: 5 * 60 * 1000,
  });
}

const DEFAULT_COURSE_PAGE_SIZE = 15;

export function useInfiniteCourses(options?: {
  enabled?: boolean;
  limit?: number;
}) {
  const limit = options?.limit ?? DEFAULT_COURSE_PAGE_SIZE;
  const query = useInfiniteQuery<CourseListResponse, ApiError>({
    queryKey: courseKeys.lists({ limit }),
    queryFn: ({ pageParam, signal }) =>
      coursesService.list(
        {
          limit,
          cursor: pageParam as string | undefined,
        },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
  });

  return {
    ...query,
    data: query.data
      ? {
          courses: query.data.pages.flatMap((page) => page.courses),
          nextCursor: query.data.pages.at(-1)?.nextCursor ?? null,
        }
      : undefined,
  };
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
    retry: false,
  });
}

export function useMyCourses(options?: { enabled?: boolean }) {
  return useQuery<MyCoursesListResponse, ApiError>({
    queryKey: courseKeys.mine(),
    queryFn: () => coursesService.listMyCourses(),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDeletedCourses(
  params?: DeletedCoursesQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<DeletedCoursesListResponse, ApiError>({
    queryKey: [...courseKeys.bin(), params ?? null],
    queryFn: () => coursesService.listDeletedCourses(params),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
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
