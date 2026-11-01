import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  DefinedUseInfiniteQueryResult,
  InfiniteData,
  UseQueryResult,
  UseMutationResult,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { CourseSummary } from "@veolms/contracts";
import {
  getStudentCataloguePathForEnrollmentFilter,
  isStudentCatalogueFilterSubpath,
} from "../../courses/catalogueRoutes";
import type {
  CourseEnrollmentFilter,
  CourseRole,
  CourseSort,
  CourseStatusFilter,
} from "../../courses/catalogue";
import {
  authStore,
  useAuthIdentityHint,
  useSessionPresentAtBoot,
} from "../../store/auth.store";
import {
  useCourses,
  useInfiniteCourses,
  useDeleteCourse,
  useDeletedCourses,
  useMyCourses,
  useRestoreCourse,
} from "../../services/courses";
import { useEnrolledCourses } from "../../services/enrollments";
import { useCapabilities } from "../../services/authorization";
import {
  isViewerCourseStateKnown,
  useHydrated,
} from "../../courses/viewerCourseState";
import type { NavigateTo } from "../../routing/navigation";
import type { CoursesPageRenderContext } from "../academyShellTypes";
import type { ApiError } from "../../lib/api-error";

export interface UseCatalogueQueriesArgs {
  cataloguePathname: string;
  initialPublishedCoursePage:
    { courses: CourseSummary[]; nextCursor?: string | undefined } | undefined;
  initialPublishedCoursePageNeedsRefresh: boolean;
  learningBackground: {
    courseSlug?: string;
    discussionTab?: string;
    page: string;
    pathname?: string;
    scrollLeft: number;
    scrollTop: number;
    section?: string;
    settingsTab?: string;
  } | null;
  onNavigatePage: NavigateTo;
  page: string;
  renderMain: ((context: CoursesPageRenderContext) => ReactNode) | null;
  routeCatalogueEnrollmentFilter:
    "all" | "enrolled" | "not-enrolled" | "free" | "wishlist";
  creatorEnrollmentFilter: CourseEnrollmentFilter;
  setCreatorEnrollmentFilter: Dispatch<SetStateAction<CourseEnrollmentFilter>>;
  debouncedSearch: string;
  statusFilter: CourseStatusFilter;
  sort: CourseSort;
  authUserFetched: boolean;
  workspaceRoleHint: "student" | "creator" | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  effectiveRole: CourseRole;
  isEditingOrCreatingCourse: boolean;
  isAuthReady: boolean;
  isWorkspaceRoleHydrated: boolean;
}

export interface UseCatalogueQueriesResult {
  isCourseCataloguePage: boolean;
  isStudentCatalogueRoute: boolean;
  enrollmentFilter: CourseEnrollmentFilter;
  needsCompleteCourseList: boolean;
  pagedCourseQuery: DefinedUseInfiniteQueryResult<
    InfiniteData<
      { courses: CourseSummary[]; nextCursor?: string | undefined },
      unknown
    >,
    ApiError
  >;
  completeCourseQuery: UseQueryResult<{ courses: CourseSummary[] }, ApiError>;
  publishedCourses: CourseSummary[];
  enrolledCoursesData: ReturnType<typeof useEnrolledCourses>["data"];
  /** Whether the cards may show a price or progress yet (see below). */
  learnerStateKnown: boolean;
  myCoursesQuery: ReturnType<typeof useMyCourses>;
  myCoursesData: ReturnType<typeof useMyCourses>["data"];
  deletedCoursesQuery: UseQueryResult<
    {
      courses: {
        id: string;
        slug: string;
        title: string;
        status: "published" | "draft" | "archived";
        creatorId: string | null;
        deletedAt: string;
      }[];
      nextCursor: string | null;
    },
    ApiError
  >;
  deletedCoursesData:
    | {
        courses: {
          id: string;
          slug: string;
          title: string;
          status: "published" | "draft" | "archived";
          creatorId: string | null;
          deletedAt: string;
        }[];
        nextCursor: string | null;
      }
    | undefined;
  isCourseCatalogueLoadError: boolean;
  isLoadingCourses: boolean;
  handleEnrollmentFilterChange: (filter: CourseEnrollmentFilter) => void;
  deleteCourseMutation: UseMutationResult<
    { slug?: string | undefined },
    ApiError,
    string,
    unknown
  >;
  restoreCourseMutation: UseMutationResult<
    { course: { id: string; slug: string } },
    ApiError,
    string,
    unknown
  >;
  deletingCourseIds: Set<string>;
  setDeletingCourseIds: Dispatch<SetStateAction<Set<string>>>;
}

