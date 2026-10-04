import {
  Fragment,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { flushSync } from "react-dom";
import type {
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  Ref,
} from "react";
import type {
  CourseListResponse,
  CourseOverviewResponse,
} from "@veolms/contracts";
import {
  normalizeSettingsTab,
  rememberSettingsTab,
  type SettingsTab,
} from "./routing/tabSessionState";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { CenteredLoadingSpinner } from "./components/LoadingSpinner";
import { CornersInIcon as CornersIn } from "@phosphor-icons/react/CornersIn";
import { CornersOutIcon as CornersOut } from "@phosphor-icons/react/CornersOut";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { GearSixIcon as GearSix } from "@phosphor-icons/react/GearSix";
import { MoonIcon as Moon } from "@phosphor-icons/react/Moon";
import { PaletteIcon as Palette } from "@phosphor-icons/react/Palette";
import { QuestionIcon as Question } from "@phosphor-icons/react/Question";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/ShieldCheck";
import { StudentIcon as Student } from "@phosphor-icons/react/Student";
import { ToastNotification, type ToastMessage } from "./ToastNotification";
import { SunIcon as Sun } from "@phosphor-icons/react/Sun";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import logoDarkSvg from "./assets/procodrr-logo-dark.svg?raw";
import type { LearningCourse } from "./StudentPages";
import {
  getLearningPlayerSwipeSplitX,
  isFullLearningPlayerSwipeTarget,
  subscribeToPointerGestureClaims,
} from "./gestures/pointerGestureOwnership";
import { useSecondPressHold } from "./gestures/useSecondPressHold";
import { useEmptyAreaDoubleTap } from "./gestures/useEmptyAreaDoubleTap";
import {
  getCourseQuickFilterCounts,
  getVisibleCourses,
} from "./courses/catalogue";
import {
  getStudentCataloguePathForEnrollmentFilter,
  isStudentCatalogueFilterSubpath,
} from "./courses/catalogueRoutes";
import {
  toggleWishlistCourse,
  useWishlistIds,
} from "./courses/wishlistStorage";
import { CourseCatalogue } from "./courses/CourseCatalogue";
import type {
  Course,
  CourseEnrollmentFilter,
  CourseOpenOptions,
  CourseRole,
  CourseSort,
  CourseStatusFilter,
} from "./courses/catalogue";
import { AcademyPaletteMenu } from "./shell/AcademyPaletteMenu";
import { AcademyRouteSkeleton } from "./routing/AcademyRouteSkeleton";
import { FloatingScrollbar } from "./shell/FloatingScrollbar";
import { useMobileProfileDrawerSize } from "./shell/useMobileProfileDrawerSize";
import { LogoutConfirmModal } from "./shell/LogoutConfirmModal";
import {
  ProfileMenu,
  ProfileMenuIdentity,
  ShellProfileAvatar,
} from "./shell/ProfileMenu";
import { SidebarToggleIcon } from "./shell/SidebarToggleIcon";
import { useCurrentUser, useSignOut } from "./services/auth";
import {
  authStore,
  useAuthIdentityHint,
  useAuthStore,
} from "./store/auth.store";

import {
  useCourses,
  useInfiniteCourses,
  useDeleteCourse,
  useDeletedCourses,
  useMyCourses,
  prefetchCourseEditor,
  useRestoreCourse,
} from "./services/courses";
import { useEnrolledCourses } from "./services/enrollments";
import {
  adaptApiCourseToCatalogueCourse,
  adaptCourseSummaryToCatalogueCourse,
  adaptDeletedCourseToCatalogueCourse,
} from "./courses/courseAdapter";
import {
  getMobileOverflowNavigation,
  getMobilePrimaryNavigation,
  getRoleNavigationItems,
  getNavigationDestination,
  getNavigationIconColor,
} from "./shell/navigation";
import type { NavigationItemWithMetadata } from "./shell/navigation";
import {
  getUserRoles,
  getVisibleWorkspaceRoles,
  hasAdminRole,
  isStaffRole,
  resolveWorkspaceRole,
  getWorkspaceRoleStorageKey,
  getShellProfileSubtitle,
} from "./shell/workspaceRole";
import { useNotificationSummary } from "./services/notifications";

import {
  SIDEBAR_MIN_WIDTH,
  applySidebarShellToDocument,
  clampSidebarMaxWidth,
  clampSidebarWidth,
  getDefaultSidebarPreferences,
  getInitialSidebarPreferences,
  getInitialSidebarShellState,
} from "./shell/sidebarPreferences";
import {
  canStartSidebarTouchGesture,
  COMPACT_NAVIGATION_QUERY,
  getResponsiveSidebarMode,
  getSidebarPresentation,
  SIDEBAR_RESPONSIVE_COLLAPSE_QUERY,
} from "./shell/sidebarVisibility";
import {
  readApplicationScrollPosition,
  scrollApplicationTo,
} from "./shell/applicationScroll";
import {
  applyRootPalette,
  applyWithThemeViewTransition,
  skipActiveThemeViewTransitions,
  themeRevealOriginFromClick,
} from "./shell/themeViewTransition";
import {
  ensureAcademyPaletteCatalogStylesheet,
  ensureAcademyPaletteStylesheets,
} from "./shell/academyPaletteStyles";
import type { ThemeRevealOrigin } from "./shell/themeViewTransition";
import {
  academyThemes,
  DEFAULT_ACADEMY_THEME,
  getInitialAcademyTheme,
  persistAcademyTheme,
} from "./themes";
import type {
  PageTabColors,
  SidebarDockItem,
  SidebarMode,
  SidebarPreferences,
} from "./settings/settingsPreferences";
import {
  applySidebarGlowShapeSize,
  normalizeSidebarDockItems,
  normalizeSidebarDockOrder,
  normalizeSidebarGlow,
  normalizeSidebarGlowBlur,
  normalizeSidebarGlowShape,
  normalizeSidebarGlowIntensity,
  ELEVATED_SURFACES_KEY,
  PAGE_TAB_COLORS_DEFAULT,
  PAGE_TAB_COLORS_KEY,
  readPageTabColors,
} from "./settings/settingsPreferences";
import type { NavigateTo } from "./routing/navigation";
import { useAcademyRouteGuardState } from "./routing/RouteGuards";
import type { SettingsPageProps } from "./SettingsPage";
import { isEditingShortcutTarget } from "./keyboardShortcuts";
import { useGlobalSearchShortcut } from "./searchShortcut";
import { DEFAULT_DEBOUNCE_DELAY_MS, useDebounce } from "./hooks/useDebounce";
import { useBackDismiss } from "./navigation/useBackDismiss";
import { useShortcutPlatform } from "./useShortcutPlatform";
import {
  canToggleDocumentFullscreen,
  getDocumentFullscreenElement,
  toggleDocumentFullscreen,
} from "./fullscreen";
import {
  isStoredString,
  useSessionStorageState,
} from "./learning/useSessionStorageState";
import {
  persistReadingModePreferences,
  readReadingModePreferences,
  READING_MODE_DEFAULTS,
  READING_MODE_CHANGE_EVENT,
} from "./reading-mode/readingModePreferences";
import type { ReadingModePreferences } from "./reading-mode/readingModePreferences";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  type DrawerDismissThen,
} from "@/components/ui/drawer";
import type { ProfilePreferences } from "./settings/profileTypes";
const OrdersPageRoute = lazy(() =>
  import("./orders/OrdersPage").then((module) => ({
    default: module.OrdersPage,
  })),
);
const OrderHistoryPageRoute = lazy(() =>
  import("./order-history/OrderHistoryPage").then((module) => ({
    default: module.OrderHistoryPage,
  })),
);
const CreatorDashboard = lazy(() =>
  import("./CreatorDashboard").then((module) => ({
    default: module.CreatorDashboard,
  })),
);
const ReadingModeQuickMenu = lazy(() =>
  import("./reading-mode/ReadingModeQuickMenu").then((module) => ({
    default: module.ReadingModeQuickMenu,
  })),
);
const SettingsQuickMenu = lazy(() =>
  import("./settings/SettingsQuickMenu").then((module) => ({
    default: module.SettingsQuickMenu,
  })),
);
const CourseOverviewPage = lazy(() =>
  import("./courses/CourseOverviewPage").then((module) => ({
    default: module.CourseOverviewPage,
  })),
);
const AnalyticsDashboardPage = lazy(() =>
  import("./analytics/AnalyticsDashboardPage").then((module) => ({
    default: module.AnalyticsDashboardPage,
  })),
);

const loadCourseCreatePage = () => import("./courses/CourseCreatePage");

const CourseCreatePage = lazy(() =>
  loadCourseCreatePage().then((module) => ({
    default: module.CourseCreatePage,
  })),
);

function CourseEditorRouteFallback() {
  return (
    <CenteredLoadingSpinner
      label="Loading course editor"
      className="min-h-[calc(100dvh-10rem)] w-full"
    />
  );
}

const SettingsPage = lazy(() =>
  import("./SettingsPage").then((module) => ({
    default: module.SettingsPage,
  })),
);

const AuthenticatedHomeBoundary = lazy(() =>
  import("./home/AuthenticatedHomeBoundary").then((module) => ({
    default: module.AuthenticatedHomeBoundary,
  })),
);
const GuestHome = lazy(() =>
  import("./GuestHome").then((module) => ({ default: module.GuestHome })),
);
const PlaceholderPage = lazy(() =>
  import("./courses/PlaceholderPage").then((module) => ({
    default: module.PlaceholderPage,
  })),
);
const WorkspacePage = lazy(() =>
  import("./workspace/WorkspacePages").then((module) => ({
    default: module.WorkspacePage,
  })),
);
const ReviewsPage = lazy(() =>
  import("./reviews/ReviewsPage").then((module) => ({
    default: module.ReviewsPage,
  })),
);
const CouponsPage = lazy(() =>
  import("./coupons/CouponsPage").then((module) => ({
    default: module.CouponsPage,
  })),
);
const NotificationsPage = lazy(() =>
  import("./notifications/NotificationsPage").then((module) => ({
    default: module.NotificationsPage,
  })),
);
const QuizAnalyticsPage = lazy(() =>
  import("./quizzes/QuizAnalyticsPage").then((module) => ({
    default: module.QuizAnalyticsPage,
  })),
);
const QuizBuilderPage = lazy(() =>
  import("./quizzes/QuizBuilderPage").then((module) => ({
    default: module.QuizBuilderPage,
  })),
);
const QuizDirectAttemptPage = lazy(() =>
  import("./quizzes/QuizDirectAttemptPage").then((module) => ({
    default: module.QuizDirectAttemptPage,
  })),
);
const StudentsPage = lazy(() =>
  import("./students/StudentsPage").then((module) => ({
    default: module.StudentsPage,
  })),
);
const StudentDetailsPage = lazy(() =>
  import("./students/StudentDetailsPage").then((module) => ({
    default: module.StudentDetailsPage,
  })),
);
const PublicProfilePageRoute = lazy(() =>
  import("./profiles/PublicProfilePage").then((module) => ({
    default: module.PublicProfilePage,
  })),
);
const CouponBuilderPage = lazy(() =>
  import("./coupons/CouponBuilderPage").then((module) => ({
    default: module.CouponBuilderPage,
  })),
);
const CouponsAccessDenied = lazy(() =>
  import("./coupons/CouponsAccessDenied").then((module) => ({
    default: module.CouponsAccessDenied,
  })),
);

function AcademyPageFallback() {
  return <AcademyRouteSkeleton />;
}

type ThemePreference = "light" | "dark" | "device";
type AppearanceOption = ThemePreference | "theme";
type AppearanceSwipeSource = AppearanceOption;
interface CoursesPageProps {
  initialPublishedCoursePage?: CourseListResponse;
  initialPublishedCoursePageNeedsRefresh?: boolean;
  initialCourseOverview?: CourseOverviewResponse;
  onOpenCourse: (
    course: Course | LearningCourse,
    options?: CourseOpenOptions,
  ) => void;
  onNavigatePage: NavigateTo;
  onNavigateBack?: () => void;
  onExitSettings?: () => void;
  showPageBackButton?: boolean;
  cataloguePathname?: string;
  routeCatalogueEnrollmentFilter?: Extract<
    CourseEnrollmentFilter,
    "all" | "enrolled" | "not-enrolled" | "wishlist"
  >;
  page?: string;
  section?: string | null;
  settingsTab?: string;
  discussionTab?: string;
  courseSlug?: string;
  quizId?: string;
  assignmentId?: string;
  username?: string;
  couponId?: string;
  miniPlayerCourseId?: string | null;
  learningBackground?: {
    courseSlug?: string;
    discussionTab?: string;
    page: string;
    section?: string;
    settingsTab?: string;
  } | null;
  learningMotionStageRef?: Ref<HTMLDivElement>;
  renderMain?: ((context: CoursesPageRenderContext) => ReactNode) | null;
}

export interface CoursesPageRenderContext {
  mobileBottomNavigation: boolean;
  mobileBottomNavigationHidden: boolean;
}

interface AppearanceSwipe {
  pointerId: number;
  source: AppearanceSwipeSource;
  startX: number;
}

interface DockLongPress {
  pointerId: number;
  startX: number;
  startY: number;
  timer: number;
  action: () => void;
}

type SidebarGestureSource = "rail" | "screen" | "overlay" | "overlay-rail";

interface SidebarResize {
  pointerId: number;
  source: SidebarGestureSource;
  screenOverlayAtStart: boolean;
  active: boolean;
  startedAt: number;
  startX: number;
  startY: number;
  lastX: number;
  lastTimestamp: number;
  velocityX: number;
  startWidth: number;
  expandedWidthAtStart: number;
  modeAtStart: SidebarMode;
  collapsedAtStart: boolean;
  previewWidth: number;
  handle: HTMLElement | null;
}

interface PointerPositionEvent {
  pointerId: number;
  clientX: number;
  clientY: number;
  timeStamp: number;
  buttons?: number;
  pointerType?: string;
  preventDefault?: () => void;
}

interface SidebarScreenSwipeStartEvent {
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;
  clientX: number;
  clientY: number;
  timeStamp: number;
  target: EventTarget | null;
  handle: HTMLDivElement;
  splitX?: number;
}

interface SidebarTooltip {
  label: string;
  active: boolean;
  top: number;
  left: number;
  focusVisible: boolean;
  preferenceControlled: boolean;
}

function ShortcutKeys({
  className = "",
  keys,
}: {
  className?: string;
  keys: readonly string[];
}) {
  return (
    <span className={`shortcut-keys ${className}`.trim()} aria-hidden="true">
      {keys.map((key, index) => (
        <span className="shortcut-keys__part" key={`${key}-${index}`}>
          {index > 0 && <span className="shortcut-keys__join">+</span>}
          <kbd>{key}</kbd>
        </span>
      ))}
    </span>
  );
}

const SIDEBAR_TOOLTIP_SOURCE_WIDTH = 352;
const SIDEBAR_TOOLTIP_SOURCE_HEIGHT = 177;
const SIDEBAR_TOOLTIP_RENDER_HEIGHT = 38;

function SidebarTooltipSurface() {
  const surfaceRef = useRef<SVGSVGElement>(null);
  const [surfaceWidth, setSurfaceWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return undefined;

    const updateSurfaceWidth = () => {
      const nextWidth = surface.getBoundingClientRect().width;
      if (nextWidth <= 0) return;
      setSurfaceWidth((currentWidth) =>
        currentWidth !== null && Math.abs(currentWidth - nextWidth) < 0.05
          ? currentWidth
          : nextWidth,
      );
    };

    updateSurfaceWidth();
    const resizeObserver = new ResizeObserver(updateSurfaceWidth);
    resizeObserver.observe(surface);
    return () => resizeObserver.disconnect();
  }, []);

  const viewBoxWidth = surfaceWidth
    ? (surfaceWidth * SIDEBAR_TOOLTIP_SOURCE_HEIGHT) /
      SIDEBAR_TOOLTIP_RENDER_HEIGHT
    : SIDEBAR_TOOLTIP_SOURCE_WIDTH;
  const rightEdge = viewBoxWidth - 1;
  const topRightCurveStart = viewBoxWidth - 21;
  const rightCurveControl = viewBoxWidth - 10;
  const bottomRightCurveEnd = viewBoxWidth - 22;

  return (
    <svg
      ref={surfaceRef}
      className="sidebar-nav-tooltip__surface"
      viewBox={`0 0 ${viewBoxWidth} ${SIDEBAR_TOOLTIP_SOURCE_HEIGHT}`}
      preserveAspectRatio="xMinYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="sidebar-tooltip-material"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop className="sidebar-nav-tooltip__surface-start" offset="0%" />
          <stop className="sidebar-nav-tooltip__surface-end" offset="100%" />
        </linearGradient>
        <linearGradient id="sidebar-tooltip-edge" x1="0" y1="0" x2="0" y2="1">
          <stop className="sidebar-nav-tooltip__edge-highlight" offset="0%" />
          <stop className="sidebar-nav-tooltip__edge-accent" offset="100%" />
        </linearGradient>
      </defs>
      <path
        d={`M 51 1 H ${topRightCurveStart} C ${rightCurveControl} 1 ${rightEdge} 10 ${rightEdge} 21 V 156 C ${rightEdge} 167 ${rightCurveControl} 176 ${bottomRightCurveEnd} 176 H 51 C 40 176 34 167 34 156 V 132 C 34 126 32 123 29 120 L 4 96 C 1.6 93.7 0 91.2 0 88.5 C 0 85.8 1.6 83.3 4 81 L 29 56 C 32 53 34 50 34 45 V 21 C 34 10 40 1 51 1 Z`}
      />
    </svg>
  );
}

const procodrrLogoSvg = logoDarkSvg.replace(
  /fill="black"/g,
  'fill="currentColor"',
);

const SIDEBAR_COLLAPSED_WIDTH = 76;
const SIDEBAR_CONTENT_REVEAL_DISTANCE = 24;
const SIDEBAR_GESTURE_ACTIVATION_DISTANCE = 12;
const SIDEBAR_GESTURE_DIRECTION_RATIO = 1.2;
const SIDEBAR_FLING_MIN_DISTANCE = 24;
const SIDEBAR_FLING_VELOCITY = 0.3;
const SIDEBAR_HIDDEN_OFFSET_EXTRA = 18;
const SIDEBAR_REVEAL_COMMIT_THRESHOLD = 0.4;
const APPEARANCE_LONG_PRESS_DURATION = 500;
const APPEARANCE_LONG_PRESS_MOVE_TOLERANCE = 10;
const MOBILE_NAV_HIDE_SCROLL_THRESHOLD = 56;
const MOBILE_NAV_SHOW_SCROLL_THRESHOLD = 18;
const MOBILE_NAV_TOP_GUARD = 12;
const MOBILE_DRAWER_INITIAL_SNAP_POINT = 0.82;

const getLearningMobileMenuSnapPoint = () => {
  const player = document.querySelector<HTMLElement>(
    ".learning-workspace__player-wrap",
  );
  const viewportHeight = window.innerHeight;
  if (!player || viewportHeight <= 0) return MOBILE_DRAWER_INITIAL_SNAP_POINT;

  const playerBottom = Math.max(
    0,
    Math.min(viewportHeight, player.getBoundingClientRect().bottom),
  );
  return Math.max(
    0.2,
    Math.min(0.92, (viewportHeight - playerBottom) / viewportHeight),
  );
};

const SIDEBAR_SWIPE_EXCLUSION_SELECTOR = [
  ".sidebar-resize-handle",
  ".learning-curriculum__resize-rail",
  ".app-slider",
  'input[type="range"]',
  '[role="slider"]',
  "progress",
  '[role="progressbar"]',
  ".course-progress",
  ".learning-progress-track",
  ".home-resume-progress",
  ".home-mini-progress",
  ".learning-card-progress",
  ".learning-curriculum__progress-track",
  "[data-player-control]",
  "[data-player-menu]",
  "[data-sidebar-swipe-ignore]",
].join(",");

const isSidebarSwipeExcludedTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest(SIDEBAR_SWIPE_EXCLUSION_SELECTOR));

