import { Suspense, type Dispatch, type SetStateAction } from "react";
import type {
  UseQueryResult,
  DefinedUseInfiniteQueryResult,
  InfiniteData,
} from "@tanstack/react-query";
import type { CourseSummary } from "@veolms/contracts";
import type { ToastMessage } from "../ToastNotification";
import type { LearningCourse } from "../StudentPages";
import type { CourseQuickFilterCounts } from "../courses/catalogue";
import { CourseCatalogueLoadingSkeleton } from "../courses/CourseCatalogueSkeleton";
import type {
  Course,
  CourseEnrollmentFilter,
  CourseOpenOptions,
  CourseRole,
  CourseSort,
  CourseStatusFilter,
} from "../courses/catalogue";
import { CATALOGUE_CHUNK_URL_PLACEHOLDER } from "../routing/routeChunkPreloads";
import { ChunkStylesheets } from "../routing/ChunkStylesheets";
import type { NavigateTo } from "../routing/navigation";
import { CATALOGUE_CSS_URLS, CATALOGUE_JS_URLS } from "./academyRouteChunkUrls";
import { CourseCatalogue } from "./academyLazyPages";
import type { ApiError } from "../lib/api-error";
import type { AuthUser } from "../store/auth.store";
import type { useMyCourses } from "../services/courses";

export interface CourseCatalogueContentProps {
  effectiveRole: CourseRole;
  surfaceActiveSection: string;
  isAdmin: boolean;
  activeUser: AuthUser | null | undefined;
  authUserFetched: boolean;
  isLoadingCourses: boolean;
  isCourseCatalogueLoadError: boolean;
  needsCompleteCourseList: boolean;
  completeCourseQuery: UseQueryResult<{ courses: CourseSummary[] }, ApiError>;
  pagedCourseQuery: DefinedUseInfiniteQueryResult<
    InfiniteData<
      { courses: CourseSummary[]; nextCursor?: string | undefined },
      unknown
    >,
    ApiError
  >;
  enrollmentFilter: CourseEnrollmentFilter;
  deletedCoursesQuery: UseQueryResult<
    {
      courses: {
        id: string;
        slug: string;
        title: string;
        status: "draft" | "published" | "archived";
        creatorId: string | null;
        deletedAt: string;
      }[];
      nextCursor: string | null;
    },
    ApiError
  >;
  myCoursesQuery: ReturnType<typeof useMyCourses>;
  initialPublishedCoursePage:
    { courses: CourseSummary[]; nextCursor?: string | undefined } | undefined;
  wishlisted: ReadonlySet<string>;
  quickFilterCounts: CourseQuickFilterCounts;
  handleEnrollmentFilterChange: (filter: CourseEnrollmentFilter) => void;
  statusFilter: CourseStatusFilter;
  setStatusFilter: Dispatch<SetStateAction<CourseStatusFilter>>;
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  sort: CourseSort;
  setSort: Dispatch<SetStateAction<CourseSort>>;
  visibleCourses: Course[];
  totalCoursesCount: number;
  toggleWishlist: (course: Pick<Course, "id" | "slug">) => void;
  onOpenCourse: (
    course: Course | LearningCourse,
    options?: CourseOpenOptions,
  ) => void;
  prepareCourseEditorEdit: (course: Course) => void;
  courseMenu: string | null;
  setCourseMenu: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<ToastMessage | null>>;
  onNavigatePage: NavigateTo;
  resetCatalogue: () => void;
  handleDeleteCourse: (course: Course) => Promise<void>;
  handleRestoreCourse: (course: Course) => Promise<void>;
  deletingCourseIds: Set<string>;
}

export function CourseCatalogueContent({
  effectiveRole,
  surfaceActiveSection,
  isAdmin,
  activeUser,
  authUserFetched,
  isLoadingCourses,
  isCourseCatalogueLoadError,
  needsCompleteCourseList,
  completeCourseQuery,
  pagedCourseQuery,
  enrollmentFilter,
  deletedCoursesQuery,
  myCoursesQuery,
  initialPublishedCoursePage,
  wishlisted,
  quickFilterCounts,
  handleEnrollmentFilterChange,
  statusFilter,
  setStatusFilter,
  search,
  setSearch,
  sort,
  setSort,
  visibleCourses,
  totalCoursesCount,
  toggleWishlist,
  onOpenCourse,
  prepareCourseEditorEdit,
  courseMenu,
  setCourseMenu,
  setNotice,
  onNavigatePage,
  resetCatalogue,
  handleDeleteCourse,
  handleRestoreCourse,
  deletingCourseIds,
}: CourseCatalogueContentProps) {
  // prettier-ignore
  return (
    <Suspense
      fallback={<CourseCatalogueLoadingSkeleton role={effectiveRole} />}
    >
      {/* See the guest-home modulepreload note: without this, an early
            state update makes React drop the prerendered catalogue for the
            skeleton fallback — a full-viewport layout shift. The chunk's
            stylesheets are linked so prerendered markup paints styled. */}
      <link rel="modulepreload" href={CATALOGUE_CHUNK_URL_PLACEHOLDER} />
      {CATALOGUE_JS_URLS.map((href) => (
        <link key={href} rel="modulepreload" href={href} />
      ))}
      <ChunkStylesheets hrefs={CATALOGUE_CSS_URLS} />
      <CourseCatalogue
        activeSection={surfaceActiveSection}
        role={effectiveRole}
        isAdmin={isAdmin}
        signedOut={authUserFetched && !activeUser}
        isLoading={isLoadingCourses}
        hasLoadError={isCourseCatalogueLoadError}
        onRetryLoad={() => {
          if (effectiveRole === "student") {
            void (needsCompleteCourseList
              ? completeCourseQuery.refetch()
              : pagedCourseQuery.refetch());
          } else if (enrollmentFilter === "bin") {
            void deletedCoursesQuery.refetch();
          } else {
            void myCoursesQuery.refetch();
          }
        }}
        preloadFirstCourseImage={Boolean(initialPublishedCoursePage)}
        wishlisted={wishlisted}
        quickFilterCounts={quickFilterCounts}
        enrollmentFilter={enrollmentFilter}
        onEnrollmentFilterChange={handleEnrollmentFilterChange}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        search={search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
        visibleCourses={visibleCourses}
        totalCoursesCount={totalCoursesCount}
        hasNextPage={!needsCompleteCourseList && pagedCourseQuery.hasNextPage}
        isFetchingNextPage={pagedCourseQuery.isFetchingNextPage}
        onLoadMore={() => void pagedCourseQuery.fetchNextPage()}
        onWishlist={toggleWishlist}
        onOpenCourse={onOpenCourse}
        onEditIntent={prepareCourseEditorEdit}
        courseMenu={courseMenu}
        setCourseMenu={setCourseMenu}
        setNotice={setNotice}
        onNavigatePage={onNavigatePage}
        onResetCatalogue={resetCatalogue}
        onDeleteCourse={handleDeleteCourse}
        onRestoreCourse={handleRestoreCourse}
        deletingCourseIds={deletingCourseIds}
      />
    </Suspense>
  );
}