export function useCatalogueQueries({
  cataloguePathname,
  initialPublishedCoursePage,
  initialPublishedCoursePageNeedsRefresh,
  learningBackground,
  onNavigatePage,
  page,
  renderMain,
  routeCatalogueEnrollmentFilter,
  creatorEnrollmentFilter,
  setCreatorEnrollmentFilter,
  debouncedSearch,
  statusFilter,
  sort,
  authUserFetched,
  workspaceRoleHint,
  isAuthenticated,
  isAdmin,
  effectiveRole,
  isEditingOrCreatingCourse,
  isAuthReady,
  isWorkspaceRoleHydrated,
}: UseCatalogueQueriesArgs): UseCatalogueQueriesResult {
  const isCourseCataloguePage =
    page === "courses" || learningBackground?.page === "courses";
  const isStudentCatalogueRoute =
    isCourseCataloguePage && effectiveRole === "student";
  const enrollmentFilter = isStudentCatalogueRoute
    ? routeCatalogueEnrollmentFilter
    : creatorEnrollmentFilter;
  const shouldLoadCourseSurface =
    (!renderMain || Boolean(learningBackground)) && !isEditingOrCreatingCourse;
  const shouldQueryCourses =
    isCourseCataloguePage &&
    shouldLoadCourseSurface &&
    // The published catalogue is public, so do not serialize it behind the
    // `/auth/me` request. A signed-out visitor can load courses while auth is
    // resolving; a known account still waits for its workspace role to avoid
    // showing the student catalogue in a creator workspace.
    (!isAuthenticated || isWorkspaceRoleHydrated);
  const shouldQueryCreatorCourses =
    isCourseCataloguePage &&
    isAuthReady &&
    shouldLoadCourseSurface &&
    isAuthenticated &&
    (effectiveRole === "creator" || workspaceRoleHint === "creator");

  const needsCompleteCourseList =
    enrollmentFilter !== "all" || statusFilter !== "all" || sort === "progress";
  const pagedCourseQuery = useInfiniteCourses({
    enabled:
      shouldQueryCourses &&
      effectiveRole === "student" &&
      !needsCompleteCourseList,
    search: debouncedSearch,
    sort: sort === "title" ? "title" : "latest",
    initialData: initialPublishedCoursePage,
    initialDataNeedsRefresh: initialPublishedCoursePageNeedsRefresh,
  });
  const completeCourseQuery = useCourses({
    enabled:
      shouldQueryCourses &&
      effectiveRole === "student" &&
      needsCompleteCourseList,
  });
  const pagedPublishedCourses = useMemo(
    () => pagedCourseQuery.data?.pages.flatMap((page) => page.courses) ?? [],
    [pagedCourseQuery.data?.pages],
  );
  const publishedCourses = needsCompleteCourseList
    ? (completeCourseQuery.data?.courses ?? pagedPublishedCourses)
    : pagedPublishedCourses;
  const hasPublishedCourseData =
    completeCourseQuery.data !== undefined ||
    pagedCourseQuery.data !== undefined;
  const isPublishedFetching = needsCompleteCourseList
    ? completeCourseQuery.isFetching
    : pagedCourseQuery.isFetching;
  const enrolledCoursesQuery = useEnrolledCourses({
    enabled:
      isCourseCataloguePage &&
      shouldLoadCourseSurface &&
      effectiveRole === "student" &&
      (isAuthenticated || (!authUserFetched && authStore.hasSessionHint())),
  });
  const enrolledCoursesData = enrolledCoursesQuery.data;
  // What each card may say about this viewer (see the helper).
  const hydrated = useHydrated();
  const identityHint = useAuthIdentityHint();
  const sessionPresentAtBoot = useSessionPresentAtBoot();
  const learnerStateKnown = isViewerCourseStateKnown({
    hydrated,
    signedIn: isAuthenticated,
    sessionChecked: authUserFetched,
    sessionRemembered: sessionPresentAtBoot || identityHint !== null,
    enrolmentsLoaded: enrolledCoursesData !== undefined,
    enrolmentsFailed: enrolledCoursesQuery.isError,
  });
  const myCoursesQuery = useMyCourses({
    enabled:
      enrollmentFilter !== "bin" &&
      ((shouldQueryCourses && effectiveRole === "creator") ||
        shouldQueryCreatorCourses),
  });
  const myCoursesData = myCoursesQuery.data;
  // The bin lists every deleted course, so it takes the academy-wide key.
  const binCapabilities = useCapabilities({
    enabled: isAuthenticated && effectiveRole === "creator",
  });
  const canOpenBin =
    isAdmin || binCapabilities.canOnCourse("course.restore", null);
  // Asked for on every tab, not only on Bin: the tab's badge is this list's
  // length, so asked for only once the tab was open it read 0 until clicked.
  const deletedCoursesQuery = useDeletedCourses(undefined, {
    enabled: shouldQueryCourses && canOpenBin && effectiveRole === "creator",
  });
  const deletedCoursesData = deletedCoursesQuery.data;
  const isCourseCatalogueLoadError =
    effectiveRole === "student"
      ? (needsCompleteCourseList
          ? completeCourseQuery.isError && !completeCourseQuery.isFetching
          : pagedCourseQuery.isError && !pagedCourseQuery.isFetching) &&
        !hasPublishedCourseData
      : enrollmentFilter === "bin"
        ? deletedCoursesQuery.isError &&
          !deletedCoursesQuery.isFetching &&
          !deletedCoursesData
        : myCoursesQuery.isError &&
          !myCoursesQuery.isFetching &&
          !myCoursesData;

  const isRestoringCreatorWorkspace =
    isCourseCataloguePage &&
    Boolean(initialPublishedCoursePage) &&
    workspaceRoleHint === "creator" &&
    !authUserFetched;
  const isResolvingCreatorWorkspace =
    isCourseCataloguePage &&
    isAuthenticated &&
    !isWorkspaceRoleHydrated &&
    (effectiveRole === "creator" || workspaceRoleHint === "creator");
  const isLoadingCourses =
    isRestoringCreatorWorkspace ||
    isResolvingCreatorWorkspace ||
    // Keep the prerendered public catalogue visible while auth and saved
    // workspace preferences hydrate. Those requests must not replace usable
    // static course data with a skeleton.
    (isAuthenticated && !isWorkspaceRoleHydrated && !hasPublishedCourseData) ||
    (effectiveRole === "student"
      ? shouldQueryCourses && isPublishedFetching && !hasPublishedCourseData
      : enrollmentFilter === "bin"
        ? shouldQueryCourses &&
          canOpenBin &&
          deletedCoursesQuery.isFetching &&
          !deletedCoursesData
        : shouldQueryCreatorCourses &&
          myCoursesQuery.isFetching &&
          !myCoursesData);

  useEffect(() => {
    if (
      creatorEnrollmentFilter === "bin" &&
      // Not before the permissions have answered.
      ((!canOpenBin && binCapabilities.data !== undefined) ||
        effectiveRole !== "creator")
    ) {
      setCreatorEnrollmentFilter("all");
    }
  }, [
    creatorEnrollmentFilter,
    canOpenBin,
    binCapabilities.data,
    effectiveRole,
    setCreatorEnrollmentFilter,
  ]);

  useEffect(() => {
    if (!isCourseCataloguePage || !isWorkspaceRoleHydrated) return;
    if (
      effectiveRole === "creator" &&
      isStudentCatalogueFilterSubpath(cataloguePathname)
    ) {
      onNavigatePage?.("/courses");
    }
  }, [
    cataloguePathname,
    effectiveRole,
    isCourseCataloguePage,
    isWorkspaceRoleHydrated,
    onNavigatePage,
  ]);

  const handleEnrollmentFilterChange = useCallback(
    (filter: CourseEnrollmentFilter) => {
      if (isStudentCatalogueRoute) {
        onNavigatePage?.(getStudentCataloguePathForEnrollmentFilter(filter));
        return;
      }
      setCreatorEnrollmentFilter(filter);
    },
    [isStudentCatalogueRoute, onNavigatePage, setCreatorEnrollmentFilter],
  );
  const deleteCourseMutation = useDeleteCourse();
  const restoreCourseMutation = useRestoreCourse();
  const [deletingCourseIds, setDeletingCourseIds] = useState<Set<string>>(
    () => new Set(),
  );
  return {
    isCourseCataloguePage,
    isStudentCatalogueRoute,
    enrollmentFilter,
    needsCompleteCourseList,
    pagedCourseQuery,
    completeCourseQuery,
    publishedCourses,
    enrolledCoursesData,
    learnerStateKnown,
    myCoursesQuery,
    myCoursesData,
    deletedCoursesQuery,
    deletedCoursesData,
    isCourseCatalogueLoadError,
    isLoadingCourses,
    handleEnrollmentFilterChange,
    deleteCourseMutation,
    restoreCourseMutation,
    deletingCourseIds,
    setDeletingCourseIds,
  };
}