const isFocusedSidebarSwipeInput = (target: EventTarget | null) => {
  const focused = document.activeElement;
  if (
    focused instanceof HTMLElement &&
    focused.matches(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
    )
  )
    return true;
  if (!(target instanceof Element)) return false;
  const editable = target.closest<HTMLElement>(
    'input:not([type="range"]), textarea, select, [contenteditable]:not([contenteditable="false"])',
  );
  if (!editable) return false;
  return focused === editable || Boolean(focused && editable.contains(focused));
};

function LoginProfileButton({
  className,
  arrowSize,
  onLogin,
  displayName,
}: {
  className: string;
  arrowSize: number;
  onLogin: () => void;
  displayName?: string;
}) {
  return (
    <button
      type="button"
      className={`${className} courses-profile__login-button`}
      aria-label={
        displayName
          ? `Account for ${displayName}. Open account access`
          : "Login. Sign in for more"
      }
      data-auth-identity-button=""
      onClick={onLogin}
    >
      <i
        aria-hidden="true"
        className="courses-profile__login-icon flex shrink-0 items-center justify-center text-(--accent)"
      >
        <UserCircle size={45.36} weight="thin" />
      </i>
      <span className="courses-profile__login-copy">
        <strong
          className="courses-profile__login-title"
          data-auth-identity-title=""
        >
          {displayName || "Login"}
        </strong>
        <small
          className="courses-profile__login-subtitle"
          data-auth-identity-subtitle=""
        >
          {displayName ? "Account" : "Sign in for more"}
        </small>
      </span>
      <i
        aria-hidden="true"
        className="courses-profile__login-arrow ml-auto flex shrink-0 items-center justify-center text-(--accent)"
      >
        <CaretRight size={arrowSize} weight="bold" />
      </i>
    </button>
  );
}

