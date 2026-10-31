import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type {
  Category,
  CourseAccessListResponse,
  CourseAccessResponse,
  CourseEditorDataResponse,
  CourseOverviewResponse,
  CoursePublicCurriculum,
  CourseStaticPageRefreshStatusResponse,
  CourseListResponse,
  CourseOptionsResponse,
  CourseSummary,
  CourseValidationResponse,
  DeletedCoursesListResponse,
  DeletedCoursesQuery,
  LessonDescriptionResponse,
  LinkedCoursesListResponse,
  PartialAccessListResponse,
  PartialAccessOffer,
  PartialAccessOptionsResponse,
  MyCoursesListResponse,
  PublicCourse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { courseKeys } from "./courses.keys";
import { coursesService } from "./courses.service";
import { withOfflineFallback } from "../../lib/offline-data";
import { readSessionCache, writeSessionCache } from "../../lib/session-cache";
import { readAccountCopy } from "../accountSessionCopies";

/**
 * The published courses as last fetched in this tab, for a page that is
 * only ever drawn in the browser (never hydrated over a built one): a
 * reload shows them at once and asks again in the background once they are
 * older than the query's `staleTime`. They are the same for everyone.
 */
const PUBLISHED_COURSES_SESSION_KEY = "veolms-published-courses";
const PUBLISHED_COURSES_KEPT_MS = 24 * 60 * 60 * 1000;
const isCourseList = (value: unknown): value is { courses: CourseSummary[] } =>
  Boolean(value) &&
  typeof value === "object" &&
  Array.isArray((value as { courses?: unknown }).courses);
const readKeptCourses = () =>
  readSessionCache(
    PUBLISHED_COURSES_SESSION_KEY,
    PUBLISHED_COURSES_KEPT_MS,
    isCourseList,
  );

export function useCourses(options?: {
  enabled?: boolean;
  initialData?: { courses: CourseSummary[] };
  /** Keep the answer for this tab's next load (see above). */
  keptInTab?: boolean;
}) {
  const keptInTab = Boolean(options?.keptInTab && !options.initialData);
  return useQuery<{ courses: CourseSummary[] }, ApiError>({
    queryKey: courseKeys.lists(),
    queryFn: keptInTab
      ? async () => {
          const answer = await coursesService.listAll();
          writeSessionCache(PUBLISHED_COURSES_SESSION_KEY, answer);
          return answer;
        }
      : () => coursesService.listAll(),
    enabled: options?.enabled ?? true,
    initialData: keptInTab
      ? () => readKeptCourses()?.value
      : options?.initialData,
    initialDataUpdatedAt: keptInTab
      ? () => readKeptCourses()?.savedAt
      : undefined,
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
    queryFn: () =>
      withOfflineFallback(
        () => coursesService.getOverview(idOrSlug!),
        (offline) => offline.courseOverview(idOrSlug!),
      ),
    enabled: Boolean(idOrSlug && (options?.enabled ?? true)),
    // Offline, the course of a downloaded lesson comes from the download.
    networkMode: "offlineFirst",
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

/**
 * What the viewer may do with one course: which lessons open, what the rest
 * need, the price now and their progress. Decided by the server by the rule
 * playback applies, so a lesson shown unlocked plays.
 */
export function useCourseAccess(
  idOrSlug: string | null | undefined,
  options?: {
    enabled?: boolean;
    /**
     * Start from this tab's copy of the answer for the remembered account
     * (see `readAccountCopy`), for a page whose document was drawn from
     * that copy before its scripts ran: the lesson page. A copy older than
     * the query's `staleTime` is asked again in the background.
     */
    fromTabCopy?: boolean;
  },
) {
  const queryKey = idOrSlug
    ? courseKeys.access(idOrSlug)
    : (["courses", "overview", null, "access"] as const);
  const copy = options?.fromTabCopy
    ? () => readAccountCopy<CourseAccessResponse>(queryKey)
    : undefined;
  return useQuery<CourseAccessResponse, ApiError>({
    queryKey,
    queryFn: () => coursesService.getAccess(idOrSlug!),
    enabled: Boolean(idOrSlug && (options?.enabled ?? true)),
    initialData: copy ? () => copy()?.value : undefined,
    initialDataUpdatedAt: copy ? () => copy()?.savedAt : undefined,
    staleTime: 60 * 1000,
    retry: false,
  });
}

/**
 * A published course as every visitor sees it, from the API: for a page
 * that was not built with it (a course published since the build, the dev
 * server) or was built before the course last changed.
 */
export function useCoursePublicCurriculum(
  idOrSlug: string | null | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery<CoursePublicCurriculum, ApiError>({
    queryKey: idOrSlug
      ? courseKeys.publicCurriculum(idOrSlug)
      : ["courses", "overview", null, "public-curriculum"],
    queryFn: () => coursesService.getPublicCurriculum(idOrSlug!),
    enabled: Boolean(idOrSlug && (options?.enabled ?? true)),
    staleTime: 60 * 1000,
    retry: false,
  });
}

/**
 * A course's whole public curriculum as the site was built with it (see
 * `staticCurriculumUrl`). Null when the build has no copy of that version.
 * `version` null asks for whichever copy the site has; undefined asks for
 * nothing.
 */
export function useStaticCurriculum(
  courseSlug: string | null | undefined,
  version: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const asked = Boolean(courseSlug) && version !== undefined;
  return useQuery<CoursePublicCurriculum | null, ApiError>({
    queryKey: asked
      ? courseKeys.staticCurriculum(courseSlug!, version!)
      : ["courses", "static-curriculum", null],
    queryFn: () => coursesService.getStaticCurriculum(courseSlug!, version!),
    enabled: asked && (options?.enabled ?? true),
    staleTime: Infinity,
    retry: 1,
  });
}

/** `useCourseAccess` for every published course, for the catalogue. */
export function useCourseAccessList(options?: { enabled?: boolean }) {
  return useQuery<CourseAccessListResponse, ApiError>({
    queryKey: courseKeys.accessList(),
    queryFn: () => coursesService.listAccess(),
    enabled: options?.enabled ?? true,
    staleTime: 60 * 1000,
    retry: false,
  });
}

/**
 * One lesson's description: a reading lesson's text, which the course's
 * curriculum leaves out for a viewer it is not open to everyone for (see
 * `useLessonDescriptionState`).
 */
export function useLessonDescription(
  courseId: string | null | undefined,
  lessonId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery<LessonDescriptionResponse, ApiError>({
    queryKey:
      courseId && lessonId
        ? courseKeys.lessonDescription(courseId, lessonId)
        : ["courses", "overview", null, "lesson-description", null],
    queryFn: () => coursesService.getLessonDescription(courseId!, lessonId!),
    enabled: Boolean(courseId && lessonId && (options?.enabled ?? true)),
    // As long as the overview it stands in for.
    staleTime: 60 * 1000,
    // A lesson that is only text has nothing else to show, so a dropped
    // request is asked again. "Not found" and "forbidden" are final.
    retry: (failureCount, error) =>
      failureCount < 2 && !(error.status >= 400 && error.status < 500),
  });
}

/** The courses that come free with a course (editor only). */
export function useLinkedCourses(courseId: string | null) {
  return useQuery<LinkedCoursesListResponse, ApiError>({
    queryKey: courseKeys.linkedCourses(courseId ?? ""),
    queryFn: () => coursesService.listLinkedCourses(courseId!),
    enabled: Boolean(courseId),
  });
}

/**
 * The part of a course a partial access link sells (`?access=` on the
 * course page): its price and sections. Read live, never from a copy.
 */
export function usePartialAccessOffer(
  idOrSlug: string | null | undefined,
  offerSlug: string | null | undefined,
) {
  return useQuery<PartialAccessOffer, ApiError>({
    queryKey: courseKeys.offer(idOrSlug ?? "", offerSlug ?? ""),
    queryFn: () => coursesService.getPartialAccessOffer(idOrSlug!, offerSlug!),
    enabled: Boolean(idOrSlug && offerSlug),
    retry: (failureCount, error) =>
      failureCount < 2 && !(error.status >= 400 && error.status < 500),
  });
}

/** Every partial access, for limiting a coupon to one (coupon builder). */
export function usePartialAccessOptions() {
  return useQuery<PartialAccessOptionsResponse, ApiError>({
    queryKey: courseKeys.partialAccessOptions(),
    queryFn: () => coursesService.listPartialAccessOptions(),
    staleTime: 60 * 1000,
  });
}

/** The parts of a course sold on their own (editor only). */
export function usePartialAccess(courseId: string | null) {
  return useQuery<PartialAccessListResponse, ApiError>({
    queryKey: courseKeys.partialAccess(courseId ?? ""),
    queryFn: () => coursesService.listPartialAccess(courseId!),
    enabled: Boolean(courseId),
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

/**
 * What a course's page asks for when it is opened from another page (see
 * `useCoursePageData`), asked for ahead of the click: the curriculum file
 * the site was built with and the viewer's access answer. Each is kept as
 * long as the page's own query keeps it, so the page finds them waiting.
 */
export function prefetchCoursePage(
  queryClient: QueryClient,
  courseKey: string,
): Promise<unknown> {
  return Promise.all([
    queryClient.prefetchQuery<CoursePublicCurriculum | null, ApiError>({
      queryKey: courseKeys.staticCurriculum(courseKey, null),
      queryFn: () => coursesService.getStaticCurriculum(courseKey, null),
      staleTime: Infinity,
    }),
    queryClient.prefetchQuery<CourseAccessResponse, ApiError>({
      queryKey: courseKeys.access(courseKey),
      queryFn: () => coursesService.getAccess(courseKey),
      staleTime: 60 * 1000,
    }),
  ]);
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

/**
 * The viewer's access answer for a course, from the cache while it is
 * fresh (the course and lesson pages read the same entry). It says, for a
 * learner who holds the course, which lesson they carry on with.
 */
export function fetchCourseAccess(
  queryClient: QueryClient,
  courseKey: string,
): Promise<CourseAccessResponse> {
  return queryClient.fetchQuery<CourseAccessResponse, ApiError>({
    queryKey: courseKeys.access(courseKey),
    queryFn: () => coursesService.getAccess(courseKey),
    staleTime: 60 * 1000,
    retry: false,
  });
}
