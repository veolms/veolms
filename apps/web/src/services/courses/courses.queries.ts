import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type {
  Category,
  CourseEditorDataResponse,
  CourseOverviewResponse,
  CourseStaticPageRefreshStatusResponse,
  CourseListResponse,
  CourseOptionsResponse,
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

export function useCourses(options?: {
  enabled?: boolean;
  initialData?: { courses: CourseSummary[] };
}) {
  return useQuery<{ courses: CourseSummary[] }, ApiError>({
    queryKey: courseKeys.lists(),
    queryFn: () => coursesService.listAll(),
    enabled: options?.enabled ?? true,
    initialData: options?.initialData,
    staleTime: options?.initialData ? Infinity : 5 * 60 * 1000,
    retry: false,
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
  options?: {
    enabled?: boolean;
    initialData?: CourseOverviewResponse;
  },
) {
  return useQuery<CourseOverviewResponse, ApiError>({
    queryKey: idOrSlug
      ? courseKeys.overview(idOrSlug)
      : ["courses", "overview", null],
    queryFn: () => coursesService.getOverview(idOrSlug!),
    enabled: Boolean(idOrSlug && (options?.enabled ?? true)),
    initialData: options?.initialData,
    // Seeded data is the course as it was when the page was prerendered.
    // Dating it at zero has it checked against the API once after load, so
    // a price, curriculum or publish change since that build shows up —
    // the same rule the guest home page follows.
    initialDataUpdatedAt: options?.initialData ? 0 : undefined,
    staleTime: 60 * 1000,
    retry: false,
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
    queryKey: [...courseKeys.bin(), params ?? null],
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

export function useCourseStaticPageRefreshStatus(courseId: string | null) {
  return useQuery<CourseStaticPageRefreshStatusResponse, ApiError>({
    queryKey: courseId
      ? courseKeys.staticPageRefresh(courseId)
      : [...courseKeys.all, "static-page-refresh", null],
    queryFn: () => coursesService.getStaticPageRefreshStatus(courseId!),
    enabled: Boolean(courseId),
    // Followed closely only while a rebuild is under way. Course edits
    // refresh this query themselves, so the idle check is just a backstop;
    // at 5 seconds it was 12 requests a minute from every open editor.
    refetchInterval: (query) =>
      query.state.data?.status === "queued" ||
      query.state.data?.status === "running"
        ? 2_000
        : 60_000,
  });
}

export function useCourseOptions(options?: { enabled?: boolean }) {
  return useQuery<CourseOptionsResponse, ApiError>({
    queryKey: courseKeys.options(),
    queryFn: () => coursesService.listOptions(),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
  });
}

export function useInfiniteCourses(options: {
  enabled?: boolean;
  limit?: number;
  search?: string;
  sort?: "latest" | "title";
  initialData?: CourseListResponse;
  initialDataNeedsRefresh?: boolean;
}) {
  const limit = options.limit ?? 24;
  const search = options.search?.trim() ?? "";
  const sort = options.sort ?? "latest";
  const canUseInitialData =
    Boolean(options.initialData) && search.length === 0 && sort === "latest";

  return useInfiniteQuery<CourseListResponse, ApiError>({
    queryKey: courseKeys.pagedLists({ limit, search, sort }),
    queryFn: async ({ pageParam }) => {
      const page = await coursesService.list({
        limit,
        cursor: pageParam as string | undefined,
        ...(search ? { search } : {}),
        sort,
      });
      return !page.nextCursor && page.courses.length > limit
        ? { ...page, courses: page.courses.slice(0, limit) }
        : page;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options.enabled ?? true,
    placeholderData: (previousData) => previousData,
    initialData: canUseInitialData
      ? {
          pages: [options.initialData!],
          pageParams: [undefined],
        }
      : undefined,
    // The prerendered first page is checked against the API once after load
    // (see useCourseOverview): treated as fresh forever, a course published,
    // repriced or unpublished since the last build never showed.
    initialDataUpdatedAt: canUseInitialData ? 0 : undefined,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function prefetchCourseEditor(
  queryClient: QueryClient,
  courseId: string,
): Promise<void> {
  return queryClient.prefetchQuery<CourseEditorDataResponse, ApiError>({
    queryKey: courseKeys.editor(courseId),
    queryFn: () => coursesService.getCourseEditor(courseId),
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
    // On by default like every other query here: the default used to be
    // off, and the course editor (the only caller) never turned it on, so
    // its category list stayed empty.
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
  });
}