export function CoursesPage({
  initialPublishedCoursePage,
  initialPublishedCoursePageNeedsRefresh = false,
  initialCourseOverview,
  onOpenCourse,
  onNavigatePage,
  onNavigateBack,
  onExitSettings,
  showPageBackButton = false,
  cataloguePathname = "/courses",
  routeCatalogueEnrollmentFilter = "all",
  page = "courses",
  section: requestedSection = null,
  settingsTab = "profile",
  discussionTab = "q-and-a",
  courseSlug,
  quizId,
  assignmentId,
  username,
  couponId,
  miniPlayerCourseId = null,
  learningBackground = null,
  learningMotionStageRef,
  renderMain = null,
}: CoursesPageProps) {
  const queryClient = useQueryClient();
  const warmCourseEditorChunk = useCallback((_course: Course) => {
    void loadCourseCreatePage().catch(() => undefined);
  }, []);
  const prepareCourseEditorEdit = useCallback(
    (course: Course) => {
      warmCourseEditorChunk(course);
      void prefetchCourseEditor(queryClient, course.id);
    },
    [queryClient, warmCourseEditorChunk],
  );
  // Keep the first client render identical to the prerender. Restore the
  // account-specific workspace role only after `/auth/me` identifies the
  // account below.
  const [role, setRole] = useState<CourseRole>("student");
  const [hydratedWorkspaceRoleKey, setHydratedWorkspaceRoleKey] = useState<
    string | null
  >(null);
  const [savedShellProfiles, setSavedShellProfiles] = useState<
    Record<CourseRole, ProfilePreferences | null>
  >({ student: null, creator: null });
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(
    () => getInitialSidebarShellState().mode,
  );
  const [sidebarWidth, setSidebarWidth] = useState(
    () => getInitialSidebarShellState().width,
  );
  const sidebarShellHydratedRef = useRef(false);

  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [sidebarResizePreviewWidth, setSidebarResizePreviewWidth] = useState<
    number | null
  >(null);
  const [sidebarOverlaySwipeOffset, setSidebarOverlaySwipeOffset] = useState<
    number | null
  >(null);
  // Browser-only input capabilities are applied after startup so the loading
  // boundary remains deterministic across the build and the first client pass.
  const [compactNavigation, setCompactNavigation] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.__VEO_BOOTSTRAP__?.navigation?.compact),
  );
  const [coarseNavigationInput, setCoarseNavigationInput] = useState(false);
  const [edgeSidebarOpen, setEdgeSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>("dark");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");
  const [academyTheme, setAcademyTheme] = useState(DEFAULT_ACADEMY_THEME);
  const [appliedAcademyTheme, setAppliedAcademyTheme] = useState(
    DEFAULT_ACADEMY_THEME,
  );
  const [palettePreviewTheme, setPalettePreviewTheme] = useState<string | null>(
    null,
  );
  const displayedAcademyTheme = palettePreviewTheme ?? academyTheme;
  const [sidebarPreferences, setSidebarPreferences] = useState(
    getDefaultSidebarPreferences,
  );
  const showSidebarOnMobile = sidebarPreferences.showSidebarOnMobile === true;
  const mobileSidebarNavigationActive =
    compactNavigation && showSidebarOnMobile;
  const sidebarAvailable = !compactNavigation || mobileSidebarNavigationActive;
  const [pageTabColors, setPageTabColors] = useState<PageTabColors>(
    PAGE_TAB_COLORS_DEFAULT,
  );
  const sidebarHeaderLayout =
    sidebarPreferences.headerLayout === "fixed" ? "fixed" : "inline";
  const selectedSidebarDockItems = normalizeSidebarDockItems(
    sidebarPreferences.dockItems,
  );
  const sidebarDockItems = normalizeSidebarDockOrder(
    sidebarPreferences.dockOrder,
  ).filter((item) => selectedSidebarDockItems.includes(item));
  const settingsInSidebarDock = sidebarDockItems.includes("settings");
  const readingModeDockIndex = sidebarDockItems.indexOf("reading-mode");
  const sidebarMaxWidth = clampSidebarMaxWidth(
    sidebarPreferences?.sidebarMaxWidth,
  );
  const showSidebarAppearanceControl = sidebarDockItems.includes("appearance");
  const showSidebarThemeIcon = sidebarDockItems.includes("theme");
  const [readingModePreferences, setReadingModePreferences] = useState({
    ...READING_MODE_DEFAULTS,
  });
  const readingModeEnabled = readingModePreferences.enabled;
  const [activeSection, setActiveSection] = useState(() => {
    if (page === "home") return "Home";
    if (page === "courses") return "Courses";
    if (requestedSection) return requestedSection;
    // Keep the initializer deterministic to avoid a server/client hydration
    // mismatch. Route props become authoritative in the effect below.
    return "Courses";
  });
  const [creatorEnrollmentFilter, setCreatorEnrollmentFilter] =
    useState<CourseEnrollmentFilter>("all");
  const [search, setSearch] = useSessionStorageState(
    "veolms-course-catalogue-search",
    "",
    isStoredString,
  );
  const debouncedSearch = useDebounce(search, DEFAULT_DEBOUNCE_DELAY_MS);
  const [statusFilter, setStatusFilter] = useState<CourseStatusFilter>("all");
  const [sort, setSort] = useState<CourseSort>("latest");
  const wishlisted = useWishlistIds();
  const [storedPreferencesReady, setStoredPreferencesReady] = useState(false);
  const [courseMenu, setCourseMenu] = useState<string | null>(null);
  const [profileMenu, setProfileMenu] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [paletteMenu, setPaletteMenu] = useState(false);
  const [paletteMenuSource, setPaletteMenuSource] = useState<
    "appearance" | "theme"
  >("theme");
  const paletteMenuDockIndex = sidebarDockItems.indexOf(
    paletteMenuSource === "appearance" ? "appearance" : "theme",
  );
  const [readingModeMenu, setReadingModeMenu] = useState<
    "desktop" | "mobile" | null
  >(null);
  const [settingsQuickMenu, setSettingsQuickMenu] = useState<
    "desktop" | "mobile" | null
  >(null);
  const [settingsQuickMenuLoaded, setSettingsQuickMenuLoaded] = useState(false);
  const [sidebarTooltip, setSidebarTooltip] = useState<SidebarTooltip | null>(
    null,
  );
  const [navigationScrollFade, setNavigationScrollFade] = useState({
    top: false,
    bottom: false,
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobilePaletteMenu, setMobilePaletteMenu] = useState(false);
  const [mobileMenuCollapsedSnapPoint, setMobileMenuCollapsedSnapPoint] =
    useState(MOBILE_DRAWER_INITIAL_SNAP_POINT);
  const [mobileMenuSnapPoint, setMobileMenuSnapPoint] = useState<
    number | string | null
  >(MOBILE_DRAWER_INITIAL_SNAP_POINT);
  const [mobileBottomNavHidden, setMobileBottomNavHidden] = useState(false);
  const [notice, setNotice] = useState<ToastMessage | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(() =>
    typeof document === "undefined"
      ? false
      : Boolean(getDocumentFullscreenElement(document)),
  );
  const shortcutPlatform = useShortcutPlatform();
  useGlobalSearchShortcut(shortcutPlatform);
  const {
    data: authUser,
    isError: authUserError,
    isFetched: authUserFetched,
  } = useCurrentUser();
  const authIdentityHint = useAuthIdentityHint();
  const workspaceRoleHint = (() => {
    if (typeof window === "undefined" || !authIdentityHint) return null;
    try {
      const storedRole = localStorage.getItem(
        getWorkspaceRoleStorageKey(authIdentityHint.userId),
      );
      return storedRole === "creator" || storedRole === "student"
        ? storedRole
        : null;
    } catch {
      return null;
    }
  })();
  const storeUser = useAuthStore((s) => s.user);
  // Once `/auth/me` has completed, its null result must win over any
  // in-memory login snapshot. Before that, the snapshot is useful only for
  // same-page navigation after login; it is never persisted across reloads.
  const activeUser = authUserFetched && !authUserError ? authUser : storeUser;
  const isAuthenticated = Boolean(activeUser);
  const userRoles = getUserRoles(activeUser);
  const isAdmin = hasAdminRole(userRoles);
  const allowedWorkspaceRoles = useMemo(
    () => getVisibleWorkspaceRoles(userRoles, role),
    [role, userRoles],
  );
  const canSwitchWorkspace =
    allowedWorkspaceRoles.includes("student") &&
    allowedWorkspaceRoles.includes("creator");
  const effectiveRole = useMemo(
    () => (isAuthenticated ? resolveWorkspaceRole(userRoles, role) : "student"),
    [isAuthenticated, role, userRoles],
  );
  const isDashboardRoute = page === "home" && effectiveRole === "creator";
  const roleNavigationItems = useMemo(
    () => getRoleNavigationItems(effectiveRole, isAdmin),
    [effectiveRole, isAdmin],
  );
  const { routeContentBlocked } = useAcademyRouteGuardState();
  const isEditingOrCreatingCourse = page === "course-create";
  const isAuthReady = Boolean(storeUser) || authUserFetched;
  const workspaceRoleKey =
    storedPreferencesReady && authUserFetched
      ? (activeUser?.id ?? "guest")
      : null;
  const isWorkspaceRoleHydrated =
    workspaceRoleKey !== null && hydratedWorkspaceRoleKey === workspaceRoleKey;
  const { isPending: isSigningOut, signOut } = useSignOut();
  const signOutAfterSync = useCallback(async () => {
    try {
      await signOut();
    } catch {
      if (typeof window !== "undefined") window.location.href = "/";
    }
  }, [signOut]);
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
  const { data: enrolledCoursesData } = useEnrolledCourses({
    enabled:
      isCourseCataloguePage &&
      shouldLoadCourseSurface &&
      effectiveRole === "student" &&
      (isAuthenticated || (!authUserFetched && authStore.hasSessionHint())),
  });
  const myCoursesQuery = useMyCourses({
    enabled:
      enrollmentFilter !== "bin" &&
      ((shouldQueryCourses && effectiveRole === "creator") ||
        shouldQueryCreatorCourses),
  });
  const myCoursesData = myCoursesQuery.data;
  const deletedCoursesQuery = useDeletedCourses(undefined, {
    enabled:
      shouldQueryCourses &&
      isAdmin &&
      effectiveRole === "creator" &&
      enrollmentFilter === "bin",
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
          isAdmin &&
          deletedCoursesQuery.isFetching &&
          !deletedCoursesData
        : shouldQueryCreatorCourses &&
          myCoursesQuery.isFetching &&
          !myCoursesData);

  useEffect(() => {
    if (
      creatorEnrollmentFilter === "bin" &&
      (!isAdmin || effectiveRole !== "creator")
    ) {
      setCreatorEnrollmentFilter("all");
    }
  }, [creatorEnrollmentFilter, isAdmin, effectiveRole]);

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
    [isStudentCatalogueRoute, onNavigatePage],
  );
  const deleteCourseMutation = useDeleteCourse();
  const restoreCourseMutation = useRestoreCourse();
  const [deletingCourseIds, setDeletingCourseIds] = useState<Set<string>>(
    () => new Set(),
  );

  const shellProfileDisplayName =
    activeUser?.displayName?.trim() ||
    (!authUserFetched ? authIdentityHint?.displayName : undefined) ||
    "Your name";
  const shellProfileSubtitle = useMemo(
    () =>
      getShellProfileSubtitle(
        effectiveRole,
        userRoles,
        activeUser?.username,
        canSwitchWorkspace,
      ),
    [activeUser?.username, canSwitchWorkspace, effectiveRole, userRoles],
  );
  const ProfileSubtitleIcon =
    effectiveRole === "student"
      ? Student
      : hasAdminRole(userRoles)
        ? ShieldCheck
        : Users;
  const shellProfileAvatarUrl = activeUser?.avatarDataUrl ?? null;
  const shellProfileAvatarSrcSet = activeUser?.avatarSrcSet ?? [];
  const { data: notificationSummary } = useNotificationSummary();
  const unreadNotificationCount = notificationSummary?.unreadCount ?? 0;
  const profileRef = useRef<HTMLDivElement>(null);
  const coursesAppRef = useRef<HTMLDivElement>(null);
  const appliedThemeRef = useRef<"light" | "dark" | null>(null);
  const appliedPaletteRef = useRef<string | null>(null);
  const paletteStyleRequestRef = useRef(0);
  // Pointer-triggered display-mode commits stage their pointer position
  // here so the next reveal emanates from the interaction that caused it.
  // Keyboard and OS-triggered commits leave it null, and the theme effect
  // drains it on every application, so an unrelated earlier click can
  // never become the reveal origin. Palette changes instead pass their
  // origin straight from the interaction handler that commits them.
  const themeRevealOriginRef = useRef<ThemeRevealOrigin | null>(null);
  // Document-level dismiss listeners (outside click, global Escape) only
  // re-subscribe when navigation changes, so they reach the latest revert
  // handler through this ref instead of a stale render's closure.
  const revertPalettePreviewRef = useRef<
    ((origin?: ThemeRevealOrigin) => void) | null
  >(null);
  const openLogoutConfirm = useCallback(() => {
    setProfileMenu(false);
    setLogoutConfirmOpen(true);
  }, [setLogoutConfirmOpen]);
  const dismissProfileMenuThen = useBackDismiss({
    open: profileMenu,
    onDismiss: () => setProfileMenu(false),
  });
  useBackDismiss({
    open: paletteMenu,
    onDismiss: () => {
      revertPalettePreviewRef.current?.();
      setPaletteMenu(false);
    },
  });
  useBackDismiss({
    open: mobilePaletteMenu,
    onDismiss: () => {
      revertPalettePreviewRef.current?.();
      setMobilePaletteMenu(false);
    },
  });
  useBackDismiss({
    open: readingModeMenu !== null,
    onDismiss: () => setReadingModeMenu(null),
  });
  const appearanceControlsRef = useRef<HTMLDivElement>(null);
  const appearanceControlRectsRef = useRef<DOMRect[]>([]);
  const appearanceLayoutRef = useRef<boolean | null>(null);
  const appearanceAnimationsRef = useRef<Animation[]>([]);
  const appearanceModeTriggerRef = useRef<HTMLButtonElement>(null);
  const paletteTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileAppearanceModeTriggerRef = useRef<HTMLButtonElement>(null);
  const mobilePaletteTriggerRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const mainScrollportRef = useRef<HTMLElement>(null);
  const mobileBottomNavRef = useRef<HTMLElement>(null);
  const mobileMoreRef = useRef<HTMLButtonElement>(null);
  const mobileSheetRef = useRef<HTMLDivElement>(null);
  const mobileMenuDismissThenRef = useRef<DrawerDismissThen>(null);
  const dismissSettingsQuickMenuThen = useBackDismiss({
    open: settingsQuickMenu !== null,
    onDismiss: () => setSettingsQuickMenu(null),
  });
  const toggleSettingsNavigationRef = useRef<(() => void) | null>(null);
  const mobileMenuSnapPoints = useMemo(
    () => [mobileMenuCollapsedSnapPoint, 1],
    [mobileMenuCollapsedSnapPoint],
  );
  const isLearningSurface = Boolean(renderMain);
  const { ref: mobileSheetSizeRef, snapPoint: mobileMenuContentSnapPoint } =
    useMobileProfileDrawerSize({
      open: mobileMenuOpen,
      popupRef: mobileSheetRef,
      initialSnapPoint: MOBILE_DRAWER_INITIAL_SNAP_POINT,
      contentKey: `${isAuthenticated}:${canSwitchWorkspace}:${effectiveRole}:${sidebarDockItems.length}`,
    });
  const activeNavigationSection = isLearningSurface
    ? null
    : (requestedSection ??
      (page === "home"
        ? effectiveRole === "creator" && !isAdmin
          ? "Dashboard"
          : "Home"
        : page === "courses"
          ? "Courses"
          : null));
  const isNavigationItemActive = (item: NavigationItemWithMetadata) => {
    const label = item[0];
    return (
      activeNavigationSection === label ||
      (label === "Notifications" && activeNavigationSection === "Notification")
    );
  };
  const sidebarResizeRef = useRef<SidebarResize | null>(null);
  const sidebarScreenSwipeStartRef = useRef<
    ((event: SidebarScreenSwipeStartEvent) => void) | null
  >(null);
  const sidebarResizeMoveRef = useRef<
    ((event: PointerPositionEvent) => void) | null
  >(null);
  const sidebarResizeFinishRef = useRef<
    ((event: PointerPositionEvent, cancelled?: boolean) => void) | null
  >(null);
  const sidebarOverlaySwipeConsumedRef = useRef(false);
  const appearanceSwipeRef = useRef<AppearanceSwipe | null>(null);
  const appearanceSwipeConsumedRef = useRef(false);
  const dockLongPressRef = useRef<DockLongPress | null>(null);
  const dockLongPressConsumedUntilRef = useRef(0);
  const longPressAudioContextRef = useRef<AudioContext | null>(null);
  const sidebarTooltipTimerRef = useRef<number | null>(null);
  const usesMacShortcutStyle = shortcutPlatform === "mac";
  const primaryShortcutModifier = usesMacShortcutStyle ? "Meta" : "Control";
  const settingsShortcutKeys = usesMacShortcutStyle
    ? ["⌘", ","]
    : ["Ctrl", ","];
  const sidebarShortcutTitle = usesMacShortcutStyle ? "⌘+B" : "Ctrl+B";
  const showKeyboardShortcuts =
    sidebarPreferences.showKeyboardShortcuts !== false;
  const settingsShortcutTitle = usesMacShortcutStyle ? "⌘+," : "Ctrl+,";
  const settingsControlTitle = showKeyboardShortcuts
    ? `Open settings (${settingsShortcutTitle})`
    : "Open settings";

  useEffect(
    () =>
      subscribeToPointerGestureClaims(({ pointerId }) => {
        if (sidebarResizeRef.current?.pointerId === pointerId) {
          sidebarResizeRef.current = null;
          setSidebarResizing(false);
          setSidebarResizePreviewWidth(null);
          setSidebarOverlaySwipeOffset(0);
        }
      }),
    [],
  );

  useEffect(() => {
    try {
      const shellState = getInitialSidebarShellState();
      setSidebarMode(shellState.mode);
      setSidebarWidth(shellState.width);
      const storedTheme = localStorage.getItem("veolms-theme");
      setTheme(
        storedTheme === "light" ||
          storedTheme === "dark" ||
          storedTheme === "device"
          ? storedTheme
          : "dark",
      );
      setAcademyTheme(getInitialAcademyTheme());
      setSidebarPreferences(getInitialSidebarPreferences());
      setPageTabColors(readPageTabColors());
      setReadingModePreferences(readReadingModePreferences());
    } catch {
      // Deterministic defaults remain usable when storage is unavailable.
    } finally {
      setStoredPreferencesReady(true);
    }
  }, []);

  useLayoutEffect(() => {
    let shellState = { mode: sidebarMode, width: sidebarWidth };
    const isInitialShellSync = !sidebarShellHydratedRef.current;
    if (isInitialShellSync) {
      sidebarShellHydratedRef.current = true;
      shellState = getInitialSidebarShellState();
      if (shellState.mode !== sidebarMode) setSidebarMode(shellState.mode);
      if (shellState.width !== sidebarWidth) setSidebarWidth(shellState.width);
    }

    applySidebarShellToDocument(shellState);
  }, [sidebarMode, sidebarWidth]);

  useEffect(() => {
    if (!authUserFetched) return;
    const storedRole = localStorage.getItem(
      getWorkspaceRoleStorageKey(activeUser?.id),
    );
    setRole(
      storedRole === "student"
        ? "student"
        : storedRole === "creator" || hasAdminRole(userRoles)
          ? "creator"
          : "student",
    );
    setHydratedWorkspaceRoleKey(activeUser?.id ?? "guest");
  }, [activeUser, authUserFetched, userRoles]);

  useEffect(
    () => () => {
      const press = dockLongPressRef.current;
      if (press) window.clearTimeout(press.timer);
      void longPressAudioContextRef.current?.close();
    },
    [],
  );

  useEffect(() => {
    if (!storedPreferencesReady) return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      // Drain the staged origin on every application: pointer commits stage
      // it right before changing `theme`, while keyboard and OS-triggered
      // applications find it null and reveal from the CSS corner fallback.
      const pointerOrigin = themeRevealOriginRef.current;
      themeRevealOriginRef.current = null;
      const nextTheme =
        theme === "device" ? (media.matches ? "dark" : "light") : theme;
      const commit = () => {
        document.documentElement.dataset.theme = nextTheme;
        document.documentElement.dataset.appearance = theme;
      };
      // Reveal light/dark flips with the circular view transition, but skip it
      // for the initial application so startup stays instant.
      if (appliedThemeRef.current && appliedThemeRef.current !== nextTheme) {
        applyWithThemeViewTransition(
          commit,
          "mode",
          pointerOrigin ?? undefined,
        );
      } else {
        commit();
      }
      appliedThemeRef.current = nextTheme;
      setResolvedTheme(nextTheme);
    };
    applyTheme();
    localStorage.setItem("veolms-theme", theme);
    if (theme !== "device") return undefined;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [storedPreferencesReady, theme]);

  useLayoutEffect(() => {
    if (!compactNavigation) {
      setMobileMenuCollapsedSnapPoint(MOBILE_DRAWER_INITIAL_SNAP_POINT);
      return undefined;
    }
    if (!isLearningSurface) return undefined;
    if (!mobileMenuOpen) return undefined;

    let frame: number | null = null;
    const updateLessonDrawerSnapPoint = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        const nextSnapPoint = Math.max(
          getLearningMobileMenuSnapPoint(),
          mobileMenuContentSnapPoint,
        );
        setMobileMenuCollapsedSnapPoint((current) =>
          Math.abs(current - nextSnapPoint) < 0.002 ? current : nextSnapPoint,
        );
        setMobileMenuSnapPoint((current) =>
          current === 1 ? current : nextSnapPoint,
        );
      });
    };

    updateLessonDrawerSnapPoint();
    const player = document.querySelector<HTMLElement>(
      ".learning-workspace__player-wrap",
    );
    const resizeObserver =
      typeof ResizeObserver === "undefined" || !player
        ? null
        : new ResizeObserver(updateLessonDrawerSnapPoint);
    if (resizeObserver && player) resizeObserver.observe(player);
    window.addEventListener("resize", updateLessonDrawerSnapPoint);
    window.visualViewport?.addEventListener(
      "resize",
      updateLessonDrawerSnapPoint,
    );
    window.addEventListener("scroll", updateLessonDrawerSnapPoint, {
      passive: true,
    });

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateLessonDrawerSnapPoint);
      window.visualViewport?.removeEventListener(
        "resize",
        updateLessonDrawerSnapPoint,
      );
      window.removeEventListener("scroll", updateLessonDrawerSnapPoint);
    };
  }, [
    compactNavigation,
    isLearningSurface,
    mobileMenuOpen,
    mobileMenuContentSnapPoint,
  ]);

  useEffect(() => {
    document.documentElement.dataset.elevatedSurfaces = String(
      localStorage.getItem(ELEVATED_SURFACES_KEY) !== "false",
    );
  }, []);

  useEffect(() => {
    if (!storedPreferencesReady) return;
    // Synchronization only: palette interaction handlers own the animated
    // reveals, so this covers the initial application once stored
    // preferences load and any change that arrives outside a handler.
    if (appliedPaletteRef.current === displayedAcademyTheme) return;
    appliedPaletteRef.current = displayedAcademyTheme;
    applyRootPalette(displayedAcademyTheme);
    setAppliedAcademyTheme(displayedAcademyTheme);
  }, [displayedAcademyTheme, storedPreferencesReady]);

  useEffect(() => {
    if (!storedPreferencesReady) return;
    persistAcademyTheme(academyTheme);
  }, [academyTheme, storedPreferencesReady]);

  useLayoutEffect(() => {
    if (!storedPreferencesReady) return undefined;
    const next = sidebarPreferences || {};
    const root = document.documentElement;
    const nextContentLayout = next.contentLayout || "framed";
    const contentLayoutChanged =
      (root.dataset.contentLayout || "framed") !== nextContentLayout;
    const scrollPosition = contentLayoutChanged
      ? readApplicationScrollPosition()
      : null;
    root.dataset.sidebarIconStyle = next.iconStyle || "monochrome";
    root.dataset.sidebarMonochromeMode = next.monochromeMode || "theme";
    root.dataset.contentLayout = nextContentLayout;
    root.dataset.sidebarHeaderLayout =
      next.headerLayout === "fixed" ? "fixed" : "inline";
    root.dataset.sidebarGlow = normalizeSidebarGlow(next.glowPalette);
    root.dataset.sidebarGlowShape = normalizeSidebarGlowShape(next.glowShape);
    applySidebarGlowShapeSize(next.glowShapeSize, root);
    const nextSidebarBackdropBlur = normalizeSidebarGlowBlur(next.glowBlur);
    root.dataset.sidebarBackdropBlur =
      nextSidebarBackdropBlur === 0 ? "off" : "on";
    root.style.setProperty(
      "--sidebar-backdrop-blur",
      `${nextSidebarBackdropBlur}px`,
    );
    root.style.setProperty(
      "--sidebar-glow-intensity",
      String(normalizeSidebarGlowIntensity(next.glowIntensity) / 100),
    );
    root.dataset.collapsedTooltips = String(next.showCollapsedLabels !== false);
    root.dataset.collapsedSidebarLogo = String(
      next.showCollapsedLogo !== false,
    );
    root.dataset.activeFill = String(next.highlightActive !== false);
    root.dataset.sidebarMenuElevation = String(next.elevateMenus !== false);
    root.style.setProperty(
      "--sidebar-monochrome-color",
      next.monochromeColor || "#6c78ff",
    );
    localStorage.setItem("veolms-sidebar-preferences", JSON.stringify(next));

    if (!scrollPosition) return undefined;

    // The framed layout scrolls the main surface, while edge-to-edge scrolls
    // the document. Transfer the offset before paint so switching the owner
    // does not pull the settings page back to the top.
    void root.offsetHeight;
    const restoreScrollPosition = () =>
      scrollApplicationTo({ ...scrollPosition, behavior: "auto" });
    restoreScrollPosition();
    const frame = window.requestAnimationFrame(restoreScrollPosition);
    return () => window.cancelAnimationFrame(frame);
  }, [sidebarPreferences, storedPreferencesReady]);

  useEffect(() => {
    if (!storedPreferencesReady) return;
    document.documentElement.dataset.pageTabColors = pageTabColors;
    localStorage.setItem(PAGE_TAB_COLORS_KEY, pageTabColors);
  }, [pageTabColors, storedPreferencesReady]);

  useEffect(() => {
    const syncReadingMode = () =>
      setReadingModePreferences(readReadingModePreferences());
    syncReadingMode();
    window.addEventListener(READING_MODE_CHANGE_EVENT, syncReadingMode);
    return () =>
      window.removeEventListener(READING_MODE_CHANGE_EVENT, syncReadingMode);
  }, []);

  useEffect(() => {
    if (!storedPreferencesReady) return;
    setSidebarWidth((currentWidth) => {
      const nextWidth = clampSidebarWidth(currentWidth, sidebarMaxWidth);
      if (nextWidth === currentWidth) return currentWidth;
      localStorage.setItem(
        "veolms-sidebar-width",
        String(Math.round(nextWidth)),
      );
      return nextWidth;
    });
  }, [sidebarMaxWidth, storedPreferencesReady]);

  useEffect(() => {
    const nextRole = resolveWorkspaceRole(userRoles, role);
    if (nextRole !== role) {
      setRole(nextRole);
    }
  }, [role, userRoles]);

  useEffect(() => {
    if (!storedPreferencesReady || !authUserFetched || !isWorkspaceRoleHydrated)
      return;
    localStorage.setItem(getWorkspaceRoleStorageKey(activeUser?.id), role);
    setCourseMenu(null);
    setCreatorEnrollmentFilter("all");
    setStatusFilter("all");
    if (page === "home")
      setActiveSection(
        effectiveRole === "creator" && !isAdmin ? "Dashboard" : "Home",
      );
    else if (requestedSection === "Wishlist") setActiveSection("Courses");
    else if (requestedSection) setActiveSection(requestedSection);
    else if (page === "courses") setActiveSection("Courses");
    else setActiveSection("Courses");
  }, [
    activeUser?.id,
    authUserFetched,
    page,
    requestedSection,
    role,
    effectiveRole,
    isAdmin,
    isWorkspaceRoleHydrated,
    storedPreferencesReady,
  ]);

  useEffect(() => {
    if (page === "course-create") return;
    if (!authUserFetched) return;
    // The initial role is deterministic for SSR/hydration and may still be
    // "student" while the account-specific workspace role is being restored.
    // Do not redirect a valid creator route during that one render window.
    if (!isWorkspaceRoleHydrated || !isAuthenticated) return;

    if (effectiveRole !== "creator") {
      const forbiddenPages = ["students", "student-details", "quiz-builder"];
      if (
        (page && forbiddenPages.includes(page)) ||
        requestedSection === "Students" ||
        requestedSection === "Create Course"
      ) {
        onNavigatePage?.("/");
      }
    }
  }, [
    authUserFetched,
    effectiveRole,
    isAuthenticated,
    isWorkspaceRoleHydrated,
    onNavigatePage,
    page,
    requestedSection,
  ]);

  useEffect(() => {
    if (!storedPreferencesReady || !sidebarShellHydratedRef.current) return;
    localStorage.setItem("veolms-sidebar-mode", sidebarMode);
    localStorage.setItem(
      "veolms-sidebar-collapsed",
      String(sidebarMode === "collapsed"),
    );
    navigationRef.current?.scrollTo({ top: 0 });
    if (sidebarMode !== "hidden") setEdgeSidebarOpen(false);
  }, [sidebarMode, storedPreferencesReady]);

  useEffect(() => {
    if (!storedPreferencesReady) return undefined;
    const media = window.matchMedia(SIDEBAR_RESPONSIVE_COLLAPSE_QUERY);
    let releaseTransitionFrame: number | null = null;
    const applyResponsiveSidebarMode = (event: MediaQueryListEvent) => {
      document.documentElement.dataset.responsiveSidebarSwitching = "true";
      if (releaseTransitionFrame !== null) {
        window.cancelAnimationFrame(releaseTransitionFrame);
      }
      setSidebarMode((currentMode) =>
        getResponsiveSidebarMode(currentMode, event.matches),
      );
      releaseTransitionFrame = window.requestAnimationFrame(() => {
        releaseTransitionFrame = window.requestAnimationFrame(() => {
          delete document.documentElement.dataset.responsiveSidebarSwitching;
          releaseTransitionFrame = null;
        });
      });
    };

    media.addEventListener("change", applyResponsiveSidebarMode);
    return () => {
      media.removeEventListener("change", applyResponsiveSidebarMode);
      if (releaseTransitionFrame !== null) {
        window.cancelAnimationFrame(releaseTransitionFrame);
      }
      delete document.documentElement.dataset.responsiveSidebarSwitching;
    };
  }, [storedPreferencesReady]);

  useEffect(() => {
    const media = window.matchMedia(COMPACT_NAVIGATION_QUERY);
    const coarseInput = window.matchMedia("(hover: none), (pointer: coarse)");
    const syncNavigationMode = () => {
      setCompactNavigation(media.matches);
      setCoarseNavigationInput(coarseInput.matches);
      document.documentElement.dataset.navigationLayout = media.matches
        ? "compact"
        : "wide";
    };
    syncNavigationMode();
    media.addEventListener("change", syncNavigationMode);
    coarseInput.addEventListener("change", syncNavigationMode);
    return () => {
      media.removeEventListener("change", syncNavigationMode);
      coarseInput.removeEventListener("change", syncNavigationMode);
    };
  }, []);

  useEffect(() => {
    setMobileBottomNavHidden(false);
    if (!compactNavigation) return undefined;

    type ScrollSource = Document | Element;

    const rootScrollTop = () =>
      Math.max(
        0,
        document.scrollingElement?.scrollTop ??
          document.documentElement.scrollTop,
      );
    const resolveScrollSource = (target: EventTarget | null): ScrollSource => {
      if (
        target instanceof Element &&
        target !== document.documentElement &&
        target !== document.body
      ) {
        return target;
      }
      return document;
    };
    const readScrollTop = (source: ScrollSource) =>
      source instanceof Element
        ? Math.max(0, source.scrollTop)
        : rootScrollTop();

    const scrollPositions = new Map<ScrollSource, number>([
      [document, rootScrollTop()],
    ]);
    let pendingScrollSource: ScrollSource = document;
    let direction: -1 | 0 | 1 = 0;
    let directionalTravel = 0;
    let frame: number | null = null;

    const revealNavigation = () => {
      direction = 0;
      directionalTravel = 0;
      setMobileBottomNavHidden(false);
    };

    const updateFromScroll = () => {
      frame = null;
      const nextScrollTop = readScrollTop(pendingScrollSource);
      const previousScrollTop = scrollPositions.get(pendingScrollSource) ?? 0;
      const delta = nextScrollTop - previousScrollTop;
      scrollPositions.set(pendingScrollSource, nextScrollTop);

      if (
        mobileMenuOpen ||
        nextScrollTop <= MOBILE_NAV_TOP_GUARD ||
        mobileBottomNavRef.current?.querySelector(":focus-visible")
      ) {
        revealNavigation();
        return;
      }

      if (Math.abs(delta) < 1) return;
      const nextDirection = delta > 0 ? 1 : -1;
      if (nextDirection !== direction) {
        direction = nextDirection;
        directionalTravel = 0;
      }
      directionalTravel += Math.abs(delta);

      if (
        direction === 1 &&
        nextScrollTop > MOBILE_NAV_HIDE_SCROLL_THRESHOLD &&
        directionalTravel >= MOBILE_NAV_HIDE_SCROLL_THRESHOLD
      ) {
        directionalTravel = 0;
        setMobileBottomNavHidden(true);
      } else if (
        direction === -1 &&
        directionalTravel >= MOBILE_NAV_SHOW_SCROLL_THRESHOLD
      ) {
        directionalTravel = 0;
        setMobileBottomNavHidden(false);
      }
    };

    const handleScroll = (event: Event) => {
      pendingScrollSource = resolveScrollSource(event.target);
      if (frame !== null) return;
      frame = window.requestAnimationFrame(updateFromScroll);
    };
    const handleKeyboardNavigation = (event: KeyboardEvent) => {
      if (
        event.key === "Tab" ||
        event.key === "Home" ||
        event.key === "PageUp" ||
        event.key === "ArrowUp"
      ) {
        revealNavigation();
      }
    };

    document.addEventListener("scroll", handleScroll, {
      capture: true,
      passive: true,
    });
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("keydown", handleKeyboardNavigation);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("keydown", handleKeyboardNavigation);
    };
  }, [compactNavigation, mobileMenuOpen, page]);

  useEffect(() => {
    if (!compactNavigation) {
      setMobileMenuOpen(false);
      setMobilePaletteMenu(false);
      setSettingsQuickMenu((current) =>
        current === "mobile" ? null : current,
      );
      setReadingModeMenu((current) => (current === "mobile" ? null : current));
    }
  }, [compactNavigation]);

  useEffect(() => {
    if (!compactNavigation) return;

    if (mobileSidebarNavigationActive) {
      setMobileMenuOpen(false);
      setMobilePaletteMenu(false);
      setSettingsQuickMenu((current) =>
        current === "mobile" ? null : current,
      );
      setReadingModeMenu((current) => (current === "mobile" ? null : current));
      return;
    }

    sidebarResizeRef.current = null;
    setSidebarResizing(false);
    setSidebarResizePreviewWidth(null);
    setSidebarOverlaySwipeOffset(null);
    setEdgeSidebarOpen(false);
    setMobileBottomNavHidden(false);
  }, [compactNavigation, mobileSidebarNavigationActive]);

  useEffect(() => {
    if (paletteMenu || mobilePaletteMenu) {
      void ensureAcademyPaletteCatalogStylesheet().catch(() => undefined);
    }
    if (!paletteMenu && !mobilePaletteMenu) setPalettePreviewTheme(null);
  }, [mobilePaletteMenu, paletteMenu]);

  useEffect(() => {
    if (showSidebarThemeIcon || showSidebarAppearanceControl) return;
    setPalettePreviewTheme(null);
    setPaletteMenu(false);
    setMobilePaletteMenu(false);
  }, [showSidebarAppearanceControl, showSidebarThemeIcon]);

  useEffect(() => {
    let transitionPointer: {
      pointerId: number;
      kind: "palette" | "mode";
      key: string | null;
      startX: number;
      startY: number;
      longPressTimer: number | null;
      longPressModeControl: boolean;
      longPressActivated: boolean;
    } | null = null;
    let suppressNextModeClick = false;
    let resetSuppressedModeClickTimer: number | null = null;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let hasLastPointerPosition = false;
    const root = document.documentElement;
    const getThemeTransitionKind = (): "palette" | "mode" | null => {
      const kind = root.dataset.themeTransition;
      return kind === "palette" || kind === "mode" ? kind : null;
    };
    const findTransitionControlAt = (
      x: number,
      y: number,
      kind: "palette" | "mode",
    ) =>
      Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          kind === "palette"
            ? "[data-theme-swatch]"
            : "[data-appearance-mode-toggle]",
        ),
      ).find((button) => {
        const rect = button.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          x >= rect.left &&
          x <= rect.right &&
          y >= rect.top &&
          y <= rect.bottom
        );
      });
    const findAppearanceModeControlAt = (x: number, y: number) =>
      Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          "[data-appearance-mode-toggle]",
        ),
      ).find((button) => {
        const rect = button.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          x >= rect.left &&
          x <= rect.right &&
          y >= rect.top &&
          y <= rect.bottom
        );
      });
    const openAppearancePaletteFromControl = (control: HTMLButtonElement) =>
      activateAppearanceOption(
        "theme",
        control.hasAttribute("data-mobile-palette-trigger"),
        "appearance",
      );
    const clearTransitionLongPress = (
      press: NonNullable<typeof transitionPointer>,
    ) => {
      if (press.longPressTimer !== null) {
        window.clearTimeout(press.longPressTimer);
        press.longPressTimer = null;
      }
    };
    const suppressNextModeClickOnce = () => {
      suppressNextModeClick = true;
      if (resetSuppressedModeClickTimer !== null) {
        window.clearTimeout(resetSuppressedModeClickTimer);
      }
      resetSuppressedModeClickTimer = window.setTimeout(() => {
        suppressNextModeClick = false;
        resetSuppressedModeClickTimer = null;
      }, 0);
    };
    const getTransitionControlKey = (
      button: HTMLButtonElement,
      kind: "palette" | "mode",
    ) => (kind === "palette" ? (button.dataset.themeSwatch ?? null) : "mode");
    const syncTransitionControlCursor = (x: number, y: number) => {
      const kind = getThemeTransitionKind();
      const overTransitionControl =
        kind !== null && Boolean(findTransitionControlAt(x, y, kind));
      if (overTransitionControl) {
        if (root.dataset.themeControlCursor !== "pointer") {
          root.dataset.themeControlCursor = "pointer";
        }
      } else if (root.dataset.themeControlCursor) {
        delete root.dataset.themeControlCursor;
      }
    };
    const onThemeTransitionPointerMove = (event: PointerEvent) => {
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      hasLastPointerPosition = true;
      const press = transitionPointer;
      if (
        press?.pointerId === event.pointerId &&
        press.longPressTimer !== null &&
        Math.hypot(event.clientX - press.startX, event.clientY - press.startY) >
          APPEARANCE_LONG_PRESS_MOVE_TOLERANCE
      ) {
        clearTransitionLongPress(press);
        press.longPressModeControl = false;
      }
      if (getThemeTransitionKind()) {
        syncTransitionControlCursor(lastPointerX, lastPointerY);
      } else if (root.dataset.themeControlCursor) {
        delete root.dataset.themeControlCursor;
      }
    };
    const themeTransitionObserver = new MutationObserver(() => {
      if (!getThemeTransitionKind()) {
        delete root.dataset.themeControlCursor;
        return;
      }
      if (hasLastPointerPosition) {
        syncTransitionControlCursor(lastPointerX, lastPointerY);
      }
    });
    themeTransitionObserver.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme-transition"],
    });
    const dispatchTransitionControlClick = (
      button: HTMLButtonElement,
      event: MouseEvent,
    ) => {
      button.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          composed: true,
          button: event.button,
          buttons: event.buttons,
          clientX: event.clientX,
          clientY: event.clientY,
          detail: event.detail,
          view: window,
        }),
      );
    };
    const isThemeTransitionSurfaceTarget = (target: EventTarget | null) =>
      getThemeTransitionKind() !== null &&
      (target === document || target === root || target === document.body);
    const onThemeTransitionPointerDown = (event: PointerEvent) => {
      const kind = getThemeTransitionKind();
      if (kind) {
        syncTransitionControlCursor(event.clientX, event.clientY);
      }
      if (
        !isThemeTransitionSurfaceTarget(event.target) ||
        !event.isPrimary ||
        event.button !== 0
      )
        return;
      if (!kind) return;
      const modeControl = findAppearanceModeControlAt(
        event.clientX,
        event.clientY,
      );
      const control = findTransitionControlAt(
        event.clientX,
        event.clientY,
        kind,
      );
      transitionPointer = {
        pointerId: event.pointerId,
        kind,
        key: control ? getTransitionControlKey(control, kind) : null,
        startX: event.clientX,
        startY: event.clientY,
        longPressTimer: null,
        longPressModeControl:
          Boolean(modeControl) && event.pointerType !== "mouse",
        longPressActivated: false,
      };
      if (modeControl && event.pointerType !== "mouse") {
        const pointerId = event.pointerId;
        const isMobile = modeControl.hasAttribute(
          "data-mobile-palette-trigger",
        );
        transitionPointer.longPressTimer = window.setTimeout(() => {
          const press = transitionPointer;
          if (!press || press.pointerId !== pointerId) return;
          press.longPressTimer = null;
          press.longPressActivated = true;
          dockLongPressConsumedUntilRef.current = performance.now() + 1000;
          acknowledgeLongPress();
          activateAppearanceOption("theme", isMobile, "appearance");
        }, APPEARANCE_LONG_PRESS_DURATION);
      }
      // Prevent a press on the transition snapshot from being replayed
      // against the page beneath it when the reveal finishes.
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const onThemeTransitionPointerUp = (event: PointerEvent) => {
      const pressedControl = transitionPointer;
      if (pressedControl?.pointerId !== event.pointerId) return;
      clearTransitionLongPress(pressedControl);
      transitionPointer = null;
      event.preventDefault();
      event.stopImmediatePropagation();

      if (pressedControl.longPressActivated) {
        suppressNextModeClickOnce();
        return;
      }

      const control = findTransitionControlAt(
        event.clientX,
        event.clientY,
        pressedControl.kind,
      );
      if (
        !control ||
        getTransitionControlKey(control, pressedControl.kind) !==
          pressedControl.key
      )
        return;

      if (pressedControl.kind === "mode") {
        suppressNextModeClickOnce();
      }
      dispatchTransitionControlClick(control, event);
    };
    const onThemeTransitionPointerCancel = (event: PointerEvent) => {
      if (transitionPointer?.pointerId === event.pointerId) {
        clearTransitionLongPress(transitionPointer);
        transitionPointer = null;
      }
    };
    const onThemeTransitionContextMenu = (event: MouseEvent) => {
      if (!isThemeTransitionSurfaceTarget(event.target)) return;
      const control = findAppearanceModeControlAt(event.clientX, event.clientY);
      if (!control) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      if (transitionPointer) {
        clearTransitionLongPress(transitionPointer);
        transitionPointer.longPressModeControl = true;
        transitionPointer.longPressActivated = true;
      }
      openAppearancePaletteFromControl(control);
    };
    const onThemeTransitionSelectStart = (event: Event) => {
      if (transitionPointer?.longPressModeControl) event.preventDefault();
    };
    const onThemeTransitionClick = (event: MouseEvent) => {
      if (suppressNextModeClick && event.isTrusted) {
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressNextModeClick = false;
        if (resetSuppressedModeClickTimer !== null) {
          window.clearTimeout(resetSuppressedModeClickTimer);
          resetSuppressedModeClickTimer = null;
        }
        return;
      }

      const target = event.target;
      if (!isThemeTransitionSurfaceTarget(target)) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const kind = getThemeTransitionKind();
      if (!kind) return;
      const control = findTransitionControlAt(
        event.clientX,
        event.clientY,
        kind,
      );
      if (control) dispatchTransitionControlClick(control, event);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      const themeTransitionSurfaceTarget =
        isThemeTransitionSurfaceTarget(target);
      if (
        !(event.target instanceof Element) ||
        !event.target.closest("[data-course-menu]")
      )
        setCourseMenu(null);
      const profileSurface =
        event.target instanceof Element &&
        event.target.closest("[data-profile-surface]");
      if (
        !(event.target instanceof Node) ||
        (!profileRef.current?.contains(event.target) && !profileSurface)
      ) {
        setProfileMenu(false);
      }
      if (
        sidebarMode === "hidden" &&
        edgeSidebarOpen &&
        (!(event.target instanceof Element) ||
          !event.target.closest(".courses-sidebar"))
      ) {
        setEdgeSidebarOpen(false);
      }
      if (
        !themeTransitionSurfaceTarget &&
        (!(event.target instanceof Element) ||
          !event.target.closest("[data-palette-menu], [data-palette-trigger]"))
      ) {
        revertPalettePreviewRef.current?.();
        setPaletteMenu(false);
      }
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(
          "[data-reading-mode-menu], [data-reading-mode-trigger], .reading-mode-quick-menu__select-menu",
        )
      ) {
        setReadingModeMenu(null);
      }
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(
          "[data-settings-quick-menu], [data-settings-quick-trigger]",
        )
      ) {
        setSettingsQuickMenu(null);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      const isEditingText = isEditingShortcutTarget(event.target);

      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key === "," &&
        !isEditingText
      ) {
        event.preventDefault();
        toggleSettingsNavigationRef.current?.();
        setActiveSection("Settings");
        setCourseMenu(null);
        setProfileMenu(false);
        setPaletteMenu(false);
        setSettingsQuickMenu(null);
        return;
      }

      if (event.key === "Escape") {
        setCourseMenu(null);
        setProfileMenu(false);
        revertPalettePreviewRef.current?.();
        setPaletteMenu(false);
        setReadingModeMenu(null);
        setSettingsQuickMenu(null);
        setMobileMenuOpen(false);
        setMobilePaletteMenu(false);
        setEdgeSidebarOpen(false);
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "b"
      ) {
        event.preventDefault();
        setSidebarMode((current) =>
          current === "expanded" ? "collapsed" : "expanded",
        );
        setPaletteMenu(false);
        setEdgeSidebarOpen(false);
      }
    };
    document.addEventListener("click", onThemeTransitionClick, true);
    document.addEventListener(
      "pointermove",
      onThemeTransitionPointerMove,
      true,
    );
    document.addEventListener(
      "pointerdown",
      onThemeTransitionPointerDown,
      true,
    );
    document.addEventListener("pointerup", onThemeTransitionPointerUp, true);
    document.addEventListener(
      "pointercancel",
      onThemeTransitionPointerCancel,
      true,
    );
    document.addEventListener(
      "contextmenu",
      onThemeTransitionContextMenu,
      true,
    );
    document.addEventListener(
      "selectstart",
      onThemeTransitionSelectStart,
      true,
    );
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      themeTransitionObserver.disconnect();
      if (transitionPointer) clearTransitionLongPress(transitionPointer);
      delete root.dataset.themeControlCursor;
      if (resetSuppressedModeClickTimer !== null) {
        window.clearTimeout(resetSuppressedModeClickTimer);
      }
      document.removeEventListener("click", onThemeTransitionClick, true);
      document.removeEventListener(
        "pointermove",
        onThemeTransitionPointerMove,
        true,
      );
      document.removeEventListener(
        "pointerdown",
        onThemeTransitionPointerDown,
        true,
      );
      document.removeEventListener(
        "pointerup",
        onThemeTransitionPointerUp,
        true,
      );
      document.removeEventListener(
        "pointercancel",
        onThemeTransitionPointerCancel,
        true,
      );
      document.removeEventListener(
        "contextmenu",
        onThemeTransitionContextMenu,
        true,
      );
      document.removeEventListener(
        "selectstart",
        onThemeTransitionSelectStart,
        true,
      );
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [edgeSidebarOpen, onNavigatePage, sidebarMode]);

  const navigation = roleNavigationItems.filter(
    ([label]) => label !== "Settings" || !settingsInSidebarDock,
  );
  const updateNavigationScrollFade = () => {
    const nav = navigationRef.current;
    if (!nav) return;

    const maxScrollTop = Math.max(0, nav.scrollHeight - nav.clientHeight);
    const hasOverflow = maxScrollTop > 2;
    const hasScrolled = hasOverflow && nav.scrollTop > 2;
    const next = {
      top: hasScrolled,
      bottom: hasScrolled && nav.scrollTop < maxScrollTop - 2,
    };

    setNavigationScrollFade((current) =>
      current.top === next.top && current.bottom === next.bottom
        ? current
        : next,
    );
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateNavigationScrollFade);
    const handleResize = () => updateNavigationScrollFade();
    window.addEventListener("resize", handleResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
    };
  }, [compactNavigation, effectiveRole, navigation, sidebarMode]);

  const allCourses = useMemo(() => {
    if (effectiveRole !== "creator") {
      const enrolledSet = new Set<string>();
      const progressMap = new Map<string, number | null>();
      if (enrolledCoursesData?.courses) {
        for (const ec of enrolledCoursesData.courses) {
          enrolledSet.add(ec.courseId);
          if (ec.courseSlug) enrolledSet.add(ec.courseSlug);
          progressMap.set(ec.courseId, ec.progress);
          if (ec.courseSlug) progressMap.set(ec.courseSlug, ec.progress);
        }
      }
      if (typeof window !== "undefined") {
        for (const ec of enrolledCoursesData?.courses || []) {
          try {
            const courseKey = encodeURIComponent(ec.courseSlug);
            const serverProgress =
              typeof ec.progress === "number" && Number.isFinite(ec.progress)
                ? Math.max(0, Math.min(100, Math.round(ec.progress)))
                : null;
            const total = ec.totalLessons > 0 ? ec.totalLessons : 84;
            let localEstimate: number | null = null;

            const detailedProgStr = localStorage.getItem(
              `veolms-learning-${courseKey}-progress`,
            );
            if (detailedProgStr) {
              const progMap = JSON.parse(detailedProgStr) as Record<
                string,
                number
              >;
              const vals = Object.values(progMap).filter(
                (value) => typeof value === "number" && Number.isFinite(value),
              );
              // Sparse session maps (often 1 lesson) must not replace server %.
              // Only trust local when it covers a meaningful share of the course.
              if (
                vals.length > 0 &&
                vals.length >= Math.min(10, total * 0.05)
              ) {
                const sum = vals.reduce((a, b) => a + b, 0);
                localEstimate = Math.min(100, Math.round(sum / total));
              }
            }

            if (localEstimate == null) {
              const lastLessonStr = localStorage.getItem(
                `veolms-last-lesson-${courseKey}`,
              );
              if (lastLessonStr) {
                const lessonNum = parseInt(lastLessonStr, 10);
                // last-lesson is a resume pointer, not completion — never let it
                // drop below the enrolled-courses API progress.
                if (!isNaN(lessonNum) && lessonNum > 0) {
                  localEstimate = Math.min(
                    100,
                    Math.round((lessonNum / total) * 100),
                  );
                }
              }
            }

            const nextProgress =
              serverProgress == null
                ? localEstimate
                : localEstimate == null
                  ? serverProgress
                  : Math.max(serverProgress, localEstimate);

            if (nextProgress != null) {
              progressMap.set(ec.courseId, nextProgress);
              if (ec.courseSlug) progressMap.set(ec.courseSlug, nextProgress);
            }
          } catch {
            // Ignore storage errors
          }
        }
      }
      return publishedCourses.map((summary) =>
        adaptCourseSummaryToCatalogueCourse(summary, enrolledSet, progressMap),
      );
    }
    if (enrollmentFilter === "bin") {
      return (deletedCoursesData?.courses || []).map(
        adaptDeletedCourseToCatalogueCourse,
      );
    }
    return (myCoursesData?.courses || []).map(adaptApiCourseToCatalogueCourse);
  }, [
    deletedCoursesData?.courses,
    effectiveRole,
    enrollmentFilter,
    enrolledCoursesData,
    myCoursesData?.courses,
    publishedCourses,
  ]);

  const totalCoursesCount = useMemo(() => {
    if (effectiveRole !== "creator") {
      return publishedCourses.length;
    }
    return (
      (myCoursesData?.courses?.length ?? 0) +
      (deletedCoursesData?.courses?.length ?? 0)
    );
  }, [
    deletedCoursesData?.courses?.length,
    effectiveRole,
    myCoursesData?.courses?.length,
    publishedCourses.length,
  ]);

  const handleDeleteCourse = async (course: Course) => {
    setDeletingCourseIds((prev) => new Set(prev).add(course.id));
    try {
      await deleteCourseMutation.mutateAsync(course.id);
      setNotice(`${course.title} moved to Bin.`);
    } catch (err: unknown) {
      const apiError = err as { message?: string };
      setNotice(
        apiError?.message ||
          `Failed to move "${course.title}" to Bin. Please try again.`,
      );
      throw err;
    } finally {
      setDeletingCourseIds((prev) => {
        const next = new Set(prev);
        next.delete(course.id);
        return next;
      });
    }
  };

  const handleRestoreCourse = async (course: Course) => {
    try {
      await restoreCourseMutation.mutateAsync(course.id);
      setNotice(`${course.title} was restored.`);
    } catch (err: unknown) {
      const apiError = err as { message?: string };
      setNotice(
        apiError?.message ||
          `Failed to restore "${course.title}". Please try again.`,
      );
      throw err;
    }
  };

  const catalogueForQuickFilterCounts = useMemo(() => {
    if (effectiveRole === "creator") {
      return (myCoursesData?.courses || []).map(
        adaptApiCourseToCatalogueCourse,
      );
    }
    return allCourses;
  }, [allCourses, effectiveRole, myCoursesData?.courses]);

  const quickFilterCounts = useMemo(() => {
    const counts = getCourseQuickFilterCounts(catalogueForQuickFilterCounts, {
      wishlisted,
      role: effectiveRole,
      statusFilter,
      search:
        !needsCompleteCourseList && pagedCourseQuery.isPlaceholderData
          ? ""
          : debouncedSearch,
    });
    if (effectiveRole === "creator") {
      return {
        ...counts,
        bin: deletedCoursesData?.courses?.length ?? 0,
      };
    }
    return counts;
  }, [
    catalogueForQuickFilterCounts,
    debouncedSearch,
    deletedCoursesData?.courses?.length,
    effectiveRole,
    needsCompleteCourseList,
    pagedCourseQuery.isPlaceholderData,
    statusFilter,
    wishlisted,
  ]);

  const visibleCourses = useMemo(
    () =>
      getVisibleCourses(allCourses, {
        wishlisted,
        role: effectiveRole,
        enrollmentFilter,
        statusFilter,
        search:
          !needsCompleteCourseList && pagedCourseQuery.isPlaceholderData
            ? ""
            : debouncedSearch,
        sort,
      }),
    [
      allCourses,
      effectiveRole,
      enrollmentFilter,
      debouncedSearch,
      needsCompleteCourseList,
      pagedCourseQuery.isPlaceholderData,
      sort,
      statusFilter,
      wishlisted,
    ],
  );

  const toggleWishlist = (course: Course) => {
    toggleWishlistCourse(course);
  };

  const resetCatalogue = () => {
    setSearch("");
    setStatusFilter("all");
    if (isStudentCatalogueRoute) {
      onNavigatePage?.("/courses");
    } else {
      setCreatorEnrollmentFilter("all");
    }
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    setProfileMenu(false);
    setMobilePaletteMenu(false);
    setSettingsQuickMenu((current) => (current === "mobile" ? null : current));
    setReadingModeMenu((current) => (current === "mobile" ? null : current));
  };

  const openMobileNavigationMenu = () => {
    const nextSnapPoint = isLearningSurface
      ? Math.max(getLearningMobileMenuSnapPoint(), mobileMenuContentSnapPoint)
      : mobileMenuContentSnapPoint;
    setMobilePaletteMenu(false);
    setMobileMenuCollapsedSnapPoint(nextSnapPoint);
    setMobileMenuSnapPoint(nextSnapPoint);
    setMobileMenuOpen(true);
  };
  const dismissMobileMenuThen = (action: () => void) => {
    if (mobileMenuOpen && mobileMenuDismissThenRef.current) {
      mobileMenuDismissThenRef.current(action);
      return;
    }
    closeMobileMenu();
    action();
  };

  const selectNavigation = (
    label: string,
    item?: NavigationItemWithMetadata,
  ) => {
    setEdgeSidebarOpen(false);
    dismissMobileMenuThen(() => {
      onNavigatePage?.(getNavigationDestination(item ?? label));
    });
  };

  const toggleSettingsNavigation = () => {
    setSettingsQuickMenu(null);
    if (page !== "settings") {
      selectNavigation("Settings");
      return;
    }

    setEdgeSidebarOpen(false);
    dismissMobileMenuThen(() => onExitSettings?.());
  };
  toggleSettingsNavigationRef.current = toggleSettingsNavigation;

  const navigateSettingsQuickMenu = (tab: SettingsTab) => {
    const surface = settingsQuickMenu;
    rememberSettingsTab(tab);
    const navigate = () =>
      onNavigatePage?.(`/settings/${tab}`, { resetScroll: true });
    dismissSettingsQuickMenuThen(() => {
      if (surface === "mobile") {
        setEdgeSidebarOpen(false);
        dismissMobileMenuThen(navigate);
      } else {
        navigate();
      }
    });
  };

  const navigationUsesCompactInteraction =
    compactNavigation || coarseNavigationInput;
  // The first client render of a prerendered document stays deterministic so
  // hydration can match. SPA fallback and auth-gated remounts run this
  // initializer in the browser and adopt the head bootstrap before paint.
  const renderedSidebarMode = sidebarMode;
  const renderedSidebarWidth = sidebarWidth;
  const { collapsed: sidebarCollapsed, hidden: sidebarHidden } =
    getSidebarPresentation(renderedSidebarMode);
  const sidebarPresentedAsOverlay = sidebarHidden || compactNavigation;
  const sidebarVisuallyCollapsed =
    sidebarCollapsed && !sidebarPresentedAsOverlay;

  const sidebarControlAction = compactNavigation
    ? "Close navigation"
    : sidebarHidden
      ? "Pin navigation"
      : sidebarCollapsed
        ? "Expand navigation"
        : "Collapse navigation";
  const sidebarControlTooltipAction = compactNavigation
    ? "Close"
    : sidebarHidden
      ? "Pin"
      : sidebarCollapsed
        ? "Expand"
        : "Collapse";
  const sidebarControlTitle = showKeyboardShortcuts
    ? `${sidebarControlTooltipAction} (${sidebarShortcutTitle})`
    : sidebarControlTooltipAction;
  const sidebarBrandTitle = compactNavigation
    ? "Navigation"
    : sidebarHidden
      ? "Double-click to pin sidebar"
      : "Double-click to float sidebar";
  const appearanceControlsHorizontal =
    !sidebarVisuallyCollapsed ||
    (sidebarResizing &&
      (sidebarResizePreviewWidth ?? SIDEBAR_COLLAPSED_WIDTH) >=
        SIDEBAR_MIN_WIDTH);

  useLayoutEffect(() => {
    const group = appearanceControlsRef.current;
    if (!group) return;

    const controls = [
      ...group.querySelectorAll<HTMLElement>(
        ":scope > button, :scope > .sidebar-palette-wrap",
      ),
    ];
    const nextRects = controls.map((control) =>
      control.getBoundingClientRect(),
    );
    const previousRects = appearanceControlRectsRef.current;
    const layoutChanged =
      appearanceLayoutRef.current !== null &&
      appearanceLayoutRef.current !== appearanceControlsHorizontal;

    if (
      layoutChanged &&
      previousRects.length === nextRects.length &&
      window.localStorage.getItem("veolms-reduce-animations") !== "true" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      appearanceAnimationsRef.current.forEach((animation) =>
        animation.cancel(),
      );
      const animations = controls.flatMap((control, index) => {
        const previousRect = previousRects[index];
        const nextRect = nextRects[index];
        if (!previousRect || !nextRect) return [];
        const deltaX = previousRect.left - nextRect.left;
        const deltaY = previousRect.top - nextRect.top;
        if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return [];
        return [
          control.animate(
            [
              { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
              { transform: "translate3d(0, 0, 0)" },
            ],
            {
              duration: 260,
              easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            },
          ),
        ];
      });
      appearanceAnimationsRef.current = animations;
      void Promise.allSettled(
        animations.map((animation) => animation.finished),
      ).then(() => {
        if (appearanceAnimationsRef.current !== animations) return;
        animations.forEach((animation) => animation.cancel());
        appearanceAnimationsRef.current = [];
      });
    }

    appearanceControlRectsRef.current = nextRects;
    appearanceLayoutRef.current = appearanceControlsHorizontal;
  }, [appearanceControlsHorizontal, sidebarResizePreviewWidth, sidebarWidth]);

  useEffect(
    () => () => {
      appearanceAnimationsRef.current.forEach((animation) =>
        animation.cancel(),
      );
    },
    [],
  );

  const toggleAppearance = (mobile = false) => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
    revertPalettePreviewRef.current?.();
    setReadingModeMenu(null);
    if (mobile) setMobilePaletteMenu(false);
    else setPaletteMenu(false);
  };
  const updateReadingMode = (preferences: Partial<ReadingModePreferences>) => {
    const next = persistReadingModePreferences({
      ...readReadingModePreferences(),
      ...preferences,
    });
    setReadingModePreferences(next);
  };
  const toggleReadingMode = () => {
    updateReadingMode({ enabled: !readingModePreferences.enabled });
  };
  const showReadingModeMenu = (mobile = false) => {
    revertPalettePreviewRef.current?.();
    setPaletteMenu(false);
    setMobilePaletteMenu(false);
    setSettingsQuickMenu(null);
    setReadingModeMenu(mobile ? "mobile" : "desktop");
  };
  const showSettingsQuickMenu = (mobile = false) => {
    revertPalettePreviewRef.current?.();
    setProfileMenu(false);
    setPaletteMenu(false);
    setMobilePaletteMenu(false);
    setReadingModeMenu(null);
    setSettingsQuickMenuLoaded(true);
    setSettingsQuickMenu(mobile ? "mobile" : "desktop");
  };
  const openSettingsQuickMenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    mobile = false,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const target = mobile ? "mobile" : "desktop";
    if (settingsQuickMenu === target) {
      setSettingsQuickMenu(null);
      return;
    }
    showSettingsQuickMenu(mobile);
  };
  const openReadingModeMenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    mobile = false,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (readingModeMenu === (mobile ? "mobile" : "desktop")) {
      setReadingModeMenu(null);
      return;
    }
    showReadingModeMenu(mobile);
  };
  const fullscreenActionLabel = isFullscreen ? "Exit fullscreen" : "Fullscreen";
  const toggleFullscreen = useCallback(async () => {
    try {
      setIsFullscreen(await toggleDocumentFullscreen(document));
    } catch {
      setNotice("Fullscreen is not available in this browser.");
    }
  }, [setNotice]);
  const handleEmptyAreaDoubleTap = useEmptyAreaDoubleTap(
    () => void toggleFullscreen(),
  );

  useEffect(() => {
    const syncFullscreenState = () =>
      setIsFullscreen(Boolean(getDocumentFullscreenElement(document)));
    const handleFullscreenShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.key !== "F11" ||
        !canToggleDocumentFullscreen(document)
      )
        return;
      event.preventDefault();
      void toggleFullscreen();
    };

    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState);
    window.addEventListener("keydown", handleFullscreenShortcut, true);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener(
        "webkitfullscreenchange",
        syncFullscreenState,
      );
      window.removeEventListener("keydown", handleFullscreenShortcut, true);
    };
  }, [toggleFullscreen]);
  const consumeAppearanceGestureClick = (
    event: ReactMouseEvent<HTMLElement>,
  ) => {
    const consumedLongPress =
      dockLongPressConsumedUntilRef.current > performance.now();
    if (!appearanceSwipeConsumedRef.current && !consumedLongPress) return false;
    appearanceSwipeConsumedRef.current = false;
    dockLongPressConsumedUntilRef.current = 0;
    event.preventDefault();
    event.stopPropagation();
    return true;
  };

  // Applies a palette change as one synchronous commit: the root dataset
  // for CSS-driven colors plus the appliedAcademyTheme React mirror for
  // prop-driven surfaces (settings previews, dashboard charts). Handlers
  // run this inside the view transition so those React re-renders land
  // between the old and new snapshots and join the reveal instead of
  // flipping ahead of it. Flushing synchronously is only legal here, in
  // the interaction handler — never from an effect.
  const commitPalette = (nextTheme: string) => {
    appliedPaletteRef.current = nextTheme;
    applyRootPalette(nextTheme);
    setAppliedAcademyTheme(nextTheme);
  };

  const changePalette = (nextTheme: string, origin?: ThemeRevealOrigin) => {
    const requestId = ++paletteStyleRequestRef.current;
    // Selecting what is already displayed runs no transition; plain state
    // updates keep the committed selection and preview in sync.
    if (nextTheme === displayedAcademyTheme) {
      setAcademyTheme(nextTheme);
      setPalettePreviewTheme(null);
      return;
    }
    void ensureAcademyPaletteStylesheets(nextTheme)
      .then(() => {
        if (paletteStyleRequestRef.current !== requestId) return;
        applyWithThemeViewTransition(
          () =>
            flushSync(() => {
              setAcademyTheme(nextTheme);
              setPalettePreviewTheme(null);
              commitPalette(nextTheme);
            }),
          "palette",
          origin,
        );
      })
      .catch(() => undefined);
  };

  const previewAcademyTheme = (themeId: string, origin?: ThemeRevealOrigin) => {
    const requestId = ++paletteStyleRequestRef.current;
    // No transition when the previewed theme already matches the displayed
    // one; keyboard previews carry the focused swatch's center and pointer
    // previews carry the pointer position as the reveal origin.
    if (themeId === displayedAcademyTheme) {
      setPalettePreviewTheme(themeId);
      return;
    }
    void ensureAcademyPaletteStylesheets(themeId)
      .then(() => {
        if (paletteStyleRequestRef.current !== requestId) return;
        applyWithThemeViewTransition(
          () =>
            flushSync(() => {
              setPalettePreviewTheme(themeId);
              commitPalette(themeId);
            }),
          "palette",
          origin,
        );
      })
      .catch(() => undefined);
  };

  // Reverts an unconfirmed keyboard preview back to the committed theme.
  // Only the revert (previewed theme differing from the committed one)
  // runs a transition; otherwise clearing the preview changes nothing
  // displayed and stays silent. Keyboard Escape carries the focused
  // swatch's center; other dismissals pass nothing for the corner
  // fallback.
  const revertPalettePreview = (origin?: ThemeRevealOrigin) => {
    paletteStyleRequestRef.current += 1;
    if (!palettePreviewTheme || palettePreviewTheme === academyTheme) {
      setPalettePreviewTheme(null);
      return;
    }
    const committedTheme = academyTheme;
    applyWithThemeViewTransition(
      () =>
        flushSync(() => {
          setPalettePreviewTheme(null);
          commitPalette(committedTheme);
        }),
      "palette",
      origin,
    );
  };
  revertPalettePreviewRef.current = revertPalettePreview;

  const focusPaletteTrigger = (trigger: HTMLButtonElement | null) => {
    window.setTimeout(() => trigger?.focus({ preventScroll: true }), 0);
  };

  const confirmDesktopPaletteTheme = (themeId: string) => {
    changePalette(themeId);
    setPaletteMenu(false);
    focusPaletteTrigger(
      paletteMenuSource === "appearance"
        ? appearanceModeTriggerRef.current
        : paletteTriggerRef.current,
    );
  };

  const cancelDesktopPalettePreview = (origin?: ThemeRevealOrigin) => {
    revertPalettePreview(origin);
    setPaletteMenu(false);
    focusPaletteTrigger(
      paletteMenuSource === "appearance"
        ? appearanceModeTriggerRef.current
        : paletteTriggerRef.current,
    );
  };

  const confirmMobilePaletteTheme = (themeId: string) => {
    changePalette(themeId);
    setMobilePaletteMenu(false);
    focusPaletteTrigger(
      paletteMenuSource === "appearance"
        ? mobileAppearanceModeTriggerRef.current
        : mobilePaletteTriggerRef.current,
    );
  };

  const cancelMobilePalettePreview = (origin?: ThemeRevealOrigin) => {
    revertPalettePreview(origin);
    setMobilePaletteMenu(false);
    focusPaletteTrigger(
      paletteMenuSource === "appearance"
        ? mobileAppearanceModeTriggerRef.current
        : mobilePaletteTriggerRef.current,
    );
  };

  const activateAppearanceOption = (
    option: AppearanceOption,
    mobile = false,
    source: "appearance" | "theme" = "theme",
  ) => {
    setReadingModeMenu(null);
    if (option === "theme") {
      if (document.documentElement.dataset.themeTransition) {
        skipActiveThemeViewTransitions();
      }
      setPaletteMenuSource(source);
      if (mobile) setMobilePaletteMenu(true);
      else setPaletteMenu(true);
      return;
    }
    setTheme(option);
    revertPalettePreview();
    if (mobile) setMobilePaletteMenu(false);
    else setPaletteMenu(false);
  };

  const openAppearanceThemeMenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    mobile = false,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const isOpen = mobile
      ? mobilePaletteMenu && paletteMenuSource === "appearance"
      : paletteMenu && paletteMenuSource === "appearance";
    if (isOpen) {
      revertPalettePreviewRef.current?.();
      if (mobile) setMobilePaletteMenu(false);
      else setPaletteMenu(false);
      return;
    }
    setReadingModeMenu(null);
    activateAppearanceOption("theme", mobile, "appearance");
  };

  const getLongPressAudioContext = () => {
    if (longPressAudioContextRef.current) {
      return longPressAudioContextRef.current;
    }
    const AudioContextConstructor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextConstructor) return null;
    const context = new AudioContextConstructor();
    longPressAudioContextRef.current = context;
    return context;
  };

  const primeLongPressFeedback = () => {
    const context = getLongPressAudioContext();
    if (context?.state === "suspended") {
      void context.resume().catch(() => undefined);
    }
  };

  const playLongPressPop = (context: AudioContext) => {
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(460, now);
    oscillator.frequency.exponentialRampToValueAtTime(280, now + 0.065);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.025, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.08);
  };

  const acknowledgeLongPress = () => {
    try {
      if (navigator.vibrate?.(18)) return;
    } catch {
      // Use the audio acknowledgement when haptics are unavailable or rejected.
    }

    const context = getLongPressAudioContext();
    if (!context) return;
    if (context.state === "suspended") {
      void context
        .resume()
        .then(() => playLongPressPop(context))
        .catch(() => undefined);
      return;
    }
    playLongPressPop(context);
  };

  const startDockLongPress = (
    event: ReactPointerEvent<HTMLButtonElement>,
    action: () => void,
    includeMouse = false,
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (event.pointerType === "mouse" && !includeMouse) return;

    primeLongPressFeedback();
    const previousPress = dockLongPressRef.current;
    if (previousPress) window.clearTimeout(previousPress.timer);
    const pointerId = event.pointerId;
    const timer = window.setTimeout(() => {
      const press = dockLongPressRef.current;
      if (!press || press.pointerId !== pointerId) return;
      dockLongPressConsumedUntilRef.current = performance.now() + 1000;
      acknowledgeLongPress();
      press.action();
    }, APPEARANCE_LONG_PRESS_DURATION);
    dockLongPressRef.current = {
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer,
      action,
    };
    try {
      event.currentTarget.setPointerCapture?.(pointerId);
    } catch {
      // Pointer capture is optional; the press still resolves on the button.
    }
  };

  const moveDockLongPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const press = dockLongPressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (
      Math.hypot(event.clientX - press.startX, event.clientY - press.startY) <=
      APPEARANCE_LONG_PRESS_MOVE_TOLERANCE
    )
      return;
    window.clearTimeout(press.timer);
    dockLongPressRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Capture may already have been released by the browser.
    }
  };

  const finishDockLongPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const press = dockLongPressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    window.clearTimeout(press.timer);
    dockLongPressRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Capture may already have been released by the browser.
    }
  };

  const startAppearanceSwipe = (
    event: ReactPointerEvent<HTMLButtonElement>,
    source: AppearanceSwipeSource,
  ) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.stopPropagation();
    appearanceSwipeRef.current = {
      pointerId: event.pointerId,
      source,
      startX: event.clientX,
    };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is optional; the button still receives the gesture end.
    }
  };

  const finishAppearanceSwipe = (
    event: ReactPointerEvent<HTMLButtonElement>,
    source: AppearanceSwipeSource,
    mobile = false,
  ) => {
    event.stopPropagation();
    const swipe = appearanceSwipeRef.current;
    if (
      !swipe ||
      swipe.pointerId !== event.pointerId ||
      swipe.source !== source
    )
      return;
    appearanceSwipeRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Release can be a no-op when capture was unavailable.
    }

    const delta = event.clientX - swipe.startX;
    if (Math.abs(delta) < 28) return;

    appearanceSwipeConsumedRef.current = true;
    const options: readonly AppearanceOption[] = ["light", "dark", "theme"];
    const sourceIndex = options.indexOf(source);
    const direction = delta > 0 ? 1 : -1;
    const nextOption =
      options[(sourceIndex + direction + options.length) % options.length];
    // Only a swipe that lands on a different display mode stages the reveal
    // origin; swiping onto "theme" (or the current mode) changes nothing.
    if (nextOption !== "theme" && nextOption !== theme) {
      themeRevealOriginRef.current = themeRevealOriginFromClick(event);
    }
    activateAppearanceOption(nextOption!, mobile);
    window.setTimeout(() => {
      appearanceSwipeConsumedRef.current = false;
    }, 0);
  };

  const cancelAppearanceSwipe = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    const swipe = appearanceSwipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    appearanceSwipeRef.current = null;
    appearanceSwipeConsumedRef.current = false;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Release can be a no-op when capture was unavailable.
    }
  };
  const sidebarResizeContentVisible =
    sidebarResizing &&
    (sidebarResizePreviewWidth ?? SIDEBAR_COLLAPSED_WIDTH) >=
      SIDEBAR_COLLAPSED_WIDTH + SIDEBAR_CONTENT_REVEAL_DISTANCE;
  const sidebarClassName = [
    "courses-app",
    isDashboardRoute ? "courses-app--dashboard" : "",
    sidebarVisuallyCollapsed ? "courses-app--collapsed" : "",
    sidebarPresentedAsOverlay ? "courses-app--hidden" : "",
    sidebarPresentedAsOverlay && edgeSidebarOpen
      ? "courses-app--edge-open"
      : "",
    sidebarOverlaySwipeOffset !== null ? "courses-app--overlay-swiping" : "",
    sidebarResizing ? "courses-app--resizing" : "",
    sidebarResizeContentVisible ? "courses-app--resize-content-visible" : "",
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    if (sidebarTooltipTimerRef.current !== null) {
      window.clearTimeout(sidebarTooltipTimerRef.current);
      sidebarTooltipTimerRef.current = null;
    }
    setSidebarTooltip(null);
  }, [
    activeNavigationSection,
    coarseNavigationInput,
    compactNavigation,
    showKeyboardShortcuts,
    sidebarHidden,
    sidebarMode,
  ]);

  const dismissSidebarTooltipImmediately = () => {
    if (sidebarTooltipTimerRef.current !== null) {
      window.clearTimeout(sidebarTooltipTimerRef.current);
      sidebarTooltipTimerRef.current = null;
    }
    setSidebarTooltip(null);
  };

  const showSidebarTooltip = (
    event:
      ReactMouseEvent<HTMLButtonElement> | ReactFocusEvent<HTMLButtonElement>,
    label: string,
    active: boolean,
    showWhenExpanded = false,
    preferenceControlled = true,
  ) => {
    if (
      (!sidebarCollapsed && !showWhenExpanded) ||
      sidebarHidden ||
      compactNavigation ||
      coarseNavigationInput
    )
      return;
    const rect = event.currentTarget.getBoundingClientRect();
    const nextTooltip: SidebarTooltip = {
      label,
      active,
      top: rect.top + rect.height / 2,
      // The tooltip coordinate starts at the SVG tip; its flexible body
      // begins eight pixels later at the same visual offset as before.
      left: rect.right + 2,
      focusVisible:
        event.type === "focus" && event.currentTarget.matches(":focus-visible"),
      preferenceControlled,
    };

    if (sidebarTooltipTimerRef.current !== null) {
      window.clearTimeout(sidebarTooltipTimerRef.current);
      sidebarTooltipTimerRef.current = null;
    }
    if (event.type === "mouseenter") {
      sidebarTooltipTimerRef.current = window.setTimeout(() => {
        setSidebarTooltip(nextTooltip);
        sidebarTooltipTimerRef.current = null;
      }, 260);
      return;
    }
    setSidebarTooltip(nextTooltip);
  };

  const hideCollapsedNavigationTooltip = (
    event:
      ReactMouseEvent<HTMLButtonElement> | ReactFocusEvent<HTMLButtonElement>,
  ) => {
    if (sidebarTooltipTimerRef.current !== null) {
      window.clearTimeout(sidebarTooltipTimerRef.current);
      sidebarTooltipTimerRef.current = null;
    }
    if (
      event?.type === "mouseleave" &&
      document.activeElement === event.currentTarget
    )
      return;
    if (event?.type === "blur" && event.currentTarget.matches(":hover")) return;
    setSidebarTooltip(null);
  };

  const commitSidebarWidth = (value: number) => {
    const nextWidth = clampSidebarWidth(value, sidebarMaxWidth);
    setSidebarWidth(nextWidth);
    localStorage.setItem("veolms-sidebar-width", String(Math.round(nextWidth)));
  };

  const createSidebarGesture = ({
    active,
    clientX,
    clientY,
    handle,
    pointerId,
    source,
    timeStamp,
  }: {
    active: boolean;
    clientX: number;
    clientY: number;
    handle: HTMLElement | null;
    pointerId: number;
    source: SidebarGestureSource;
    timeStamp: number;
  }): SidebarResize => {
    const overlayGesture = source === "overlay" || source === "overlay-rail";
    const screenOverlayAtStart =
      source === "screen" && sidebarPresentedAsOverlay;
    const collapsedAtStart =
      sidebarVisuallyCollapsed ||
      (sidebarPresentedAsOverlay && !overlayGesture);
    const expandedWidthAtStart = clampSidebarWidth(
      Math.max(SIDEBAR_MIN_WIDTH, sidebarWidth),
      sidebarMaxWidth,
    );
    const startWidth = collapsedAtStart
      ? SIDEBAR_COLLAPSED_WIDTH
      : expandedWidthAtStart;

    return {
      pointerId,
      source,
      screenOverlayAtStart,
      active,
      startedAt: timeStamp,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastTimestamp: timeStamp,
      velocityX: 0,
      startWidth,
      expandedWidthAtStart,
      modeAtStart: sidebarMode,
      collapsedAtStart,
      previewWidth: startWidth,
      handle,
    };
  };

  const activateSidebarGesture = (resize: SidebarResize) => {
    if (resize.active) return;
    resize.active = true;
    dismissSidebarTooltipImmediately();
    if (resize.screenOverlayAtStart) {
      sidebarOverlaySwipeConsumedRef.current = true;
      setEdgeSidebarOpen(true);
      setSidebarOverlaySwipeOffset(
        -resize.expandedWidthAtStart - SIDEBAR_HIDDEN_OFFSET_EXTRA,
      );
      try {
        resize.handle?.setPointerCapture?.(resize.pointerId);
      } catch {
        // Window-level pointer listeners keep the reveal gesture active.
      }
      return;
    }
    if (resize.source === "overlay") {
      sidebarOverlaySwipeConsumedRef.current = true;
      setSidebarOverlaySwipeOffset(0);
      try {
        resize.handle?.setPointerCapture?.(resize.pointerId);
      } catch {
        // Window-level pointer listeners keep the overlay gesture active.
      }
      return;
    }
    setSidebarResizePreviewWidth(resize.previewWidth);
    setSidebarResizing(true);
    try {
      resize.handle?.setPointerCapture?.(resize.pointerId);
    } catch {
      // Window-level pointer listeners keep the gesture alive without capture.
    }
  };

  const startSidebarScreenSwipe = (event: SidebarScreenSwipeStartEvent) => {
    const startsInOpenOverlay =
      sidebarPresentedAsOverlay &&
      edgeSidebarOpen &&
      event.target instanceof Element &&
      Boolean(event.target.closest(".courses-sidebar"));
    if (
      !canStartSidebarTouchGesture({
        compactNavigation,
        enabled: !compactNavigation || mobileSidebarNavigationActive,
        hidden: sidebarPresentedAsOverlay,
        isPrimary: event.isPrimary,
        pointerType: event.pointerType,
      }) ||
      (!compactNavigation &&
        !startsInOpenOverlay &&
        renderMain &&
        event.clientX >= (event.splitX ?? window.innerWidth / 2)) ||
      sidebarResizeRef.current ||
      isSidebarSwipeExcludedTarget(event.target) ||
      isFocusedSidebarSwipeInput(event.target)
    )
      return;

    sidebarResizeRef.current = createSidebarGesture({
      active: false,
      clientX: event.clientX,
      clientY: event.clientY,
      handle: event.handle,
      pointerId: event.pointerId,
      source: startsInOpenOverlay ? "overlay" : "screen",
      timeStamp: event.timeStamp,
    });
  };

  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      (compactNavigation && !sidebarPresentedAsOverlay) ||
      (sidebarPresentedAsOverlay && !edgeSidebarOpen)
    )
      return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dismissSidebarTooltipImmediately();
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    sidebarResizeRef.current = createSidebarGesture({
      active: true,
      clientX: event.clientX,
      clientY: event.clientY,
      handle: event.currentTarget,
      pointerId: event.pointerId,
      source: sidebarPresentedAsOverlay ? "overlay-rail" : "rail",
      timeStamp: event.timeStamp,
    });
    setSidebarResizePreviewWidth(sidebarResizeRef.current.previewWidth);
    setSidebarResizing(true);
  };

  const moveSidebarResize = (event: PointerPositionEvent) => {
    const resize = sidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    if (
      (resize.source === "rail" || resize.source === "overlay-rail") &&
      event.pointerType !== "touch" &&
      event.buttons === 0
    ) {
      endSidebarResize(event, true);
      return;
    }

    const deltaX = event.clientX - resize.startX;
    const deltaY = event.clientY - resize.startY;
    if (!resize.active) {
      const horizontalDistance = Math.abs(deltaX);
      const verticalDistance = Math.abs(deltaY);
      if (
        verticalDistance >= SIDEBAR_GESTURE_ACTIVATION_DISTANCE &&
        verticalDistance > horizontalDistance * SIDEBAR_GESTURE_DIRECTION_RATIO
      ) {
        sidebarResizeRef.current = null;
        return;
      }
      if (horizontalDistance < SIDEBAR_GESTURE_ACTIVATION_DISTANCE) return;
      if (
        horizontalDistance <=
        verticalDistance * SIDEBAR_GESTURE_DIRECTION_RATIO
      )
        return;
      const opensCollapsedSidebar = resize.collapsedAtStart && deltaX > 0;
      const hidesCollapsedSidebar =
        resize.modeAtStart === "collapsed" && deltaX < 0;
      const closesExpandedSidebar = !resize.collapsedAtStart && deltaX < 0;
      const movesOverlay = resize.source === "overlay";
      if (
        !movesOverlay &&
        !opensCollapsedSidebar &&
        !hidesCollapsedSidebar &&
        !closesExpandedSidebar
      ) {
        sidebarResizeRef.current = null;
        return;
      }
      activateSidebarGesture(resize);
    }

    event.preventDefault?.();
    const eventTimestamp = event.timeStamp || performance.now();
    const timestamp = Math.max(eventTimestamp, resize.lastTimestamp + 1);
    const elapsed = timestamp - resize.lastTimestamp;
    const instantaneousVelocity = (event.clientX - resize.lastX) / elapsed;
    resize.velocityX =
      resize.velocityX === 0 || elapsed > 80
        ? instantaneousVelocity
        : resize.velocityX * 0.35 + instantaneousVelocity * 0.65;
    resize.lastX = event.clientX;
    resize.lastTimestamp = timestamp;

    if (resize.screenOverlayAtStart) {
      const hiddenOffset =
        -resize.expandedWidthAtStart - SIDEBAR_HIDDEN_OFFSET_EXTRA;
      const revealOffset = Math.max(
        hiddenOffset,
        Math.min(0, hiddenOffset + Math.max(0, deltaX)),
      );
      setSidebarOverlaySwipeOffset(revealOffset);
      return;
    }
    if (resize.source === "overlay") {
      const offset =
        deltaX < 0
          ? Math.max(-resize.expandedWidthAtStart, deltaX)
          : Math.min(28, deltaX * 0.22);
      setSidebarOverlaySwipeOffset(offset);
      return;
    }

    const maximumWidth =
      resize.source === "screen"
        ? resize.expandedWidthAtStart
        : sidebarMaxWidth;
    const minimumWidth =
      resize.source === "overlay-rail"
        ? SIDEBAR_MIN_WIDTH
        : SIDEBAR_COLLAPSED_WIDTH;
    const previewWidth = Math.min(
      maximumWidth,
      Math.max(minimumWidth, resize.startWidth + deltaX),
    );
    resize.previewWidth = previewWidth;
    setSidebarResizePreviewWidth(previewWidth);
  };

  const endSidebarResize = (event: PointerPositionEvent, cancelled = false) => {
    const resize = sidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    sidebarResizeRef.current = null;
    try {
      resize.handle?.releasePointerCapture?.(resize.pointerId);
    } catch {
      // Capture may already have been released when the gesture ends.
    }

    if (!resize.active) return;

    if (resize.screenOverlayAtStart) {
      const revealDistance = resize.lastX - resize.startX;
      const revealThreshold =
        (resize.expandedWidthAtStart + SIDEBAR_HIDDEN_OFFSET_EXTRA) *
        SIDEBAR_REVEAL_COMMIT_THRESHOLD;
      const intentionalReveal = !cancelled && revealDistance >= revealThreshold;
      setSidebarOverlaySwipeOffset(null);
      setEdgeSidebarOpen(intentionalReveal);
      window.setTimeout(() => {
        sidebarOverlaySwipeConsumedRef.current = false;
      }, 0);
      return;
    }

    if (resize.source === "overlay") {
      setSidebarOverlaySwipeOffset(null);
      const totalDistance = resize.lastX - resize.startX;
      const finishedAt = event.timeStamp || performance.now();
      const averageVelocity =
        totalDistance / Math.max(1, finishedAt - resize.startedAt);
      const intentionalSwipe =
        !cancelled &&
        (Math.abs(totalDistance) >= SIDEBAR_FLING_MIN_DISTANCE ||
          Math.max(Math.abs(resize.velocityX), Math.abs(averageVelocity)) >=
            SIDEBAR_FLING_VELOCITY);

      if (intentionalSwipe && totalDistance < 0) {
        setEdgeSidebarOpen(false);
      } else if (intentionalSwipe && totalDistance > 0) {
        setSidebarWidth(resize.expandedWidthAtStart);
        setSidebarMode("expanded");
        setEdgeSidebarOpen(false);
      }
      window.setTimeout(() => {
        sidebarOverlaySwipeConsumedRef.current = false;
      }, 0);
      return;
    }

    setSidebarResizePreviewWidth(null);
    setSidebarResizing(false);

    if (resize.source === "overlay-rail") {
      if (!cancelled) {
        commitSidebarWidth(Math.max(SIDEBAR_MIN_WIDTH, resize.previewWidth));
      }
      return;
    }

    if (cancelled) {
      setSidebarWidth(resize.expandedWidthAtStart);
      setSidebarMode(resize.modeAtStart);
      return;
    }

    const totalDistance = resize.lastX - resize.startX;
    const finishedAt = event.timeStamp || performance.now();
    const averageVelocity =
      totalDistance / Math.max(1, finishedAt - resize.startedAt);
    const leftwardVelocity = Math.min(resize.velocityX, averageVelocity);
    const shouldHideCollapsedSidebar =
      resize.modeAtStart === "collapsed" &&
      totalDistance < 0 &&
      (Math.abs(totalDistance) >= SIDEBAR_FLING_MIN_DISTANCE ||
        leftwardVelocity <= -SIDEBAR_FLING_VELOCITY);

    if (shouldHideCollapsedSidebar) {
      setSidebarWidth(resize.expandedWidthAtStart);
      setSidebarMode("hidden");
      setPaletteMenu(false);
      setEdgeSidebarOpen(false);
      return;
    }

    const fastFling =
      Math.abs(totalDistance) >= SIDEBAR_FLING_MIN_DISTANCE &&
      Math.max(Math.abs(resize.velocityX), Math.abs(averageVelocity)) >=
        SIDEBAR_FLING_VELOCITY;
    const halfwayWidth =
      SIDEBAR_COLLAPSED_WIDTH +
      (resize.expandedWidthAtStart - SIDEBAR_COLLAPSED_WIDTH) / 2;
    const shouldExpand = resize.collapsedAtStart
      ? (fastFling && totalDistance > 0) || resize.previewWidth >= halfwayWidth
      : !(
          (fastFling && totalDistance < 0) ||
          resize.previewWidth <= halfwayWidth
        );

    if (!shouldExpand) {
      setSidebarWidth(resize.expandedWidthAtStart);
      setSidebarMode(resize.modeAtStart === "hidden" ? "hidden" : "collapsed");
      setPaletteMenu(false);
      setEdgeSidebarOpen(false);
      return;
    }

    setSidebarMode("expanded");
    if (resize.source === "screen") {
      setSidebarWidth(resize.expandedWidthAtStart);
      return;
    }
    commitSidebarWidth(Math.max(SIDEBAR_MIN_WIDTH, resize.previewWidth));
  };

  // Keep the resize alive even when the pointer leaves the narrow handle. The
  // pointer-capture path handles normal interaction; these document listeners
  // make quick drags and releases outside the handle finish predictably too.
  sidebarScreenSwipeStartRef.current = startSidebarScreenSwipe;
  sidebarResizeMoveRef.current = moveSidebarResize;
  sidebarResizeFinishRef.current = endSidebarResize;

  useEffect(() => {
    const startResizeFromHostedPlayer = (event: PointerEvent) => {
      const app = coursesAppRef.current;
      const player = document.querySelector(".learning-workspace__player-wrap");
      if (
        !app ||
        !player ||
        !isFullLearningPlayerSwipeTarget(event.target, event, player)
      )
        return;

      sidebarScreenSwipeStartRef.current?.({
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        isPrimary: event.isPrimary,
        clientX: event.clientX,
        clientY: event.clientY,
        timeStamp: event.timeStamp,
        target: event.target,
        handle: app,
        splitX: getLearningPlayerSwipeSplitX(player),
      });
    };
    const continueResize = (event: PointerEvent) =>
      sidebarResizeMoveRef.current?.(event);
    const finishResize = (event: PointerEvent) =>
      sidebarResizeFinishRef.current?.(event);
    const cancelResize = (event: PointerEvent) =>
      sidebarResizeFinishRef.current?.(event, true);
    window.addEventListener("pointerdown", startResizeFromHostedPlayer, true);
    window.addEventListener("pointermove", continueResize, {
      capture: true,
      passive: false,
    });
    window.addEventListener("pointerup", finishResize, true);
    window.addEventListener("pointercancel", cancelResize, true);
    return () => {
      window.removeEventListener(
        "pointerdown",
        startResizeFromHostedPlayer,
        true,
      );
      window.removeEventListener("pointermove", continueResize, true);
      window.removeEventListener("pointerup", finishResize, true);
      window.removeEventListener("pointercancel", cancelResize, true);
    };
  }, []);

  const handleSidebarResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      if (sidebarCollapsed && event.key === "ArrowRight") {
        setSidebarMode("expanded");
        commitSidebarWidth(SIDEBAR_MIN_WIDTH);
      } else if (sidebarCollapsed && event.key === "ArrowLeft") {
        setSidebarMode("hidden");
        setPaletteMenu(false);
        setEdgeSidebarOpen(false);
      } else if (!sidebarCollapsed) {
        commitSidebarWidth(
          sidebarWidth + (event.key === "ArrowRight" ? 16 : -16),
        );
      }
    } else if (event.key === "Home") {
      event.preventDefault();
      commitSidebarWidth(SIDEBAR_MIN_WIDTH);
    } else if (event.key === "End") {
      event.preventDefault();
      commitSidebarWidth(sidebarMaxWidth);
    }
  };

  const toggleSidebarWidth = () => {
    if (compactNavigation) {
      setEdgeSidebarOpen(false);
      return;
    }
    setSidebarMode((current) =>
      current === "expanded" ? "collapsed" : "expanded",
    );
    setPaletteMenu(false);
    setEdgeSidebarOpen(false);
  };

  const floatSidebar = useCallback(() => {
    setSidebarMode("hidden");
    setPaletteMenu(false);
    setEdgeSidebarOpen(true);
  }, []);

  const sidebarToggleGesture = useSecondPressHold<HTMLButtonElement>({
    onPress: toggleSidebarWidth,
    onSecondPressHold: floatSidebar,
    deferFirstPress: compactNavigation,
    secondPressWindow: compactNavigation ? 700 : undefined,
  });
  const sidebarLogoGesture = useSecondPressHold<HTMLSpanElement>({
    onSecondPressHold: floatSidebar,
  });

  const handleSidebarBrandDoubleClick = (
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    if ((event.target as Element).closest(".sidebar-collapse")) return;
    const shouldFloat = !sidebarHidden;
    setSidebarMode(shouldFloat ? "hidden" : "expanded");
    setPaletteMenu(false);
    setEdgeSidebarOpen(shouldFloat);
  };

  const preventSidebarBrandTextSelection = (
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    if (
      event.detail > 1 &&
      !(event.target as Element).closest(".sidebar-collapse")
    ) {
      event.preventDefault();
    }
  };

  const mobileNavigation = getMobilePrimaryNavigation(
    effectiveRole,
    navigation,
  );
  const mobileMoreNavigation = getMobileOverflowNavigation(
    navigation,
    mobileNavigation,
  );
  const mobileMoreActive = Boolean(
    activeNavigationSection &&
    mobileMoreNavigation.some(isNavigationItemActive),
  );
  useLayoutEffect(() => {
    if (!mobileMenuOpen) return;
    const nextSnapPoint = isLearningSurface
      ? Math.max(getLearningMobileMenuSnapPoint(), mobileMenuContentSnapPoint)
      : mobileMenuContentSnapPoint;
    setMobileMenuCollapsedSnapPoint(nextSnapPoint);
    setMobileMenuSnapPoint((current) =>
      current === 1 ? current : nextSnapPoint,
    );
  }, [isLearningSurface, mobileMenuOpen, mobileMenuContentSnapPoint]);
  const currentAcademyThemeIndex = academyThemes.findIndex(
    (item) => item.id === academyTheme,
  );

  const renderPageContent = ({
    surfaceCourseSlug = courseSlug,
    surfaceDiscussionTab = discussionTab,
    surfacePage = page,
    surfaceSection = requestedSection,
    surfaceSettingsTab = settingsTab,
    surfaceUsername = username,
  }: {
    surfaceCourseSlug?: string;
    surfaceDiscussionTab?: string;
    surfacePage?: string;
    surfaceSection?: string | null;
    surfaceSettingsTab?: string;
    surfaceUsername?: string;
  } = {}): ReactNode => {
    if (routeContentBlocked) {
      return (
        <AcademyRouteSkeleton
          page={surfacePage}
          role={effectiveRole}
          quizId={quizId}
        />
      );
    }

    const surfaceActiveSection =
      surfaceSection ?? (surfacePage === "courses" ? "Courses" : activeSection);
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
    if (surfacePage === "home" && effectiveRole === "creator") {
      return (
        <Suspense fallback={<AcademyPageFallback />}>
          <CreatorDashboard
            onNavigatePage={onNavigatePage}
            academyTheme={appliedAcademyTheme}
            resolvedTheme={resolvedTheme}
          />
        </Suspense>
      );
    }
    if (effectiveRole === "student" && surfacePage === "home") {
      return (
        <Suspense fallback={<AcademyPageFallback />}>
          {!isAuthReady ? (
            <AcademyPageFallback />
          ) : isAuthenticated ? (
            <AuthenticatedHomeBoundary
              onOpenCourse={onOpenCourse}
              onNavigatePage={onNavigatePage}
              setNotice={setNotice}
              studentName={shellProfileDisplayName}
            />
          ) : (
            <GuestHome onNavigatePage={onNavigatePage} setNotice={setNotice} />
          )}
        </Suspense>
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
          />
        </Suspense>
      );
    }
    if (surfacePage === "workspace") {
      return (
        <Suspense fallback={<AcademyPageFallback />}>
          <WorkspacePage
            section={surfaceActiveSection}
            role={role}
            discussionTab={surfaceDiscussionTab}
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
          <CourseOverviewPage
            courseSlug={surfaceCourseSlug}
            initialOverview={initialCourseOverview}
            onNavigateCourses={() => onNavigatePage("/courses")}
            onNavigatePage={onNavigatePage}
            role={role}
          />
        </Suspense>
      );
    }
    if (surfacePage === "reviews" || surfaceActiveSection === "Reviews") {
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
    if (surfacePage === "coupons" || surfaceActiveSection === "Coupons") {
      return (
        <Suspense fallback={<AcademyRouteSkeleton page="coupons" />}>
          <CouponsPage onNavigatePage={onNavigatePage} setNotice={setNotice} />
        </Suspense>
      );
    }
    if (surfacePage === "orders" || surfaceActiveSection === "Orders") {
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
      surfaceActiveSection === "Purchase History"
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
      surfaceActiveSection === "Notifications" ||
      surfaceActiveSection === "Notification"
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
    if (surfacePage === "students" || surfaceActiveSection === "Students") {
      if (effectiveRole !== "creator") {
        return null;
      }
      return (
        <Suspense fallback={<AcademyRouteSkeleton page="students" />}>
          <StudentsPage onNavigatePage={onNavigatePage} setNotice={setNotice} />
        </Suspense>
      );
    }
    if (surfacePage === "analytics" || surfaceActiveSection === "Analytics") {
      if (effectiveRole !== "creator") {
        return null;
      }
      return (
        <Suspense fallback={<AcademyRouteSkeleton page="analytics" />}>
          <AnalyticsDashboardPage
            role={role}
            isAdmin={isAdmin}
            onNavigatePage={onNavigatePage}
          />
        </Suspense>
      );
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
      <CourseCatalogue
        activeSection={surfaceActiveSection}
        role={effectiveRole}
        isAdmin={isAdmin}
        currentUserId={activeUser?.id}
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
    );
  };

  return (
    <div
      ref={coursesAppRef}
      className={sidebarClassName}
      onPointerDownCapture={(event) =>
        startSidebarScreenSwipe({
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          isPrimary: event.isPrimary,
          clientX: event.clientX,
          clientY: event.clientY,
          timeStamp: event.timeStamp,
          target: event.target,
          handle: event.currentTarget,
        })
      }
      style={
        {
          "--sidebar-resize-preview-width": `${sidebarResizePreviewWidth ?? SIDEBAR_COLLAPSED_WIDTH}px`,
          "--sidebar-overlay-swipe-offset": `${sidebarOverlaySwipeOffset ?? 0}px`,
        } as CSSProperties
      }
    >
      {sidebarAvailable && (
        <>
          {sidebarPresentedAsOverlay && (
            <div
              className="sidebar-edge-trigger"
              aria-hidden="true"
              onPointerEnter={() => setEdgeSidebarOpen(true)}
            />
          )}
          <aside
            className="courses-sidebar touch-pan-y"
            data-header-layout={sidebarHeaderLayout}
            aria-label={`${effectiveRole === "creator" ? "Creator" : "Student"} navigation`}
            aria-hidden={
              sidebarPresentedAsOverlay && !edgeSidebarOpen ? "true" : undefined
            }
            inert={
              sidebarPresentedAsOverlay && !edgeSidebarOpen ? true : undefined
            }
            onPointerEnter={() =>
              sidebarPresentedAsOverlay && setEdgeSidebarOpen(true)
            }
            onPointerLeave={() =>
              sidebarPresentedAsOverlay &&
              !coarseNavigationInput &&
              setEdgeSidebarOpen(false)
            }
            onFocusCapture={() =>
              sidebarPresentedAsOverlay && setEdgeSidebarOpen(true)
            }
            onClickCapture={(event) => {
              if (!sidebarOverlaySwipeConsumedRef.current) return;
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={handleEmptyAreaDoubleTap}
          >
            {((!compactNavigation && !sidebarPresentedAsOverlay) ||
              (sidebarPresentedAsOverlay && edgeSidebarOpen)) && (
              <div
                className="sidebar-resize-handle"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize sidebar"
                aria-keyshortcuts={`${primaryShortcutModifier}+B`}
                title={
                  showKeyboardShortcuts
                    ? `Resize sidebar | ${sidebarShortcutTitle}`
                    : "Resize sidebar"
                }
                aria-valuemin={
                  sidebarPresentedAsOverlay
                    ? SIDEBAR_MIN_WIDTH
                    : SIDEBAR_COLLAPSED_WIDTH
                }
                aria-valuemax={sidebarMaxWidth}
                aria-valuenow={Math.round(
                  sidebarResizePreviewWidth ??
                    (sidebarPresentedAsOverlay
                      ? renderedSidebarWidth
                      : sidebarCollapsed
                        ? SIDEBAR_COLLAPSED_WIDTH
                        : renderedSidebarWidth),
                )}
                aria-valuetext={
                  sidebarPresentedAsOverlay
                    ? `${Math.round(sidebarResizePreviewWidth ?? renderedSidebarWidth)} pixel temporary sidebar`
                    : sidebarCollapsed
                      ? "Collapsed sidebar"
                      : `${Math.round(renderedSidebarWidth)} pixels wide`
                }
                tabIndex={0}
                onKeyDown={handleSidebarResizeKeyDown}
                onDoubleClick={toggleSidebarWidth}
                onPointerEnter={dismissSidebarTooltipImmediately}
                onPointerDown={startSidebarResize}
                onPointerMove={moveSidebarResize}
                onPointerUp={endSidebarResize}
                onPointerCancel={(event) => endSidebarResize(event, true)}
                onLostPointerCapture={(event) => {
                  if (sidebarResizeRef.current?.pointerId === event.pointerId) {
                    endSidebarResize(event, true);
                  }
                }}
              />
            )}
            <div
              className="courses-sidebar__brand"
              title={sidebarBrandTitle}
              data-double-tap-ignore
              onMouseDown={preventSidebarBrandTextSelection}
              onDoubleClick={handleSidebarBrandDoubleClick}
            >
              <span
                className="courses-logo-clip"
                role="img"
                aria-label="ProCodrr"
                title="Click, then hold to float sidebar"
                data-second-press-holding={
                  sidebarLogoGesture.isSecondPressHolding || undefined
                }
                {...sidebarLogoGesture.handlers}
                dangerouslySetInnerHTML={{ __html: procodrrLogoSvg }}
              />
              <button
                type="button"
                className="sidebar-collapse"
                aria-label={sidebarControlAction}
                aria-pressed={compactNavigation ? undefined : sidebarCollapsed}
                aria-keyshortcuts={`${primaryShortcutModifier}+B`}
                title={sidebarControlTitle}
                data-second-press-holding={
                  sidebarToggleGesture.isSecondPressHolding || undefined
                }
                {...sidebarToggleGesture.handlers}
              >
                <span className="sidebar-collapse__asset" aria-hidden="true">
                  <SidebarToggleIcon
                    direction={
                      compactNavigation
                        ? "left"
                        : sidebarVisuallyCollapsed || sidebarPresentedAsOverlay
                          ? "right"
                          : "left"
                    }
                  />
                </span>
              </button>
            </div>

            <nav
              id="courses-sidebar-nav-scrollport"
              className={[
                "courses-nav",
                navigationScrollFade.top ? "has-scroll-top" : "",
                navigationScrollFade.bottom ? "has-scroll-bottom" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              ref={navigationRef}
              onScroll={() => {
                setSidebarTooltip(null);
                updateNavigationScrollFade();
              }}
            >
              {navigation.map((item, navigationIndex) => {
                const [label, Icon] = item;
                const active = isNavigationItemActive(item);
                const navigationShortcutIndex = navigationIndex + 1;
                const displayLabel = label;
                const accessibleLabel = displayLabel;
                return (
                  <Fragment key={label}>
                    <button
                      type="button"
                      className={active ? "is-active" : ""}
                      style={
                        {
                          "--nav-icon-color": getNavigationIconColor(
                            label,
                            sidebarPreferences,
                          ),
                        } as CSSProperties
                      }
                      aria-label={accessibleLabel}
                      aria-current={active ? "page" : undefined}
                      aria-keyshortcuts={
                        label === "Settings"
                          ? `${navigationIndex + 1} ${primaryShortcutModifier}+Comma`
                          : String(navigationIndex + 1)
                      }
                      data-sidebar-swipe-ignore
                      onClick={() => selectNavigation(label, item)}
                      onContextMenu={(event) => {
                        if (navigationUsesCompactInteraction)
                          event.preventDefault();
                      }}
                      onMouseEnter={(event) =>
                        showSidebarTooltip(event, displayLabel, active)
                      }
                      onMouseLeave={hideCollapsedNavigationTooltip}
                      onFocus={(event) =>
                        showSidebarTooltip(event, displayLabel, active)
                      }
                      onBlur={hideCollapsedNavigationTooltip}
                    >
                      <Icon size={23} weight={active ? "fill" : "regular"} />
                      <span className="courses-nav__text">{displayLabel}</span>
                      {showKeyboardShortcuts && (
                        <ShortcutKeys
                          className="courses-nav__shortcut"
                          keys={
                            label === "Settings"
                              ? settingsShortcutKeys
                              : [String(navigationShortcutIndex)]
                          }
                        />
                      )}
                    </button>
                  </Fragment>
                );
              })}
            </nav>

            <div className="courses-profile" ref={profileRef}>
              {isAuthenticated && (
                <ProfileMenu
                  id="desktop-profile-menu"
                  className="profile-menu--animated"
                  isOpen={profileMenu}
                  role={effectiveRole}
                  allowedRoles={allowedWorkspaceRoles}
                  userRoles={userRoles}
                  identity={
                    activeUser?.username
                      ? {
                          displayName: shellProfileDisplayName,
                          username: activeUser.username,
                          avatarUrl: shellProfileAvatarUrl,
                          avatarSrcSet: shellProfileAvatarSrcSet,
                        }
                      : undefined
                  }
                  unreadNotificationCount={
                    isAuthenticated ? unreadNotificationCount : 0
                  }
                  sidebarHidden={sidebarPresentedAsOverlay}
                  includeSidebarControl={!compactNavigation}
                  onClose={() => setProfileMenu(false)}
                  onRoleChange={setRole}
                  onNavigate={(path) => {
                    setEdgeSidebarOpen(false);
                    dismissProfileMenuThen(() => {
                      dismissMobileMenuThen(() => onNavigatePage(path));
                    });
                  }}
                  onToggleSidebar={() => {
                    setSidebarMode(sidebarHidden ? "expanded" : "hidden");
                    setEdgeSidebarOpen(false);
                  }}
                  onLogout={openLogoutConfirm}
                />
              )}
              {isAuthenticated ? (
                <button
                  type="button"
                  className="courses-profile__button"
                  aria-label={`${shellProfileDisplayName}, ${shellProfileSubtitle}. Open profile menu`}
                  aria-expanded={profileMenu}
                  aria-controls="desktop-profile-menu"
                  onClick={() => setProfileMenu((current) => !current)}
                >
                  <span className="courses-profile__avatar-wrap">
                    <ShellProfileAvatar
                      avatarUrl={shellProfileAvatarUrl}
                      avatarSrcSet={shellProfileAvatarSrcSet}
                    />
                    {unreadNotificationCount > 0 ? (
                      <i
                        className="courses-profile__presence"
                        aria-label={`${unreadNotificationCount} unread notifications`}
                      />
                    ) : null}
                  </span>
                  <span>
                    <strong>{shellProfileDisplayName}</strong>
                    <small>
                      {shellProfileSubtitle}
                      {canSwitchWorkspace ? (
                        <ProfileSubtitleIcon
                          className={`courses-profile__role-icon courses-profile__role-icon--${effectiveRole === "student" ? "student" : hasAdminRole(userRoles) ? "admin" : "creator"}`}
                          size={15}
                          weight="duotone"
                          aria-hidden="true"
                        />
                      ) : null}
                    </small>
                  </span>
                  <CaretDown
                    size={19}
                    aria-hidden="true"
                    className={
                      profileMenu
                        ? "courses-profile__caret is-open"
                        : "courses-profile__caret"
                    }
                  />
                </button>
              ) : (
                <LoginProfileButton
                  className="courses-profile__button"
                  arrowSize={16}
                  displayName={authIdentityHint?.displayName}
                  onLogin={() => onNavigatePage("/login")}
                />
              )}
              <div
                ref={appearanceControlsRef}
                className={`sidebar-appearance sidebar-appearance--mobile-dock sidebar-appearance--${appearanceControlsHorizontal ? "horizontal" : "vertical"}`}
                role="group"
                aria-label="Appearance controls"
                data-control-radius-surface
                style={
                  {
                    "--reading-mode-dock-index": Math.max(
                      0,
                      readingModeDockIndex,
                    ),
                    "--palette-menu-dock-index": Math.max(
                      0,
                      paletteMenuDockIndex,
                    ),
                    "--sidebar-dock-count": sidebarDockItems.length,
                  } as CSSProperties
                }
              >
                {sidebarDockItems.map((item: SidebarDockItem) => {
                  if (item === "appearance") {
                    return (
                      <button
                        key={item}
                        ref={appearanceModeTriggerRef}
                        data-dock-item={item}
                        data-appearance-mode-toggle
                        data-palette-trigger
                        type="button"
                        className="is-active"
                        aria-haspopup="menu"
                        aria-expanded={
                          paletteMenu && paletteMenuSource === "appearance"
                        }
                        aria-controls="desktop-theme-menu"
                        aria-label={`${resolvedTheme === "dark" ? "Dark" : "Light"} mode active. Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
                        title={`${resolvedTheme === "dark" ? "Dark" : "Light"} mode - switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
                        onClick={(event) => {
                          if (consumeAppearanceGestureClick(event)) return;
                          themeRevealOriginRef.current =
                            themeRevealOriginFromClick(event);
                          toggleAppearance();
                        }}
                        onContextMenu={openAppearanceThemeMenu}
                        onPointerDown={(event) =>
                          startDockLongPress(event, () =>
                            activateAppearanceOption(
                              "theme",
                              false,
                              "appearance",
                            ),
                          )
                        }
                        onPointerMove={moveDockLongPress}
                        onPointerUp={finishDockLongPress}
                        onPointerCancel={finishDockLongPress}
                      >
                        {resolvedTheme === "dark" ? (
                          <Moon
                            size={19}
                            weight="fill"
                            className="appearance-mode-icon"
                            data-appearance-mode-icon
                          />
                        ) : (
                          <Sun
                            size={19}
                            weight="fill"
                            className="appearance-mode-icon"
                            data-appearance-mode-icon
                          />
                        )}
                      </button>
                    );
                  }

                  if (item === "theme") {
                    return (
                      <div
                        className="sidebar-palette-wrap"
                        data-dock-item={item}
                        key={item}
                      >
                        <button
                          ref={paletteTriggerRef}
                          data-palette-trigger
                          type="button"
                          className="sidebar-palette-trigger"
                          aria-label="Choose color theme"
                          title="Choose color theme"
                          aria-haspopup="menu"
                          aria-expanded={
                            paletteMenu && paletteMenuSource === "theme"
                          }
                          aria-controls="desktop-theme-menu"
                          aria-pressed={
                            paletteMenu && paletteMenuSource === "theme"
                          }
                          onClick={(event) => {
                            if (consumeAppearanceGestureClick(event)) return;
                            setReadingModeMenu(null);
                            setPaletteMenuSource("theme");
                            if (paletteMenu)
                              cancelDesktopPalettePreview(
                                themeRevealOriginFromClick(event) ?? undefined,
                              );
                            else setPaletteMenu(true);
                          }}
                          onPointerDown={(event) =>
                            startAppearanceSwipe(event, "theme")
                          }
                          onPointerUp={(event) =>
                            finishAppearanceSwipe(event, "theme")
                          }
                          onPointerCancel={cancelAppearanceSwipe}
                        >
                          <Palette size={19} />
                          <i
                            style={{
                              background: academyThemes.find(
                                (themeOption) =>
                                  themeOption.id === displayedAcademyTheme,
                              )?.preview,
                            }}
                          />
                        </button>
                      </div>
                    );
                  }

                  if (item === "reading-mode") {
                    return (
                      <button
                        key={item}
                        data-dock-item={item}
                        data-reading-mode-trigger
                        type="button"
                        className={`sidebar-appearance__reading-mode${readingModeEnabled ? " is-active" : ""}`}
                        aria-label={`${readingModeEnabled ? "Reading mode active. Turn reading mode off" : "Turn reading mode on"}`}
                        title={`Reading mode - ${readingModeEnabled ? "on" : "off"}`}
                        aria-pressed={readingModeEnabled}
                        aria-haspopup="dialog"
                        aria-expanded={readingModeMenu === "desktop"}
                        aria-controls="desktop-reading-mode-quick-settings"
                        onClick={(event) => {
                          if (consumeAppearanceGestureClick(event)) return;
                          toggleReadingMode();
                        }}
                        onContextMenu={openReadingModeMenu}
                        onPointerDown={(event) =>
                          startDockLongPress(event, () =>
                            showReadingModeMenu(false),
                          )
                        }
                        onPointerMove={moveDockLongPress}
                        onPointerUp={finishDockLongPress}
                        onPointerCancel={finishDockLongPress}
                      >
                        <Eye
                          aria-hidden="true"
                          data-reading-mode-icon="off"
                          size={20}
                          weight="regular"
                        />
                        <Eye
                          aria-hidden="true"
                          data-reading-mode-icon="on"
                          size={20}
                          weight="fill"
                        />
                      </button>
                    );
                  }

                  if (item === "settings") {
                    const settingsActive = page === "settings";
                    return (
                      <button
                        key={item}
                        data-dock-item={item}
                        type="button"
                        className={`sidebar-appearance__settings${settingsActive ? " is-active" : ""}`}
                        style={
                          {
                            "--nav-icon-color": getNavigationIconColor(
                              "Settings",
                              sidebarPreferences,
                            ),
                          } as CSSProperties
                        }
                        aria-label="Open settings"
                        title={settingsControlTitle}
                        aria-current={settingsActive ? "page" : undefined}
                        aria-keyshortcuts={`${primaryShortcutModifier}+Comma`}
                        aria-haspopup="menu"
                        aria-expanded={settingsQuickMenu === "desktop"}
                        aria-controls="desktop-settings-quick-menu"
                        data-settings-quick-trigger
                        onClick={(event) => {
                          if (consumeAppearanceGestureClick(event)) return;
                          toggleSettingsNavigation();
                        }}
                        onContextMenu={(event) =>
                          openSettingsQuickMenu(event, false)
                        }
                        onPointerDown={(event) =>
                          startDockLongPress(
                            event,
                            () => showSettingsQuickMenu(false),
                            true,
                          )
                        }
                        onPointerMove={moveDockLongPress}
                        onPointerUp={finishDockLongPress}
                        onPointerCancel={finishDockLongPress}
                      >
                        <GearSix
                          size={20}
                          weight={settingsActive ? "fill" : "regular"}
                        />
                      </button>
                    );
                  }

                  return (
                    <button
                      key={item}
                      data-dock-item={item}
                      type="button"
                      className={`sidebar-appearance__fullscreen${isFullscreen ? " is-active" : ""}`}
                      aria-label={fullscreenActionLabel}
                      title={fullscreenActionLabel}
                      aria-pressed={isFullscreen}
                      aria-keyshortcuts="F11"
                      onClick={() => void toggleFullscreen()}
                    >
                      {isFullscreen ? (
                        <CornersIn size={20} weight="bold" />
                      ) : (
                        <CornersOut size={20} weight="bold" />
                      )}
                    </button>
                  );
                })}
                {readingModeMenu === "desktop" && (
                  <Suspense fallback={null}>
                    <ReadingModeQuickMenu
                      id="desktop-reading-mode-quick-settings"
                      className={
                        sidebarCollapsed
                          ? "reading-mode-quick-menu--collapsed"
                          : ""
                      }
                      preferences={readingModePreferences}
                      onChange={updateReadingMode}
                    />
                  </Suspense>
                )}
                {paletteMenu && (
                  <AcademyPaletteMenu
                    themes={academyThemes}
                    selectedTheme={displayedAcademyTheme}
                    id="desktop-theme-menu"
                    className={`sidebar-palette-menu sidebar-palette-menu--dock-attached${sidebarCollapsed ? " sidebar-palette-menu--collapsed" : ""}`}
                    onSelect={changePalette}
                    onPreview={previewAcademyTheme}
                    onConfirm={confirmDesktopPaletteTheme}
                    onCancel={cancelDesktopPalettePreview}
                  />
                )}
              </div>
              {settingsQuickMenuLoaded && (
                <Suspense fallback={null}>
                  <SettingsQuickMenu
                    id="desktop-settings-quick-menu"
                    isOpen={settingsQuickMenu === "desktop"}
                    activeTab={
                      page === "settings"
                        ? normalizeSettingsTab(settingsTab)
                        : null
                    }
                    onNavigate={navigateSettingsQuickMenu}
                  />
                </Suspense>
              )}
            </div>
          </aside>
        </>
      )}

      {sidebarTooltip && (
        <div
          className={`sidebar-nav-tooltip${sidebarTooltip.active ? " is-active" : ""}${sidebarTooltip.focusVisible ? " is-focus-visible" : ""}${sidebarTooltip.preferenceControlled ? " is-preference-controlled" : ""}`}
          aria-hidden="true"
          style={
            {
              "--sidebar-tooltip-top": `${sidebarTooltip.top}px`,
              "--sidebar-tooltip-left": `${sidebarTooltip.left}px`,
            } as CSSProperties
          }
        >
          <SidebarTooltipSurface />
          <span className="sidebar-nav-tooltip__body">
            <span className="sidebar-nav-tooltip__label">
              {sidebarTooltip.label}
            </span>
          </span>
        </div>
      )}

      <div className="courses-main-frame">
        <main
          id="courses-main-scrollport"
          ref={mainScrollportRef}
          className={[
            "courses-main",
            renderMain
              ? "courses-main--learning overflow-x-clip!"
              : page !== "courses"
                ? "student-surface-main"
                : "",
            !renderMain && page === "courses" ? "max-[640px]:px-0!" : "",
            !renderMain && page === "settings" ? "courses-main--settings" : "",
            mobileSidebarNavigationActive
              ? renderMain
                ? "max-[640px]:pb-0!"
                : "max-[640px]:pb-4!"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div
            ref={learningMotionStageRef}
            className={
              renderMain
                ? "grid min-h-full [&>*]:col-start-1 [&>*]:row-start-1"
                : "contents"
            }
            data-learning-motion-stage={renderMain ? "" : undefined}
          >
            {renderMain ? (
              routeContentBlocked ? (
                <AcademyRouteSkeleton
                  page={page}
                  role={effectiveRole}
                  quizId={quizId}
                />
              ) : learningBackground ? (
                <div
                  className={`courses-main pointer-events-none sticky top-0 z-0 h-dvh max-h-dvh min-h-0! self-start overflow-clip! transition-opacity ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${learningBackground.page !== "courses" ? "student-surface-main" : ""}`}
                  style={{
                    contain: "strict",
                    opacity: "var(--learning-background-reveal, 0)",
                    transitionDuration:
                      "var(--learning-background-reveal-duration, 0ms)",
                  }}
                  aria-hidden="true"
                  data-learning-background-surface=""
                  inert
                >
                  {renderPageContent({
                    surfaceCourseSlug: learningBackground.courseSlug,
                    surfaceDiscussionTab: learningBackground.discussionTab,
                    surfacePage: learningBackground.page,
                    surfaceSection: learningBackground.section,
                    surfaceSettingsTab: learningBackground.settingsTab,
                  })}
                </div>
              ) : null
            ) : routeContentBlocked ? (
              <AcademyRouteSkeleton
                page={page}
                role={effectiveRole}
                quizId={quizId}
              />
            ) : (
              <div className="contents">{renderPageContent()}</div>
            )}
            {renderMain && !routeContentBlocked ? (
              <div className="relative min-h-full">
                {renderMain({
                  mobileBottomNavigation:
                    compactNavigation && !mobileSidebarNavigationActive,
                  mobileBottomNavigationHidden: mobileBottomNavHidden,
                })}
              </div>
            ) : null}
          </div>
        </main>
      </div>

      <FloatingScrollbar
        scrollportRef={mainScrollportRef}
        className={renderMain ? "floating-scrollbar--learning-page" : undefined}
        rightEdgeSelector={
          renderMain ? ".learning-workspace__lesson-column" : undefined
        }
        enableHorizontalDrag={Boolean(renderMain)}
      />

      {compactNavigation && !mobileSidebarNavigationActive && (
        <nav
          ref={mobileBottomNavRef}
          className={`mobile-bottom-nav${mobileBottomNavHidden ? " is-scroll-hidden" : ""}`}
          aria-label={`${effectiveRole === "creator" ? "Creator" : "Student"} mobile navigation`}
          onFocusCapture={() => setMobileBottomNavHidden(false)}
        >
          {mobileNavigation.map((item) => {
            const [label, Icon] = item;
            const active = isNavigationItemActive(item);
            const displayLabel = label;
            return (
              <Fragment key={label}>
                <button
                  type="button"
                  className={active ? "is-active" : ""}
                  style={
                    {
                      "--nav-icon-color": getNavigationIconColor(
                        label,
                        sidebarPreferences,
                      ),
                    } as CSSProperties
                  }
                  aria-current={active ? "page" : undefined}
                  data-sidebar-swipe-ignore
                  aria-label={displayLabel}
                  onClick={() => selectNavigation(label, item)}
                >
                  <span>
                    <Icon size={23} weight={active ? "fill" : "regular"} />
                  </span>
                  <small>{displayLabel}</small>
                </button>
              </Fragment>
            );
          })}
          <button
            id="mobile-navigation-trigger"
            ref={mobileMoreRef}
            type="button"
            className={mobileMoreActive || mobileMenuOpen ? "is-active" : ""}
            aria-label="Open navigation and appearance menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation-sheet"
            onClick={openMobileNavigationMenu}
          >
            <span>
              <span className="mobile-bottom-nav__profile-avatar">
                {shellProfileAvatarUrl ? (
                  <ShellProfileAvatar
                    avatarUrl={shellProfileAvatarUrl}
                    avatarSrcSet={shellProfileAvatarSrcSet}
                  />
                ) : (
                  <UserCircle
                    size={24}
                    weight="regular"
                    className="!text-(--accent)"
                    aria-hidden="true"
                  />
                )}
                {isAuthenticated && unreadNotificationCount > 0 ? (
                  <i className="courses-profile__presence" aria-hidden="true" />
                ) : null}
              </span>
            </span>
            <small>You</small>
          </button>
        </nav>
      )}

      <Drawer
        open={mobileMenuOpen}
        dismissThenRef={mobileMenuDismissThenRef}
        onOpenChange={(open) => {
          if (open) setMobileMenuOpen(true);
          else closeMobileMenu();
        }}
        onOpenChangeComplete={(open) => {
          if (!open) setMobileMenuSnapPoint(mobileMenuCollapsedSnapPoint);
        }}
        snapPoints={mobileMenuSnapPoints}
        snapPoint={mobileMenuSnapPoint}
        onSnapPointChange={setMobileMenuSnapPoint}
        snapToSequentialPoints
        showSwipeHandle
        triggerId="mobile-navigation-trigger"
      >
        <DrawerContent
          ref={mobileSheetSizeRef}
          id="mobile-navigation-sheet"
          aria-labelledby="mobile-navigation-title"
          aria-describedby="mobile-navigation-description"
          initialFocus={mobileSheetRef}
          finalFocus={mobileMoreRef}
          tabIndex={-1}
          className="mobile-menu-sheet [--mobile-menu-sheet-top-space:3px] data-expanded:rounded-none data-[swipe-axis=y]:[--drawer-content-max-height:100dvh] rounded-t-[22px] px-3 pb-[max(14px,var(--app-safe-area-bottom))]"
          floatingContent={
            <>
              {mobilePaletteMenu && (
                <AcademyPaletteMenu
                  themes={academyThemes}
                  selectedTheme={displayedAcademyTheme}
                  id="mobile-theme-menu"
                  className="sidebar-palette-menu mobile-palette-menu absolute! right-auto bottom-[calc(68px_+_var(--app-viewport-safe-area-bottom))] left-3 z-[190]! w-[min(216px,calc(100vw_-_24px))]! max-h-[calc(100dvh_-_92px_-_env(safe-area-inset-top))] overflow-y-auto"
                  mobile
                  onSelect={changePalette}
                  onPreview={previewAcademyTheme}
                  onConfirm={confirmMobilePaletteTheme}
                  onCancel={cancelMobilePalettePreview}
                />
              )}
              {settingsQuickMenuLoaded && (
                <Suspense fallback={null}>
                  <SettingsQuickMenu
                    id="mobile-settings-quick-menu"
                    className="settings-quick-menu--mobile absolute! right-3 bottom-[calc(68px_+_var(--app-viewport-safe-area-bottom))] left-auto z-[190]! w-[min(250px,calc(100vw_-_24px))]! min-w-[min(200px,calc(100vw_-_24px))]! max-h-[calc(100dvh_-_92px_-_env(safe-area-inset-top))] overflow-y-auto"
                    isOpen={settingsQuickMenu === "mobile"}
                    activeTab={
                      page === "settings"
                        ? normalizeSettingsTab(settingsTab)
                        : null
                    }
                    onNavigate={navigateSettingsQuickMenu}
                  />
                </Suspense>
              )}
              {readingModeMenu === "mobile" && (
                <Suspense fallback={null}>
                  <ReadingModeQuickMenu
                    id="mobile-reading-mode-quick-settings"
                    className="reading-mode-quick-menu--mobile"
                    preferences={readingModePreferences}
                    onChange={updateReadingMode}
                  />
                </Suspense>
              )}
            </>
          }
          data-sidebar-swipe-ignore
          onPointerDownCapture={(event) => {
            if (
              mobilePaletteMenu &&
              (!(event.target instanceof Element) ||
                (!event.target.closest("[data-mobile-palette-menu]") &&
                  !event.target.closest("[data-mobile-palette-trigger]")))
            )
              setMobilePaletteMenu(false);
          }}
        >
          <div
            className="mobile-menu-sheet__body"
            onClick={handleEmptyAreaDoubleTap}
          >
            <DrawerTitle id="mobile-navigation-title" className="sr-only">
              Profile and navigation
            </DrawerTitle>
            <DrawerDescription
              id="mobile-navigation-description"
              className="sr-only"
            >
              Profile actions, additional navigation, and appearance controls
            </DrawerDescription>
            <div
              className="mobile-menu-sheet__profile-wrap mt-2"
              data-profile-surface
            >
              {isAuthenticated && activeUser?.username ? (
                <ProfileMenuIdentity
                  variant="mobile"
                  displayName={shellProfileDisplayName}
                  username={activeUser.username}
                  avatarUrl={shellProfileAvatarUrl}
                  avatarSrcSet={shellProfileAvatarSrcSet}
                  unreadNotificationCount={unreadNotificationCount}
                  onClose={() => setProfileMenu(false)}
                  onNavigate={(path) => {
                    setEdgeSidebarOpen(false);
                    dismissProfileMenuThen(() => {
                      dismissMobileMenuThen(() => onNavigatePage(path));
                    });
                  }}
                />
              ) : (
                <LoginProfileButton
                  className="mobile-menu-sheet__profile courses-profile__button profile-menu__identity rounded-2xl! p-0! ps-2! pe-3! bg-[color-mix(in_srgb,var(--surface-strong)_94%,white_6%)]! hover:bg-[color-mix(in_srgb,var(--surface-strong)_90%,white_10%)]!"
                  arrowSize={17}
                  displayName={authIdentityHint?.displayName}
                  onLogin={() => onNavigatePage("/login")}
                />
              )}
            </div>
            <div className="mobile-menu-sheet__scroll overflow-x-hidden pb-11">
              {isAuthenticated && (
                <ProfileMenu
                  id="mobile-profile-menu"
                  className="mobile-menu-sheet__profile-menu"
                  role={effectiveRole}
                  allowedRoles={allowedWorkspaceRoles}
                  userRoles={userRoles}
                  unreadNotificationCount={unreadNotificationCount}
                  includeSidebarControl={false}
                  beforeAccountContent={
                    <div
                      className="mobile-menu-sheet__list mobile-menu-sheet__profile-navigation"
                      role="group"
                      aria-label="Additional navigation"
                    >
                      {mobileMoreNavigation.map((item) => {
                        const [label, Icon] = item;
                        const active = isNavigationItemActive(item);
                        return (
                          <button
                            type="button"
                            key={label}
                            className={active ? "is-active" : ""}
                            style={
                              {
                                "--nav-icon-color": getNavigationIconColor(
                                  label,
                                  sidebarPreferences,
                                ),
                              } as CSSProperties
                            }
                            role="menuitem"
                            aria-current={active ? "page" : undefined}
                            data-sidebar-swipe-ignore
                            aria-label={label}
                            onClick={() => selectNavigation(label, item)}
                          >
                            <Icon
                              size={23}
                              weight={active ? "fill" : "regular"}
                            />
                            <span>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  }
                  onClose={() => setProfileMenu(false)}
                  onRoleChange={setRole}
                  onNavigate={(path) => {
                    setEdgeSidebarOpen(false);
                    dismissProfileMenuThen(() => {
                      dismissMobileMenuThen(() => onNavigatePage(path));
                    });
                  }}
                  onLogout={() => {
                    closeMobileMenu();
                    setLogoutConfirmOpen(true);
                  }}
                />
              )}
            </div>
            <div
              className={`mobile-menu-sheet__appearance sidebar-appearance--mobile-dock${mobilePaletteMenu ? " mobile-menu-sheet__appearance--palette-open" : ""}`}
              role="group"
              aria-label="Appearance controls"
            >
              {sidebarDockItems.map((item) => {
                if (item === "appearance") {
                  return (
                    <button
                      key={item}
                      ref={mobileAppearanceModeTriggerRef}
                      data-dock-item={item}
                      data-appearance-mode-toggle
                      data-mobile-palette-trigger
                      type="button"
                      className="is-active"
                      aria-haspopup="menu"
                      aria-expanded={
                        mobilePaletteMenu && paletteMenuSource === "appearance"
                      }
                      aria-controls="mobile-theme-menu"
                      aria-label={`${resolvedTheme === "dark" ? "Dark" : "Light"} mode active. Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
                      title={`${resolvedTheme === "dark" ? "Dark" : "Light"} mode - switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
                      onClick={(event) => {
                        if (consumeAppearanceGestureClick(event)) return;
                        themeRevealOriginRef.current =
                          themeRevealOriginFromClick(event);
                        toggleAppearance(true);
                      }}
                      onContextMenu={(event) =>
                        openAppearanceThemeMenu(event, true)
                      }
                      onPointerDown={(event) =>
                        startDockLongPress(event, () =>
                          activateAppearanceOption("theme", true, "appearance"),
                        )
                      }
                      onPointerMove={moveDockLongPress}
                      onPointerUp={finishDockLongPress}
                      onPointerCancel={finishDockLongPress}
                    >
                      {resolvedTheme === "dark" ? (
                        <Moon
                          size={20}
                          weight="fill"
                          className="appearance-mode-icon"
                          data-appearance-mode-icon
                        />
                      ) : (
                        <Sun
                          size={20}
                          weight="fill"
                          className="appearance-mode-icon"
                          data-appearance-mode-icon
                        />
                      )}
                    </button>
                  );
                }

                if (item === "theme") {
                  return (
                    <button
                      key={item}
                      data-dock-item={item}
                      ref={mobilePaletteTriggerRef}
                      data-palette-trigger
                      data-mobile-palette-trigger
                      type="button"
                      className={mobilePaletteMenu ? "is-active" : ""}
                      aria-haspopup="menu"
                      aria-expanded={
                        mobilePaletteMenu && paletteMenuSource === "theme"
                      }
                      aria-controls="mobile-theme-menu"
                      aria-label={`Choose color theme. Current theme: ${academyThemes[currentAcademyThemeIndex]?.name}`}
                      title={`Choose color theme - ${academyThemes[currentAcademyThemeIndex]?.name}`}
                      onClick={(event) => {
                        if (consumeAppearanceGestureClick(event)) return;
                        setReadingModeMenu(null);
                        setPaletteMenuSource("theme");
                        if (mobilePaletteMenu)
                          cancelMobilePalettePreview(
                            themeRevealOriginFromClick(event) ?? undefined,
                          );
                        else setMobilePaletteMenu(true);
                      }}
                      onPointerDown={(event) =>
                        startAppearanceSwipe(event, "theme")
                      }
                      onPointerUp={(event) =>
                        finishAppearanceSwipe(event, "theme", true)
                      }
                      onPointerCancel={cancelAppearanceSwipe}
                    >
                      <Palette size={20} />
                      <i
                        style={{
                          background: academyThemes.find(
                            (themeOption) =>
                              themeOption.id === displayedAcademyTheme,
                          )?.preview,
                        }}
                      />
                    </button>
                  );
                }

                if (item === "reading-mode") {
                  return (
                    <button
                      key={item}
                      data-dock-item={item}
                      data-reading-mode-trigger
                      type="button"
                      className={`sidebar-appearance__reading-mode${readingModeEnabled ? " is-active" : ""}`}
                      aria-label={`${readingModeEnabled ? "Reading mode active. Turn reading mode off" : "Turn reading mode on"}`}
                      title={`Reading mode - ${readingModeEnabled ? "on" : "off"}`}
                      aria-pressed={readingModeEnabled}
                      aria-haspopup="dialog"
                      aria-expanded={readingModeMenu === "mobile"}
                      aria-controls="mobile-reading-mode-quick-settings"
                      onClick={(event) => {
                        if (consumeAppearanceGestureClick(event)) return;
                        toggleReadingMode();
                      }}
                      onContextMenu={(event) =>
                        openReadingModeMenu(event, true)
                      }
                      onPointerDown={(event) =>
                        startDockLongPress(event, () =>
                          showReadingModeMenu(true),
                        )
                      }
                      onPointerMove={moveDockLongPress}
                      onPointerUp={finishDockLongPress}
                      onPointerCancel={finishDockLongPress}
                    >
                      <Eye
                        aria-hidden="true"
                        data-reading-mode-icon="off"
                        size={20}
                        weight="regular"
                      />
                      <Eye
                        aria-hidden="true"
                        data-reading-mode-icon="on"
                        size={20}
                        weight="fill"
                      />
                    </button>
                  );
                }

                if (item === "settings") {
                  const settingsActive = page === "settings";
                  return (
                    <button
                      key={item}
                      data-dock-item={item}
                      type="button"
                      className={settingsActive ? "is-active" : ""}
                      style={
                        {
                          "--nav-icon-color": getNavigationIconColor(
                            "Settings",
                            sidebarPreferences,
                          ),
                        } as CSSProperties
                      }
                      aria-label="Open settings"
                      title={settingsControlTitle}
                      aria-current={settingsActive ? "page" : undefined}
                      aria-keyshortcuts={`${primaryShortcutModifier}+Comma`}
                      aria-haspopup="menu"
                      aria-expanded={settingsQuickMenu === "mobile"}
                      aria-controls="mobile-settings-quick-menu"
                      data-settings-quick-trigger
                      onClick={(event) => {
                        if (consumeAppearanceGestureClick(event)) return;
                        toggleSettingsNavigation();
                      }}
                      onContextMenu={(event) =>
                        openSettingsQuickMenu(event, true)
                      }
                      onPointerDown={(event) =>
                        startDockLongPress(
                          event,
                          () => showSettingsQuickMenu(true),
                          true,
                        )
                      }
                      onPointerMove={moveDockLongPress}
                      onPointerUp={finishDockLongPress}
                      onPointerCancel={finishDockLongPress}
                    >
                      <GearSix
                        size={21}
                        weight={settingsActive ? "fill" : "regular"}
                      />
                    </button>
                  );
                }

                return (
                  <button
                    key={item}
                    data-dock-item={item}
                    type="button"
                    className={`sidebar-appearance__fullscreen${isFullscreen ? " is-active" : ""}`}
                    aria-label={fullscreenActionLabel}
                    title={fullscreenActionLabel}
                    aria-pressed={isFullscreen}
                    aria-keyshortcuts="F11"
                    onClick={() => void toggleFullscreen()}
                  >
                    {isFullscreen ? (
                      <CornersIn size={21} weight="bold" />
                    ) : (
                      <CornersOut size={21} weight="bold" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <LogoutConfirmModal
        isOpen={logoutConfirmOpen}
        isPending={isSigningOut}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={() => void signOutAfterSync()}
      />

      {notice && (
        <ToastNotification
          message={notice}
          type="info"
          onDismiss={() => setNotice(null)}
        />
      )}
    </div>
  );
}
