import {
  Suspense,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import type {
  DefinedUseInfiniteQueryResult,
  InfiniteData,
  UseQueryResult,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Outlet } from "react-router";
import type { GuestHomePageResponse, CourseSummary } from "@veolms/contracts";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { CenteredLoadingSpinner } from "../../components/LoadingSpinner";
import type { ToastMessage } from "../../ToastNotification";
import type { LearningCourse } from "../../StudentPages";
import type { CourseQuickFilterCounts } from "../../courses/catalogue";
import type {
  Course,
  CourseEnrollmentFilter,
  CourseOpenOptions,
  CourseRole,
  CourseSort,
  CourseStatusFilter,
} from "../../courses/catalogue";
import { AcademyRouteSkeleton } from "../../routing/AcademyRouteSkeleton";
import { CreatorDashboardSkeleton } from "../../home/creator/CreatorDashboardSkeleton";
import { LearnerHomeContent } from "../LearnerHomeContent";
import { COURSE_OVERVIEW_CHUNK_URL_PLACEHOLDER } from "../../routing/routeChunkPreloads";
import { ChunkStylesheets } from "../../routing/ChunkStylesheets";
import { isStaffRole, getWorkspaceRoleStorageKey } from "../workspaceRole";
import { useAcademyRouteGuardState } from "../../routing/RouteGuards";
import { SIDEBAR_DEFAULT_WIDTH } from "../sidebarPreferences";
import type { ThemeRevealOrigin } from "../themeViewTransition";
import type {
  PageTabColors,
  SidebarMode,
  SidebarPreferences,
} from "../../settings/settingsPreferences";
import type { NavigateTo } from "../../routing/navigation";
import {
  COURSE_OVERVIEW_CSS_URLS,
  COURSE_OVERVIEW_JS_URLS,
} from "../academyRouteChunkUrls";
import {
  OrdersPageRoute,
  OrderHistoryPageRoute,
  CreatorDashboard,
  CourseOverviewPage,
  AnalyticsDashboardPage,
  CourseCreatePage,
  SettingsPage,
  GuestHome,
  PlaceholderPage,
  WorkspacePage,
  ReviewsPage,
  CouponsPage,
  NotificationsPage,
  QuizAnalyticsPage,
  QuizBuilderPage,
  QuizDirectAttemptPage,
  StudentsPage,
  StudentDetailsPage,
  ProgressPage,
  PublicProfilePageRoute,
  PlatformPage,
  TeamPage,
  InvitePage,
  CouponBuilderPage,
  CouponsAccessDenied,
} from "../academyLazyPages";
import {
  CourseEditorRouteFallback,
  AcademyPageFallback,
  DashboardOnItsWay,
} from "../academyPageFallbacks";
import { MovedPageRedirect } from "../MovedPageRedirect";
import type { ThemePreference } from "../academyShellTypes";
import { CourseCatalogueContent } from "../CourseCatalogueContent";
import type { CourseCurriculumPreview } from "../../courses/staticCurriculum";
import type { AuthUser } from "../../store/auth.store";
import type { useMyCourses } from "../../services/courses";
import type { ApiError } from "../../lib/api-error";

export interface UseAcademyPageContentArgs {
  assignmentId: string | undefined;
  couponId: string | undefined;
  courseSlug: string | undefined;
  discussionTab: string;
  initialCourseCurriculum: CourseCurriculumPreview | undefined;
  initialGuestHomeCopy: GuestHomePageResponse | undefined;
  initialGuestHomePage: GuestHomePageResponse | undefined;
  initialPublishedCoursePage:
    { courses: CourseSummary[]; nextCursor?: string | undefined } | undefined;
  navigateBackSection: string | undefined;
  onExitSettings: (() => void) | undefined;
  onNavigateBack: (() => void) | undefined;
  onNavigatePage: NavigateTo;
  onOpenCourse: (
    course: Course | LearningCourse,
    options?: CourseOpenOptions,
  ) => void;
  page: string;
  quizId: string | undefined;
  requestedSection: string | null;
  settingsTab: string;
  platformTab: string | undefined;
  analyticsTab: string | undefined;
  showPageBackButton: boolean;
  username: string | undefined;
  prepareCourseEditorEdit: (course: Course) => void;
  role: CourseRole;
  setRole: Dispatch<SetStateAction<CourseRole>>;
  setSidebarMode: Dispatch<SetStateAction<SidebarMode>>;
  sidebarWidth: number;
  setTheme: Dispatch<SetStateAction<ThemePreference>>;
  theme: ThemePreference;
  resolvedTheme: "light" | "dark";
  appliedAcademyTheme: string;
  setSidebarPreferences: Dispatch<SetStateAction<SidebarPreferences>>;
  sidebarPreferences: SidebarPreferences;
  pageTabColors: PageTabColors;
  setPageTabColors: Dispatch<SetStateAction<PageTabColors>>;
  activeSection: string;
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
  setStatusFilter: Dispatch<SetStateAction<CourseStatusFilter>>;
  statusFilter: CourseStatusFilter;
  setSort: Dispatch<SetStateAction<CourseSort>>;
  sort: CourseSort;
  wishlisted: ReadonlySet<string>;
  courseMenu: string | null;
  setCourseMenu: Dispatch<SetStateAction<string | null>>;
  mobileBottomNavHidden: boolean;
  setNotice: Dispatch<SetStateAction<ToastMessage | null>>;
  isFullscreen: boolean;
  authUserFetched: boolean;
  hydratedWorkspaceRoleHint: "student" | "creator" | null;
  sessionPresentAtBoot: boolean;
  showGuestHomeWhilePending: boolean;
  learnerWasNotEnrolled: boolean;
  activeUser: AuthUser | null | undefined;
  isAuthenticated: boolean;
  userRoles: readonly string[] | undefined;
  isAdmin: boolean;
  effectiveRole: CourseRole;
  routeContentBlocked: boolean;
  isAuthReady: boolean;
  shownSignedOut: boolean;
  discussionsWhileSessionPending: boolean;
  isWorkspaceRoleHydrated: boolean;
  dashboardHomeExpected: boolean;
  /** A creator view is on its way (see useShellSession) though the role still reads student. */
  creatorViewExpected: boolean;
  routeContentHeld: boolean;
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
  myCoursesQuery: ReturnType<typeof useMyCourses>;
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
  isCourseCatalogueLoadError: boolean;
  isLoadingCourses: boolean;
  handleEnrollmentFilterChange: (filter: CourseEnrollmentFilter) => void;
  deletingCourseIds: Set<string>;
  shellProfileKnownName: string | undefined;
  themeRevealOriginRef: RefObject<ThemeRevealOrigin | null>;
  totalCoursesCount: number;
  handleDeleteCourse: (course: Course) => Promise<void>;
  handleRestoreCourse: (course: Course) => Promise<void>;
  quickFilterCounts: CourseQuickFilterCounts;
  visibleCourses: Course[];
  toggleWishlist: (course: Pick<Course, "id" | "slug">) => void;
  resetCatalogue: () => void;
  renderedSidebarMode: SidebarMode;
  toggleFullscreen: () => Promise<void>;
  changePalette: (nextTheme: string, origin?: ThemeRevealOrigin) => void;
  resetSidebarWidth: () => void;
}

export interface UseAcademyPageContentResult {
  renderPageContent: ({
    surfaceCourseSlug,
    surfaceDiscussionTab,
    surfacePage,
    surfaceSection,
    surfaceSettingsTab,
    surfacePlatformTab,
    surfaceUsername,
  }?: {
    surfaceCourseSlug?: string;
    surfaceDiscussionTab?: string;
    surfacePage?: string;
    surfaceSection?: string | null;
    surfaceSettingsTab?: string;
    surfacePlatformTab?: string;
    surfaceUsername?: string;
  }) => ReactNode;
}

export function useAcademyPageContent({
  assignmentId,
  couponId,
  courseSlug,
  discussionTab,
  initialCourseCurriculum,
  initialGuestHomeCopy,
  initialGuestHomePage,
  initialPublishedCoursePage,
  navigateBackSection,
  onExitSettings,
  onNavigateBack,
  onNavigatePage,
  onOpenCourse,
  page,
  quizId,
  requestedSection,
  settingsTab,
  platformTab,
  analyticsTab,
  showPageBackButton,
  username,
  prepareCourseEditorEdit,
  role,
  setRole,
  setSidebarMode,
  sidebarWidth,
  setTheme,
  theme,
  resolvedTheme,
  appliedAcademyTheme,
  setSidebarPreferences,
  sidebarPreferences,
  pageTabColors,
  setPageTabColors,
  activeSection,
  search,
  setSearch,
  setStatusFilter,
  statusFilter,
  setSort,
  sort,
  wishlisted,
  courseMenu,
  setCourseMenu,
  mobileBottomNavHidden,
  setNotice,
  isFullscreen,
  authUserFetched,
  hydratedWorkspaceRoleHint,
  sessionPresentAtBoot,
  showGuestHomeWhilePending,
  learnerWasNotEnrolled,
  activeUser,
  isAuthenticated,
  userRoles,
  isAdmin,
  effectiveRole,
  routeContentBlocked,
  isAuthReady,
  shownSignedOut,
  discussionsWhileSessionPending,
  isWorkspaceRoleHydrated,
  dashboardHomeExpected,
  creatorViewExpected,
  routeContentHeld,
  enrollmentFilter,
  needsCompleteCourseList,
  pagedCourseQuery,
  completeCourseQuery,
  myCoursesQuery,
  deletedCoursesQuery,
  isCourseCatalogueLoadError,
  isLoadingCourses,
  handleEnrollmentFilterChange,
  deletingCourseIds,
  shellProfileKnownName,
  themeRevealOriginRef,
  totalCoursesCount,
  handleDeleteCourse,
  handleRestoreCourse,
  quickFilterCounts,
  visibleCourses,
  toggleWishlist,
  resetCatalogue,
  renderedSidebarMode,
  toggleFullscreen,
  changePalette,
  resetSidebarWidth,
}: UseAcademyPageContentArgs): UseAcademyPageContentResult {
  // What the account may do, for pages that used to ask "is admin".
  const { permissions } = useAcademyRouteGuardState();
  const holds = (...keys: string[]) =>
    isAdmin || keys.some((key) => permissions?.includes(key) ?? false);
  const canManagePlatform = holds(
    "platform.settings.read",
    "platform.settings.update",
    "platform.branding.update",
    "platform.homepage.update",
  );
  // The academy-wide analytics view, rather than "all my courses".
  const seesAcademyAnalytics = holds("analytics.revenue.read");
  const renderPageContent = ({
    surfaceCourseSlug = courseSlug,
    surfaceDiscussionTab = discussionTab,
    surfacePage = page,
    surfaceSection = requestedSection,
    surfaceSettingsTab = settingsTab,
    surfacePlatformTab = platformTab,
    surfaceAnalyticsTab = analyticsTab,
    surfaceUsername = username,
  }: {
    surfaceCourseSlug?: string;
    surfaceDiscussionTab?: string;
    surfacePage?: string;
    surfaceSection?: string | null;
    surfaceSettingsTab?: string;
    surfacePlatformTab?: string;
    surfaceAnalyticsTab?: string;
    surfaceUsername?: string;
  } = {}): ReactNode => {
    const homeIsTheRoute = surfacePage === "home" && page === "home";
    if (
      homeIsTheRoute &&
      (dashboardHomeExpected || effectiveRole === "creator")
    ) {
      // The dashboard, or what stands in for it while the session is
      // checked, the saved view restored, its permission read and its code
      // fetched. All of that is one wait to whoever is watching, so it is
      // one placeholder, and the same element from the first to the last
      // of it: a new one for each step would start its pulse again.
      const dashboardReady =
        effectiveRole === "creator" &&
        !dashboardHomeExpected &&
        !routeContentBlocked;
      return (
        // Keyed, so that it is not taken for the boundary of the home it
        // replaces: React would keep that home in the page, hidden, behind
        // the placeholder, and the frame is laid out by what is in it.
        <Suspense key="dashboard" fallback={<CreatorDashboardSkeleton />}>
          {dashboardReady ? (
            <CreatorDashboard
              onNavigatePage={onNavigatePage}
              academyTheme={appliedAcademyTheme}
              resolvedTheme={resolvedTheme}
            />
          ) : (
            <DashboardOnItsWay />
          )}
        </Suspense>
      );
    }
    if (routeContentHeld) {
      return (
        <AcademyRouteSkeleton
          page={surfacePage}
          role={effectiveRole}
          quizId={quizId}
          isAdmin={isAdmin}
          analyticsTab={surfaceAnalyticsTab}
        />
      );
    }

    const surfaceActiveSection =
      surfaceSection ?? (surfacePage === "courses" ? "Courses" : activeSection);
    // The section is the sidebar entry kept highlighted, and a page outside
    // the menu (Notifications, a quiz) keeps the one it was opened from. So
    // only the catalogue may be turned into another page by its section: any
    // other page is its own, or Notifications opened from Orders showed
    // Orders, and kept showing it on reload (the section rides in the
    // history entry).
    const isSectionPage = (section: string) =>
      surfacePage === "courses" && surfaceActiveSection === section;
    if (surfacePage === "public-profile") {
      return (
        <Suspense fallback={<AcademyPageFallback />}>
          <PublicProfilePageRoute
            username={surfaceUsername}
            onNavigateBack={showPageBackButton ? onNavigateBack : undefined}
          />
        </Suspense>
      );
    }
    // Before the pages that are chosen by section: opened from another
    // page (a learner's row in Students, say) this one keeps that section.
    if (surfacePage === "progress") {
      return (
        <Suspense fallback={<AcademyRouteSkeleton page="progress" />}>
          <ProgressPage
            username={surfaceUsername}
            onNavigatePage={onNavigatePage}
            onNavigateBack={showPageBackButton ? onNavigateBack : undefined}
            setNotice={setNotice}
          />
        </Suspense>
      );
    }
    if (surfacePage === "home" && effectiveRole === "creator") {
      return (
        <Suspense fallback={<CreatorDashboardSkeleton />}>
          <CreatorDashboard
            onNavigatePage={onNavigatePage}
            academyTheme={appliedAcademyTheme}
            resolvedTheme={resolvedTheme}
          />
        </Suspense>
      );
    }
    if (effectiveRole === "student" && surfacePage === "home") {
      const showGuestHomePreview = isAuthReady
        ? !isAuthenticated
        : Boolean(initialGuestHomePage) && showGuestHomeWhilePending;
      const guestHomeCourseCardActions = {
        wishlisted,
        onWishlist: toggleWishlist,
        onOpenCourse,
        courseMenu,
        setCourseMenu,
        setNotice,
      };
      // The home of a learner with no courses: the guest home, greeting
      // them. It can be up before the session has answered (see
      // `learnerWasNotEnrolled`), so the name this tab remembers stands in.
      const newLearnerHome = (
        <GuestHome
          onNavigatePage={onNavigatePage}
          courseCardActions={guestHomeCourseCardActions}
          initialPage={initialGuestHomePage}
          initialCopy={initialGuestHomeCopy}
          learnerName={shellProfileKnownName?.trim() ?? ""}
        />
      );
      // Someone who has just signed in on this page: the guest home they
      // signed in over stays until their own home is ready, so the page
      // swaps once. It stands in from the moment they are signed in, both
      // while the home's code loads and while their courses are on the way;
      // the code's loading state used to be the learner's placeholders, and
      // the page went guest home, placeholders, guest home, their home.
      const justSignedInHome =
        initialGuestHomePage &&
        (showGuestHomeWhilePending ||
          (shownSignedOut && hydratedWorkspaceRoleHint !== "creator")) ? (
          <GuestHome
            onNavigatePage={onNavigatePage}
            courseCardActions={guestHomeCourseCardActions}
            initialPage={initialGuestHomePage}
            initialCopy={initialGuestHomeCopy}
          />
        ) : undefined;
      // The guest home's hero picture is the page's largest paint. Emitting
      // its preload here (not inside the lazy GuestHome) places it in the
      // prerendered document head, so the browser starts the download before
      // hydration instead of after the auth check. One link per art-directed
      // source, matching the hero's <picture>.
      return (
        <LearnerHomeContent
          showGuestHomePreview={showGuestHomePreview}
          isAuthReady={isAuthReady}
          onNavigatePage={onNavigatePage}
          guestHomeCourseCardActions={guestHomeCourseCardActions}
          initialGuestHomePage={initialGuestHomePage}
          initialGuestHomeCopy={initialGuestHomeCopy}
          showGuestHomeWhilePending={showGuestHomeWhilePending}
          learnerWasNotEnrolled={learnerWasNotEnrolled}
          newLearnerHome={newLearnerHome}
          justSignedInHome={justSignedInHome}
          shellProfileKnownName={shellProfileKnownName}
          onOpenCourse={onOpenCourse}
        />
      );
    }
    if (surfacePage === "settings") {
      return (
        <Suspense fallback={null}>
          <SettingsPage
            tab={surfaceSettingsTab}
            role={role}
            userRoles={userRoles}
            isAuthenticated={isAuthenticated}
            isAuthReady={isAuthReady}
            onNavigatePage={onNavigatePage}
            onExitSettings={onExitSettings}
            showBackButton={showPageBackButton}
            theme={theme}
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => void toggleFullscreen()}
            onThemeChange={(next, origin) => {
              if (next !== theme) themeRevealOriginRef.current = origin ?? null;
              setTheme(next);
            }}
            academyTheme={appliedAcademyTheme}
            onAcademyThemeChange={changePalette}
            pageTabColors={pageTabColors}
            onPageTabColorsChange={setPageTabColors}
            sidebarPreferences={sidebarPreferences}
            onSidebarPreferencesChange={setSidebarPreferences}
            sidebarMode={renderedSidebarMode}
            onSidebarModeChange={setSidebarMode}
            sidebarWidthIsDefault={sidebarWidth === SIDEBAR_DEFAULT_WIDTH}
            onSidebarWidthReset={resetSidebarWidth}
          />
        </Suspense>
      );
    }
    if (surfacePage === "workspace") {
      return (
        <Suspense
          fallback={
            surfaceActiveSection === "Discussions" ? null : (
              <AcademyPageFallback />
            )
          }
        >
          <WorkspacePage
            section={surfaceActiveSection}
            role={role}
            discussionTab={surfaceDiscussionTab}
            sessionPending={discussionsWhileSessionPending}
            onNavigatePage={onNavigatePage}
            setNotice={setNotice}
            onSignOut={() => {
              localStorage.removeItem(
                getWorkspaceRoleStorageKey(activeUser?.id),
              );
              setRole("student");
            }}
          />
        </Suspense>
      );
    }
    if (surfacePage === "course-create") {
      return (
        <Suspense fallback={<CourseEditorRouteFallback />}>
          <CourseCreatePage
            onNavigatePage={onNavigatePage}
            bottomNavHidden={mobileBottomNavHidden}
          />
        </Suspense>
      );
    }
    if (surfacePage === "course-overview") {
      return (
        <Suspense fallback={null}>
          {/* The course page is built into the document. As for the
              catalogue and the guest home, the document preloads the page's
              code and links its stylesheets, so the built page is kept
              through hydration and is styled from its first paint. */}
          <link
            rel="modulepreload"
            href={COURSE_OVERVIEW_CHUNK_URL_PLACEHOLDER}
          />
          {COURSE_OVERVIEW_JS_URLS.map((href) => (
            <link key={href} rel="modulepreload" href={href} />
          ))}
          <ChunkStylesheets hrefs={COURSE_OVERVIEW_CSS_URLS} />
          <CourseOverviewPage
            courseSlug={surfaceCourseSlug}
            initialCurriculum={initialCourseCurriculum}
            onNavigateCourses={
              onNavigateBack ?? (() => onNavigatePage("/courses"))
            }
            backSection={onNavigateBack ? navigateBackSection : "Courses"}
            onNavigatePage={onNavigatePage}
            role={role}
            // The page is the same for everyone but for three parts, which
            // hold their places until these have answered (see
            // `courseViewerState`): the session, and for someone signed in
            // the view they are in.
            viewerSettled={
              isAuthReady && (!isAuthenticated || isWorkspaceRoleHydrated)
            }
            presumeGuest={!isAuthReady && !sessionPresentAtBoot}
          />
        </Suspense>
      );
    }
    if (surfacePage === "reviews" || isSectionPage("Reviews")) {
      return (
        <Suspense fallback={<AcademyPageFallback />}>
          <ReviewsPage onNavigatePage={onNavigatePage} setNotice={setNotice} />
        </Suspense>
      );
    }
    if (surfacePage === "coupon-builder") {
      if (!isAuthReady) {
        return (
          <main
            data-coupon-surface=""
            className="mx-auto w-full max-w-[1320px]"
          >
            <CenteredLoadingSpinner
              label="Loading coupon builder"
              className="min-h-52 py-24"
            />
          </main>
        );
      }
      if (!activeUser || !isStaffRole(userRoles)) {
        return (
          <Suspense fallback={<AcademyPageFallback />}>
            <CouponsAccessDenied onNavigatePage={onNavigatePage} />
          </Suspense>
        );
      }
      return (
        <Suspense fallback={<AcademyPageFallback />}>
          <CouponBuilderPage
            couponId={couponId}
            onNavigatePage={onNavigatePage}
            setNotice={setNotice}
          />
        </Suspense>
      );
    }
    if (surfacePage === "home-page-settings") {
      // The Home Page screen moved into the Platform page. Only the route
      // itself leads on: a lesson opened from the old address shows no
      // page behind it rather than leaving the lesson.
      return page === "home-page-settings" ? (
        <MovedPageRedirect
          to="/platform/home"
          onNavigatePage={onNavigatePage}
        />
      ) : (
        <AcademyPageFallback />
      );
    }
    if (surfacePage === "platform") {
      if (!isAuthReady) return <AcademyPageFallback />;
      return (
        <Suspense fallback={<AcademyPageFallback />}>
          <PlatformPage
            tab={surfacePlatformTab}
            canManage={Boolean(activeUser) && canManagePlatform}
            onNavigatePage={onNavigatePage}
            setNotice={setNotice}
          />
        </Suspense>
      );
    }
    if (surfacePage === "team") {
      if (!isAuthReady) return <AcademyPageFallback />;
      return (
        <Suspense fallback={<AcademyPageFallback />}>
          <TeamPage onNavigatePage={onNavigatePage} setNotice={setNotice} />
        </Suspense>
      );
    }
    if (surfacePage === "invite") {
      if (!isAuthReady) return <AcademyPageFallback />;
      return (
        <Suspense fallback={<AcademyPageFallback />}>
          <InvitePage onNavigatePage={onNavigatePage} />
        </Suspense>
      );
    }
    if (surfacePage === "coupons" || isSectionPage("Coupons")) {
      return (
        <Suspense fallback={<AcademyRouteSkeleton page="coupons" />}>
          <CouponsPage onNavigatePage={onNavigatePage} setNotice={setNotice} />
        </Suspense>
      );
    }
    if (surfacePage === "orders" || isSectionPage("Orders")) {
      return (
        <Suspense
          fallback={
            <div
              className="grid min-h-52 place-items-center"
              aria-label="Loading orders"
            >
              <CircleNotch size={26} className="animate-spin text-(--accent)" />
            </div>
          }
        >
          <OrdersPageRoute
            onNavigatePage={onNavigatePage}
            setNotice={setNotice}
          />
        </Suspense>
      );
    }
    if (
      surfacePage === "purchase-history" ||
      isSectionPage("Purchase History")
    ) {
      return (
        <Suspense
          fallback={
            <div
              className="grid min-h-52 place-items-center"
              aria-label="Loading order history"
            >
              <CircleNotch size={26} className="animate-spin text-(--accent)" />
            </div>
          }
        >
          <OrderHistoryPageRoute
            onNavigatePage={onNavigatePage}
            onNavigateBack={onNavigateBack}
            setNotice={setNotice}
          />
        </Suspense>
      );
    }
    if (
      surfacePage === "notifications" ||
      isSectionPage("Notifications") ||
      isSectionPage("Notification")
    ) {
      return (
        <Suspense fallback={<AcademyPageFallback />}>
          <NotificationsPage
            onNavigatePage={onNavigatePage}
            onNavigateBack={onNavigateBack}
            setNotice={setNotice}
          />
        </Suspense>
      );
    }
    if (surfacePage === "quiz-builder") {
      if (effectiveRole !== "creator") {
        return null;
      }
      return (
        <Suspense
          fallback={
            <AcademyRouteSkeleton page="quiz-builder" quizId={quizId} />
          }
        >
          <QuizBuilderPage quizId={quizId} onNavigatePage={onNavigatePage} />
        </Suspense>
      );
    }
    if (surfacePage === "quiz-attempt") {
      return (
        <Suspense fallback={<AcademyPageFallback />}>
          <QuizDirectAttemptPage
            assignmentId={assignmentId}
            onNavigatePage={onNavigatePage}
          />
        </Suspense>
      );
    }
    if (surfacePage === "quizzes") {
      return (
        <Suspense fallback={<AcademyRouteSkeleton page="quizzes" />}>
          <QuizAnalyticsPage role={role} onNavigatePage={onNavigatePage} />
        </Suspense>
      );
    }
    if (surfacePage === "student-details") {
      if (effectiveRole !== "creator") {
        return null;
      }
      return (
        <Suspense fallback={<AcademyRouteSkeleton page="student-details" />}>
          <StudentDetailsPage
            username={surfaceUsername}
            onNavigatePage={onNavigatePage}
            setNotice={setNotice}
          />
        </Suspense>
      );
    }
    if (surfacePage === "students" || isSectionPage("Students")) {
      if (effectiveRole !== "creator") {
        return null;
      }
      return (
        <Suspense fallback={<AcademyRouteSkeleton page="students" />}>
          <StudentsPage onNavigatePage={onNavigatePage} setNotice={setNotice} />
        </Suspense>
      );
    }
    if (surfacePage === "analytics" || isSectionPage("Analytics")) {
      if (effectiveRole !== "creator") {
        // Until the session has answered and the saved view is in, the
        // page's own frame stays up rather than a blank; a learner (never a
        // creator) still gets nothing.
        return isAuthReady && !creatorViewExpected ? null : (
          <AcademyRouteSkeleton
            page="analytics"
            isAdmin={seesAcademyAnalytics}
            analyticsTab={surfaceAnalyticsTab}
          />
        );
      }
      return (
        <Suspense
          fallback={
            <AcademyRouteSkeleton
              page="analytics"
              isAdmin={seesAcademyAnalytics}
              analyticsTab={surfaceAnalyticsTab}
            />
          }
        >
          <AnalyticsDashboardPage
            role={role}
            isAdmin={seesAcademyAnalytics}
            tab={surfaceAnalyticsTab}
            onNavigatePage={onNavigatePage}
          />
        </Suspense>
      );
    }
    if (surfacePage === "extension") {
      // A plugin page: the matched child route of the academy layout.
      return <Outlet />;
    }
    if (surfacePage === "placeholder") {
      return (
        <Suspense fallback={<AcademyPageFallback />}>
          <PlaceholderPage
            section={surfaceActiveSection}
            role={role}
            userRoles={userRoles}
          />
        </Suspense>
      );
    }
    return (
      <CourseCatalogueContent
        effectiveRole={effectiveRole}
        surfaceActiveSection={surfaceActiveSection}
        isAdmin={isAdmin}
        activeUser={activeUser}
        authUserFetched={authUserFetched}
        isLoadingCourses={isLoadingCourses}
        isCourseCatalogueLoadError={isCourseCatalogueLoadError}
        needsCompleteCourseList={needsCompleteCourseList}
        completeCourseQuery={completeCourseQuery}
        pagedCourseQuery={pagedCourseQuery}
        enrollmentFilter={enrollmentFilter}
        deletedCoursesQuery={deletedCoursesQuery}
        myCoursesQuery={myCoursesQuery}
        initialPublishedCoursePage={initialPublishedCoursePage}
        wishlisted={wishlisted}
        quickFilterCounts={quickFilterCounts}
        handleEnrollmentFilterChange={handleEnrollmentFilterChange}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        search={search}
        setSearch={setSearch}
        sort={sort}
        setSort={setSort}
        visibleCourses={visibleCourses}
        totalCoursesCount={totalCoursesCount}
        toggleWishlist={toggleWishlist}
        onOpenCourse={onOpenCourse}
        prepareCourseEditorEdit={prepareCourseEditorEdit}
        courseMenu={courseMenu}
        setCourseMenu={setCourseMenu}
        setNotice={setNotice}
        onNavigatePage={onNavigatePage}
        resetCatalogue={resetCatalogue}
        handleDeleteCourse={handleDeleteCourse}
        handleRestoreCourse={handleRestoreCourse}
        deletingCourseIds={deletingCourseIds}
      />
    );
  };
  return {
    renderPageContent,
  };
}
