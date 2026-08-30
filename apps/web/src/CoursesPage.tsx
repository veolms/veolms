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
import { flushSync } from "react-dom";
import type {
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CornersInIcon as CornersIn } from "@phosphor-icons/react/CornersIn";
import { CornersOutIcon as CornersOut } from "@phosphor-icons/react/CornersOut";
import { DotsThreeCircleIcon as DotsThreeCircle } from "@phosphor-icons/react/DotsThreeCircle";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import { GearSixIcon as GearSix } from "@phosphor-icons/react/GearSix";
import { MoonIcon as Moon } from "@phosphor-icons/react/Moon";
import { PaletteIcon as Palette } from "@phosphor-icons/react/Palette";
import { QuestionIcon as Question } from "@phosphor-icons/react/Question";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/SignOut";
import { ToastNotification } from "./ToastNotification";
import { SidebarSimpleIcon as SidebarSimple } from "@phosphor-icons/react/SidebarSimple";
import { StudentIcon as Student } from "@phosphor-icons/react/Student";
import { SunIcon as Sun } from "@phosphor-icons/react/Sun";
import { UserIcon as User } from "@phosphor-icons/react/User";
import { UsersIcon as Users } from "@phosphor-icons/react/Users";
import logoDarkSvg from "./assets/procodrr-logo-dark.svg?raw";
import { StudentHome } from "./StudentHome";
import type { LearningCourse } from "./StudentPages";
import { SettingsPage } from "./SettingsPage";
import { CourseCatalogue } from "./courses/CourseCatalogue";
import { PlaceholderPage } from "./courses/PlaceholderPage";
import { subscribeToPointerGestureClaims } from "./gestures/pointerGestureOwnership";
import { useSecondPressHold } from "./gestures/useSecondPressHold";
import { WorkspacePage } from "./workspace/WorkspacePages";
import { ReviewsPage } from "./reviews/ReviewsPage";
import { OrdersPage } from "./orders/OrdersPage";
import { OrderHistoryPage } from "./order-history/OrderHistoryPage";
import { NotificationsPage } from "./notifications/NotificationsPage";
import { courses, getVisibleCourses } from "./courses/catalogue";
import type {
  Course,
  CourseEnrollmentFilter,
  CourseOpenOptions,
  CourseRole,
  CourseSort,
  CourseStatusFilter,
} from "./courses/catalogue";
import { AcademyPaletteMenu } from "./shell/AcademyPaletteMenu";
import { FloatingScrollbar } from "./shell/FloatingScrollbar";
import { LogoutConfirmModal } from "./shell/LogoutConfirmModal";
import { SidebarToggleIcon } from "./shell/SidebarToggleIcon";
import { AppLoadingScreen } from "./bootstrap/AppLoadingScreen";
import { useCurrentUser, useLogout } from "./services/auth";
import { useAuthStore } from "./store/auth.store";
import {
  useCourses,
  useDeleteCourse,
  useDeletedCourses,
  useMyCourses,
  useRestoreCourse,
} from "./services/courses";
import {
  adaptApiCourseToCatalogueCourse,
  adaptCourseSummaryToCatalogueCourse,
  adaptDeletedCourseToCatalogueCourse,
} from "./courses/courseAdapter";
import {
  getDefaultNavigationOrder,
  getDefaultNavigationVisibility,
  getInitialNavigationOrder,
  getInitialNavigationVisibility,
  getMobileOverflowNavigation,
  getMobilePrimaryNavigation,
  getPublicNavigationItems,
  getNavigationDestination,
  getNavigationIconColor,
  hasNavigationMenu,
  getVisibleOrderedNavigation,
  resolveShellNavigation,
} from "./shell/navigation";
import type { NavigationItemWithMetadata } from "./shell/navigation";
import {
  getUserRoles,
  getVisibleWorkspaceRoles,
  resolveWorkspaceRole,
} from "./shell/workspaceRole";
import {
  SIDEBAR_MIN_WIDTH,
  clampSidebarMaxWidth,
  clampSidebarWidth,
  getDefaultSidebarPreferences,
  getInitialSidebarPreferences,
  getInitialSidebarWidth,
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
  themeRevealOriginFromClick,
} from "./shell/themeViewTransition";
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
import {
  clearStoredProfilePreferences,
  getStoredProfilePreferences,
} from "./settings/profilePreferences";
import type { ProfilePreferences } from "./settings/profilePreferences";
import type { NavigateTo } from "./routing/navigation";
import type { SettingsPageProps } from "./SettingsPage";
import { isEditingShortcutTarget } from "./keyboardShortcuts";
import { useGlobalSearchShortcut } from "./searchShortcut";
import { useBackDismiss } from "./navigation/useBackDismiss";
import { useShortcutPlatform } from "./useShortcutPlatform";
import {
  canToggleDocumentFullscreen,
  getDocumentFullscreenElement,
  toggleDocumentFullscreen,
} from "./fullscreen";
import {
  activateCoursePlayerSession,
  COURSE_PLAYER_SESSION_CHANGE_EVENT,
  COURSE_PLAYER_SESSIONS_STORAGE_KEY,
  closeCoursePlayerSession,
  getOpenCoursePlayerSessions,
} from "./learning/coursePlayerNavigation";
import type { CoursePlayerSession } from "./learning/coursePlayerNavigation";
import { LearningSpace } from "./learning-space/LearningSpace";
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
const CourseCreatePage = lazy(() =>
  import("./courses/CourseCreatePage").then((module) => ({
    default: module.CourseCreatePage,
  })),
);
const CourseOverviewPage = lazy(() =>
  import("./courses/CourseOverviewPage").then((module) => ({
    default: module.CourseOverviewPage,
  })),
);

type ThemePreference = "light" | "dark" | "device";
type AppearanceOption = ThemePreference | "theme";
type AppearanceSwipeSource = AppearanceOption;
type NavigationDropPosition = "before" | "after";

interface CoursesPageProps {
  onOpenCourse: (
    course: Course | LearningCourse,
    options?: CourseOpenOptions,
  ) => void;
  onNavigatePage: NavigateTo;
  onExitSettings?: () => void;
  page?: string;
  section?: string | null;
  settingsTab?: string;
  discussionTab?: string;
  courseSlug?: string;
  renderMain?: ((context: CoursesPageRenderContext) => ReactNode) | null;
}

export interface CoursesPageRenderContext {
  mobileBottomNavigation: boolean;
  mobileBottomNavigationHidden: boolean;
}

interface NavigationDropTarget {
  label: string;
  position: NavigationDropPosition;
}

interface NavigationDrag {
  pointerId: number;
  label: string;
  startX: number;
  startY: number;
  dragging: boolean;
  requiresLongPress: boolean;
  timer: number | null;
  handle: HTMLButtonElement;
  scrolling: boolean;
  scrollRegion: HTMLElement | null;
  startScrollTop: number;
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

const isSidebarMode = (value: string | null): value is SidebarMode =>
  value === "expanded" || value === "collapsed" || value === "hidden";

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
const NAVIGATION_LONG_PRESS_DURATION = 480;
const NAVIGATION_LONG_PRESS_MOVE_TOLERANCE = 10;
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

const getProfileInitials = (displayName: string) => {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase())
    .join("");
};

function ShellProfileAvatar({
  avatarUrl,
  displayName,
}: {
  avatarUrl: string | null;
  displayName: string;
}) {
  return (
    <i className="shell-profile-avatar" aria-hidden="true">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          width={43}
          height={43}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
        />
      ) : (
        <strong>{getProfileInitials(displayName)}</strong>
      )}
    </i>
  );
}

function LoginProfileButton({
  className,
  iconSize,
  arrowSize,
  onLogin,
}: {
  className: string;
  iconSize: number;
  arrowSize: number;
  onLogin: () => void;
}) {
  return (
    <button
      type="button"
      className={`${className} courses-profile__login-button`}
      aria-label="Login. Access Your Learning Journey"
      onClick={onLogin}
    >
      <i
        aria-hidden="true"
        className="courses-profile__login-icon flex size-[43px] shrink-0 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--accent)_44%,var(--border))] text-(--accent) shadow-[0_0_16px_color-mix(in_srgb,var(--accent)_20%,transparent)]"
      >
        <User size={iconSize} weight="duotone" />
      </i>
      <span className="courses-profile__login-copy">
        <strong className="courses-profile__login-title">Login</strong>
        <small className="courses-profile__login-subtitle">
          Access Your Learning Journey
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

interface ProfileMenuProps {
  role: CourseRole;
  allowedRoles: readonly CourseRole[];
  sidebarHidden?: boolean;
  includeSidebarControl?: boolean;
  id?: string;
  className?: string;
  onClose: () => void;
  onRoleChange: (role: CourseRole) => void;
  onToggleSidebar?: () => void;
  onLogout: () => void;
}

function ProfileMenu({
  role,
  allowedRoles,
  sidebarHidden = false,
  includeSidebarControl = true,
  id,
  className,
  onClose,
  onRoleChange,
  onToggleSidebar,
  onLogout,
}: ProfileMenuProps) {
  const selectRole = (nextRole: CourseRole) => {
    onRoleChange(nextRole);
    onClose();
  };
  const canPreviewAsStudent = allowedRoles.includes("student");
  const canPreviewAsCreator = allowedRoles.includes("creator");
  const canSwitchWorkspace = canPreviewAsStudent && canPreviewAsCreator;

  return (
    <div
      id={id}
      className={className ? `profile-menu ${className}` : "profile-menu"}
      role="menu"
    >
      {canSwitchWorkspace ? <p>Preview workspace as</p> : <p>Workspace</p>}
      {canPreviewAsStudent ? (
        <button
          type="button"
          role="menuitemradio"
          aria-checked={role === "student"}
          onClick={() => selectRole("student")}
        >
          <Student size={18} />
          <span>Student</span>
          {role === "student" && (
            <Check className="profile-menu__check" size={16} weight="bold" />
          )}
        </button>
      ) : null}
      {canPreviewAsCreator ? (
        <button
          type="button"
          role="menuitemradio"
          aria-checked={role === "creator"}
          onClick={() => selectRole("creator")}
        >
          <Users size={18} />
          <span>Creator</span>
          {role === "creator" && (
            <Check className="profile-menu__check" size={16} weight="bold" />
          )}
        </button>
      ) : null}
      {includeSidebarControl && onToggleSidebar && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onToggleSidebar();
            onClose();
          }}
        >
          <SidebarSimple size={18} />
          <span>{sidebarHidden ? "Keep sidebar visible" : "Hide sidebar"}</span>
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onClose();
          onLogout();
        }}
      >
        <SignOut size={18} />
        <span>Logout</span>
      </button>
    </div>
  );
}

export function CoursesPage({
  onOpenCourse,
  onNavigatePage,
  onExitSettings,
  page = "courses",
  section: requestedSection = null,
  settingsTab = "profile",
  discussionTab = "q-and-a",
  courseSlug,
  renderMain = null,
}: CoursesPageProps) {
  const [role, setRole] = useState<CourseRole>("student");
  const publicNavigationItems = getPublicNavigationItems();
  const [savedShellProfiles, setSavedShellProfiles] = useState<
    Record<CourseRole, ProfilePreferences | null>
  >({ student: null, creator: null });
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("expanded");
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [sidebarResizePreviewWidth, setSidebarResizePreviewWidth] = useState<
    number | null
  >(null);
  const [sidebarOverlaySwipeOffset, setSidebarOverlaySwipeOffset] = useState<
    number | null
  >(null);
  const [navigationOrders, setNavigationOrders] = useState<
    Record<CourseRole, string[]>
  >(() => ({
    student: getDefaultNavigationOrder(publicNavigationItems),
    creator: getDefaultNavigationOrder(publicNavigationItems),
  }));
  const [navigationVisibility, setNavigationVisibility] = useState<
    Record<CourseRole, string[]>
  >(() => ({
    student: getDefaultNavigationOrder(publicNavigationItems),
    creator: getDefaultNavigationOrder(publicNavigationItems),
  }));
  const [draggedNavigationLabel, setDraggedNavigationLabel] = useState<
    string | null
  >(null);
  const [navigationDropTarget, setNavigationDropTarget] =
    useState<NavigationDropTarget | null>(null);
  // Browser-only input capabilities are applied after startup so the loading
  // boundary remains deterministic across the build and the first client pass.
  const [compactNavigation, setCompactNavigation] = useState(false);
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
  const [, setCoursePlayerSessionVersion] = useState(0);
  const [learningSpaceExpanded, setLearningSpaceExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState(() => {
    if (page === "home") return role === "creator" ? "Dashboard" : "Home";
    if (page === "courses") return "Courses";
    if (requestedSection) return requestedSection;
    // Keep the initializer deterministic to avoid a server/client hydration
    // mismatch. Route props become authoritative in the effect below.
    return "Courses";
  });
  const [enrollmentFilter, setEnrollmentFilter] =
    useState<CourseEnrollmentFilter>("all");
  const [search, setSearch] = useSessionStorageState(
    "veolms-course-catalogue-search",
    "",
    isStoredString,
  );
  const [statusFilter, setStatusFilter] = useState<CourseStatusFilter>("all");
  const [sort, setSort] = useState<CourseSort>("latest");
  const [wishlisted, setWishlisted] = useState<Set<string>>(() => new Set());
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
  const mobilePaletteAnchorX =
    ((Math.max(0, paletteMenuDockIndex) + 0.5) /
      Math.max(1, sidebarDockItems.length)) *
    100;
  const [readingModeMenu, setReadingModeMenu] = useState<
    "desktop" | "mobile" | null
  >(null);
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
  const [notice, setNotice] = useState("");
  const [hydratedNavigationKey, setHydratedNavigationKey] = useState<
    string | null
  >(null);
  const [isFullscreen, setIsFullscreen] = useState(() =>
    typeof document === "undefined"
      ? false
      : Boolean(getDocumentFullscreenElement(document)),
  );
  const shortcutPlatform = useShortcutPlatform();
  useGlobalSearchShortcut(shortcutPlatform);
  const { data: authUser, isFetched: authUserFetched } = useCurrentUser();
  const storeUser = useAuthStore((s) => s.user);
  const activeUser = authUser || storeUser;
  const isAuthenticated = Boolean(activeUser);
  const { items: navigationItems, isDefault: isPublicNavigation } = useMemo(
    () => resolveShellNavigation(activeUser?.menus),
    [activeUser?.menus],
  );
  const navigationSignature = useMemo(
    () =>
      navigationItems
        .map(([label, , metadata]) =>
          [metadata?.id ?? label, label, metadata?.routeLink ?? ""].join(":"),
        )
        .join("|"),
    [navigationItems],
  );
  const shouldRenderLearningSpace = Boolean(
    activeUser && hasNavigationMenu(activeUser.menus, "Learning Space"),
  );
  const userRoles = getUserRoles(activeUser);
  const allowedWorkspaceRoles = useMemo(
    () => getVisibleWorkspaceRoles(userRoles, role),
    [role, userRoles],
  );
  const logoutMutation = useLogout();
  const { data: publishedCoursesData } = useCourses({
    enabled: role === "student",
  });
  const { data: myCoursesData } = useMyCourses({
    enabled: role === "creator" && enrollmentFilter !== "bin",
  });
  const { data: deletedCoursesData } = useDeletedCourses(undefined, {
    enabled: role === "creator" && enrollmentFilter === "bin",
  });
  const deleteCourseMutation = useDeleteCourse();
  const restoreCourseMutation = useRestoreCourse();
  const [deletedMockCourseIds, setDeletedMockCourseIds] = useState<Set<string>>(
    () => new Set(),
  );

  const savedShellProfile = activeUser ? savedShellProfiles[role] : null;
  const shellProfileDisplayName =
    activeUser?.displayName ??
    (role === "creator" ? "Anurag Singh" : "Ashi Singh");
  const shellProfileAvatarUrl =
    activeUser && savedShellProfile?.avatarDataUrl
      ? savedShellProfile.avatarDataUrl
      : role === "creator"
        ? "/assets/ethan-avatar-160.webp"
        : "/assets/sofia-avatar-160.webp";
  const profileRef = useRef<HTMLDivElement>(null);
  const appliedThemeRef = useRef<"light" | "dark" | null>(null);
  const appliedPaletteRef = useRef<string | null>(null);
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
  }, []);

  const handleLogout = useCallback(() => {
    void logoutMutation
      .mutateAsync()
      .catch(() => undefined)
      .finally(() => {
        clearStoredProfilePreferences();
        setSavedShellProfiles({ student: null, creator: null });
        window.location.href = "/";
      });
  }, [logoutMutation]);

  useBackDismiss({
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
  const mobileMenuSnapPoints = useMemo(
    () => [mobileMenuCollapsedSnapPoint, 1],
    [mobileMenuCollapsedSnapPoint],
  );
  const isLearningSurface = Boolean(renderMain);
  const activeNavigationSection = isLearningSurface
    ? null
    : (requestedSection ??
      (page === "home"
        ? role === "creator"
          ? "Dashboard"
          : "Home"
        : page === "courses"
          ? "Courses"
          : null));
  const isNavigationItemActive = (item: NavigationItemWithMetadata) => {
    const label = item[0];
    return (
      activeNavigationSection === label ||
      (label === "Notification" && activeNavigationSection === "Notifications")
    );
  };
  const sidebarResizeRef = useRef<SidebarResize | null>(null);
  const sidebarResizeMoveRef = useRef<
    ((event: PointerPositionEvent) => void) | null
  >(null);
  const sidebarResizeFinishRef = useRef<
    ((event: PointerPositionEvent, cancelled?: boolean) => void) | null
  >(null);
  const sidebarOverlaySwipeConsumedRef = useRef(false);
  const navigationDragRef = useRef<NavigationDrag | null>(null);
  const navigationDropRef = useRef<NavigationDropTarget | null>(null);
  const navigationDragConsumedRef = useRef(false);
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
      const storedRole = localStorage.getItem("veolms-role");
      setRole(storedRole === "creator" ? "creator" : "student");
      setSavedShellProfiles({
        student: getStoredProfilePreferences("student"),
        creator: getStoredProfilePreferences("creator"),
      });

      const storedSidebarMode = localStorage.getItem("veolms-sidebar-mode");
      const legacySidebarCollapsed = localStorage.getItem(
        "veolms-sidebar-collapsed",
      );
      setSidebarMode(
        isSidebarMode(storedSidebarMode)
          ? storedSidebarMode
          : legacySidebarCollapsed !== null
            ? legacySidebarCollapsed === "true"
              ? "collapsed"
              : "expanded"
            : getResponsiveSidebarMode(
                "expanded",
                window.matchMedia(SIDEBAR_RESPONSIVE_COLLAPSE_QUERY).matches,
              ),
      );
      setSidebarWidth(getInitialSidebarWidth());
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
      const storedWishlist: unknown = JSON.parse(
        localStorage.getItem("veolms-wishlist") || "[]",
      );
      setWishlisted(
        new Set(
          Array.isArray(storedWishlist)
            ? storedWishlist.filter(
                (courseId): courseId is string =>
                  typeof courseId === "string" &&
                  courses.some(
                    (course) => course.id === courseId && !course.enrolled,
                  ),
              )
            : [],
        ),
      );
    } catch {
      // Deterministic defaults remain usable when storage is unavailable.
      setWishlisted(new Set());
    } finally {
      setStoredPreferencesReady(true);
    }
  }, []);

  const navigationHydrationKey = [
    activeUser ? "authenticated" : "guest",
    role,
    navigationSignature,
  ].join(":");

  useEffect(() => {
    if (!storedPreferencesReady) return;
    if (!activeUser && !authUserFetched) return;
    if (hydratedNavigationKey === navigationHydrationKey) return;

    setNavigationOrders((current) => ({
      ...current,
      [role]: isPublicNavigation
        ? getDefaultNavigationOrder(navigationItems)
        : getInitialNavigationOrder(role, navigationItems),
    }));
    setNavigationVisibility((current) => ({
      ...current,
      [role]: isPublicNavigation
        ? getDefaultNavigationVisibility(navigationItems)
        : getInitialNavigationVisibility(role, navigationItems),
    }));
    setHydratedNavigationKey(navigationHydrationKey);
  }, [
    activeUser,
    authUserFetched,
    hydratedNavigationKey,
    isPublicNavigation,
    navigationHydrationKey,
    navigationItems,
    role,
    storedPreferencesReady,
  ]);

  const navigationPreferencesReady =
    hydratedNavigationKey === navigationHydrationKey;

  useEffect(
    () => () => {
      const press = dockLongPressRef.current;
      if (press) window.clearTimeout(press.timer);
      const navigationDrag = navigationDragRef.current;
      if (navigationDrag?.timer != null) {
        window.clearTimeout(navigationDrag.timer);
      }
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
    if (!compactNavigation || !isLearningSurface) {
      setMobileMenuCollapsedSnapPoint(MOBILE_DRAWER_INITIAL_SNAP_POINT);
      return undefined;
    }
    if (!mobileMenuOpen) return undefined;

    let frame: number | null = null;
    const updateLessonDrawerSnapPoint = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        const nextSnapPoint = getLearningMobileMenuSnapPoint();
        setMobileMenuCollapsedSnapPoint((current) =>
          Math.abs(current - nextSnapPoint) < 0.002 ? current : nextSnapPoint,
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
  }, [compactNavigation, isLearningSurface, mobileMenuOpen]);

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
    const syncCoursePlayerSession = () =>
      setCoursePlayerSessionVersion((version) => version + 1);
    const syncCoursePlayerStorage = (event: StorageEvent) => {
      if (event.key === COURSE_PLAYER_SESSIONS_STORAGE_KEY)
        syncCoursePlayerSession();
    };
    window.addEventListener(
      COURSE_PLAYER_SESSION_CHANGE_EVENT,
      syncCoursePlayerSession,
    );
    window.addEventListener("storage", syncCoursePlayerStorage);
    return () => {
      window.removeEventListener(
        COURSE_PLAYER_SESSION_CHANGE_EVENT,
        syncCoursePlayerSession,
      );
      window.removeEventListener("storage", syncCoursePlayerStorage);
    };
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
    if (!storedPreferencesReady) return;
    if (isPublicNavigation) return;
    if (hydratedNavigationKey !== navigationHydrationKey) return;
    Object.entries(navigationOrders).forEach(([roleName, order]) => {
      localStorage.setItem(
        `veolms-navigation-order-${roleName}`,
        JSON.stringify(order),
      );
    });
  }, [
    hydratedNavigationKey,
    isPublicNavigation,
    navigationHydrationKey,
    navigationOrders,
    storedPreferencesReady,
  ]);

  useEffect(() => {
    if (!storedPreferencesReady) return;
    if (isPublicNavigation) return;
    if (hydratedNavigationKey !== navigationHydrationKey) return;
    Object.entries(navigationVisibility).forEach(([roleName, visibleItems]) => {
      localStorage.setItem(
        `veolms-navigation-visibility-${roleName}`,
        JSON.stringify(visibleItems),
      );
    });
  }, [
    hydratedNavigationKey,
    isPublicNavigation,
    navigationHydrationKey,
    navigationVisibility,
    storedPreferencesReady,
  ]);

  useEffect(() => {
    const nextRole = resolveWorkspaceRole(userRoles, role);
    if (nextRole !== role) {
      setRole(nextRole);
    }
  }, [role, userRoles]);

  useEffect(() => {
    if (!storedPreferencesReady) return;
    localStorage.setItem("veolms-role", role);
    setCourseMenu(null);
    setEnrollmentFilter("all");
    setStatusFilter("all");
    if (page === "home")
      setActiveSection(role === "creator" ? "Dashboard" : "Home");
    else if (requestedSection) setActiveSection(requestedSection);
    else if (page === "courses") setActiveSection("Courses");
    else setActiveSection("Courses");
  }, [page, requestedSection, role, storedPreferencesReady]);

  useEffect(() => {
    if (!storedPreferencesReady) return;
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
      setReadingModeMenu((current) => (current === "mobile" ? null : current));
    }
  }, [compactNavigation]);

  useEffect(() => {
    if (!compactNavigation) return;

    setLearningSpaceExpanded(false);
    if (mobileSidebarNavigationActive) {
      setMobileMenuOpen(false);
      setMobilePaletteMenu(false);
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
    if (!paletteMenu && !mobilePaletteMenu) setPalettePreviewTheme(null);
  }, [mobilePaletteMenu, paletteMenu]);

  useEffect(() => {
    if (showSidebarThemeIcon || showSidebarAppearanceControl) return;
    setPalettePreviewTheme(null);
    setPaletteMenu(false);
    setMobilePaletteMenu(false);
  }, [showSidebarAppearanceControl, showSidebarThemeIcon]);

  useEffect(() => {
    if (!storedPreferencesReady) return;
    localStorage.setItem("veolms-wishlist", JSON.stringify([...wishlisted]));
  }, [storedPreferencesReady, wishlisted]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
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
        !(event.target instanceof Element) ||
        !event.target.closest("[data-palette-menu], [data-palette-trigger]")
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
        onNavigatePage?.("/settings/appearance");
        setActiveSection("Settings");
        setCourseMenu(null);
        setProfileMenu(false);
        setPaletteMenu(false);
        return;
      }

      if (event.key === "Escape") {
        setCourseMenu(null);
        setProfileMenu(false);
        revertPalettePreviewRef.current?.();
        setPaletteMenu(false);
        setReadingModeMenu(null);
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
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [edgeSidebarOpen, onNavigatePage, sidebarMode]);

  const navigation = getVisibleOrderedNavigation(
    navigationPreferencesReady && !isPublicNavigation
      ? navigationOrders[role]
      : isPublicNavigation
        ? getDefaultNavigationOrder(navigationItems)
        : getInitialNavigationOrder(role, navigationItems),
    navigationPreferencesReady && !isPublicNavigation
      ? navigationVisibility[role]
      : isPublicNavigation
        ? getDefaultNavigationVisibility(navigationItems)
        : getInitialNavigationVisibility(role, navigationItems),
    navigationItems,
  ).filter(([label]) => label !== "Settings" || !settingsInSidebarDock);
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
  }, [compactNavigation, navigation, role, sidebarMode]);

  const allCourses = useMemo(() => {
    if (role !== "creator") {
      const apiCourses = (publishedCoursesData?.courses || []).map(
        adaptCourseSummaryToCatalogueCourse,
      );
      const existingIds = new Set(apiCourses.map((c) => c.id));
      const nonConflictingMockCourses = courses.filter(
        (c) => !existingIds.has(c.id),
      );
      return [...apiCourses, ...nonConflictingMockCourses];
    }
    if (enrollmentFilter === "bin") {
      const apiDeletedCourses = (deletedCoursesData?.courses || []).map(
        adaptDeletedCourseToCatalogueCourse,
      );
      const mockDeletedCourses = courses.filter((c) =>
        deletedMockCourseIds.has(c.id),
      );
      return [...apiDeletedCourses, ...mockDeletedCourses];
    }
    const apiCourses = (myCoursesData?.courses || []).map(
      adaptApiCourseToCatalogueCourse,
    );
    const existingIds = new Set(apiCourses.map((c) => c.id));
    const nonConflictingMockCourses = courses.filter(
      (c) => !existingIds.has(c.id) && !deletedMockCourseIds.has(c.id),
    );
    return [...apiCourses, ...nonConflictingMockCourses];
  }, [
    deletedCoursesData?.courses,
    deletedMockCourseIds,
    enrollmentFilter,
    myCoursesData?.courses,
    publishedCoursesData?.courses,
    role,
  ]);

  const handleDeleteCourse = async (course: Course) => {
    const isMock = !course.id.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    if (isMock) {
      setDeletedMockCourseIds((prev) => new Set(prev).add(course.id));
      setNotice(`${course.title} moved to Bin.`);
      return;
    }

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
    }
  };

  const handleRestoreCourse = async (course: Course) => {
    const isMock = !course.id.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    if (isMock) {
      setDeletedMockCourseIds((prev) => {
        const next = new Set(prev);
        next.delete(course.id);
        return next;
      });
      setNotice(`${course.title} was restored.`);
      return;
    }

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

  const visibleCourses = useMemo(
    () =>
      getVisibleCourses(allCourses, {
        activeSection,
        wishlisted,
        role,
        enrollmentFilter,
        statusFilter,
        search,
        sort,
      }),
    [
      activeSection,
      allCourses,
      enrollmentFilter,
      role,
      search,
      sort,
      statusFilter,
      wishlisted,
    ],
  );

  const toggleWishlist = (courseId: string) => {
    setWishlisted((current) => {
      const next = new Set(current);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  };

  const resetCatalogue = () => {
    setSearch("");
    setStatusFilter("all");
    setEnrollmentFilter("all");
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    setProfileMenu(false);
    setMobilePaletteMenu(false);
    setReadingModeMenu((current) => (current === "mobile" ? null : current));
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
    dismissMobileMenuThen(() =>
      onNavigatePage?.(getNavigationDestination(item ?? label)),
    );
  };

  const reorderNavigation = (
    sourceLabel: string,
    targetLabel: string,
    position: NavigationDropPosition = "before",
  ) => {
    if (!sourceLabel || !targetLabel || sourceLabel === targetLabel) return;
    setNavigationOrders((current) => {
      const currentOrder =
        navigationPreferencesReady && !isPublicNavigation
          ? current[role] || getInitialNavigationOrder(role, navigationItems)
          : isPublicNavigation
            ? getDefaultNavigationOrder(navigationItems)
            : getInitialNavigationOrder(role, navigationItems);
      const sourceIndex = currentOrder.indexOf(sourceLabel);
      if (sourceIndex < 0 || !currentOrder.includes(targetLabel))
        return current;
      const nextOrder = [...currentOrder];
      nextOrder.splice(sourceIndex, 1);
      const targetIndex = nextOrder.indexOf(targetLabel);
      nextOrder.splice(
        targetIndex + (position === "after" ? 1 : 0),
        0,
        sourceLabel,
      );
      return { ...current, [role]: nextOrder };
    });
  };

  const moveNavigationWithKeyboard = (label: string, direction: -1 | 1) => {
    const currentOrder =
      navigationPreferencesReady && !isPublicNavigation
        ? navigationOrders[role] ||
          getInitialNavigationOrder(role, navigationItems)
        : isPublicNavigation
          ? getDefaultNavigationOrder(navigationItems)
          : getInitialNavigationOrder(role, navigationItems);
    const currentIndex = currentOrder.indexOf(label);
    const targetLabel = currentOrder[currentIndex + direction];
    if (!targetLabel) return;
    reorderNavigation(label, targetLabel, direction < 0 ? "before" : "after");
    setNotice(`${label} moved ${direction < 0 ? "up" : "down"}.`);
  };

  const activateNavigationPointerDrag = (
    drag: NavigationDrag,
    acknowledge = false,
  ) => {
    if (navigationDragRef.current !== drag || drag.dragging) return;
    if (drag.timer !== null) {
      window.clearTimeout(drag.timer);
      drag.timer = null;
    }
    drag.dragging = true;
    navigationDragConsumedRef.current = true;
    try {
      drag.handle.setPointerCapture?.(drag.pointerId);
    } catch {
      // Pointer capture is optional; hit testing still determines drop targets.
    }
    setDraggedNavigationLabel(drag.label);
    setSidebarTooltip(null);
    if (acknowledge) acknowledgeLongPress();
  };

  const startNavigationPointerDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    label: string,
  ) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const requiresLongPress =
      event.pointerType !== "mouse" ||
      compactNavigation ||
      coarseNavigationInput;
    const drag: NavigationDrag = {
      pointerId: event.pointerId,
      label,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      requiresLongPress,
      timer: null,
      handle: event.currentTarget,
      scrolling: false,
      scrollRegion: event.currentTarget.closest<HTMLElement>(
        ".courses-nav, .mobile-menu-sheet__list",
      ),
      startScrollTop:
        event.currentTarget.closest<HTMLElement>(
          ".courses-nav, .mobile-menu-sheet__list",
        )?.scrollTop ?? 0,
    };
    navigationDragRef.current = drag;
    navigationDropRef.current = null;
    navigationDragConsumedRef.current = false;
    setNavigationDropTarget(null);
    if (!requiresLongPress) return;

    event.stopPropagation();
    primeLongPressFeedback();
    drag.timer = window.setTimeout(
      () => activateNavigationPointerDrag(drag, true),
      NAVIGATION_LONG_PRESS_DURATION,
    );
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Native scrolling may retain the pointer until long press activates.
    }
  };

  const moveNavigationPointerDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const drag = navigationDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.requiresLongPress) event.stopPropagation();
    if (drag.scrolling) {
      event.preventDefault();
      if (drag.scrollRegion) {
        drag.scrollRegion.scrollTop =
          drag.startScrollTop - (event.clientY - drag.startY);
      }
      return;
    }
    if (!drag.dragging) {
      const distance = Math.hypot(
        event.clientX - drag.startX,
        event.clientY - drag.startY,
      );
      if (drag.requiresLongPress) {
        if (distance <= NAVIGATION_LONG_PRESS_MOVE_TOLERANCE) return;
        if (drag.timer !== null) window.clearTimeout(drag.timer);
        drag.timer = null;
        drag.scrolling = true;
        navigationDragConsumedRef.current = true;
        event.preventDefault();
        if (drag.scrollRegion) {
          drag.scrollRegion.scrollTop =
            drag.startScrollTop - (event.clientY - drag.startY);
        }
        return;
      }
      if (distance < 7) return;
      activateNavigationPointerDrag(drag);
    }
    event.preventDefault();
    event.stopPropagation();
    const targetButton = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-navigation-label]");
    const targetLabel = targetButton?.dataset.navigationLabel;
    if (!targetLabel || targetLabel === drag.label) {
      navigationDropRef.current = null;
      setNavigationDropTarget(null);
      return;
    }
    const targetRect = targetButton.getBoundingClientRect();
    const position: NavigationDropPosition =
      event.clientY >= targetRect.top + targetRect.height / 2
        ? "after"
        : "before";
    const dropTarget = { label: targetLabel, position };
    navigationDropRef.current = dropTarget;
    setNavigationDropTarget((current) =>
      current?.label === targetLabel && current.position === position
        ? current
        : dropTarget,
    );
  };

  const finishNavigationPointerDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    cancelled = false,
  ) => {
    const drag = navigationDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    navigationDragRef.current = null;
    if (drag.timer !== null) window.clearTimeout(drag.timer);
    if (drag.requiresLongPress) event.stopPropagation();
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Capture may already have been released by the browser.
    }
    if (!drag.dragging && !drag.scrolling) return;
    event.preventDefault();
    navigationDragConsumedRef.current = true;
    if (drag.dragging && !cancelled && navigationDropRef.current) {
      reorderNavigation(
        drag.label,
        navigationDropRef.current.label,
        navigationDropRef.current.position,
      );
      setNotice("Navigation order saved.");
    }
    navigationDropRef.current = null;
    setDraggedNavigationLabel(null);
    setNavigationDropTarget(null);
    window.setTimeout(() => {
      navigationDragConsumedRef.current = false;
    }, 1000);
  };

  const handleNavigationClick = (
    event: ReactMouseEvent<HTMLButtonElement>,
    label: string,
    item?: NavigationItemWithMetadata,
  ) => {
    if (navigationDragConsumedRef.current) {
      navigationDragConsumedRef.current = false;
      event.preventDefault();
      return;
    }
    selectNavigation(label, item);
  };

  const navigationUsesCompactInteraction =
    compactNavigation || coarseNavigationInput;
  const { collapsed: sidebarCollapsed, hidden: sidebarHidden } =
    getSidebarPresentation(sidebarMode);
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
    setReadingModeMenu(mobile ? "mobile" : "desktop");
  };
  const openReadingModeMenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    mobile = false,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    showReadingModeMenu(mobile);
  };
  const fullscreenActionLabel = isFullscreen ? "Exit fullscreen" : "Fullscreen";
  const toggleFullscreen = useCallback(async () => {
    try {
      setIsFullscreen(await toggleDocumentFullscreen(document));
    } catch {
      setNotice("Fullscreen is not available in this browser.");
    }
  }, []);

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
    // Selecting what is already displayed runs no transition; plain state
    // updates keep the committed selection and preview in sync.
    if (nextTheme === displayedAcademyTheme) {
      setAcademyTheme(nextTheme);
      setPalettePreviewTheme(null);
      return;
    }
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
  };

  const previewAcademyTheme = (themeId: string, origin?: ThemeRevealOrigin) => {
    // No transition when the previewed theme already matches the displayed
    // one; keyboard previews carry the focused swatch's center and pointer
    // previews carry the pointer position as the reveal origin.
    if (themeId === displayedAcademyTheme) {
      setPalettePreviewTheme(themeId);
      return;
    }
    applyWithThemeViewTransition(
      () =>
        flushSync(() => {
          setPalettePreviewTheme(themeId);
          commitPalette(themeId);
        }),
      "palette",
      origin,
    );
  };

  // Reverts an unconfirmed keyboard preview back to the committed theme.
  // Only the revert (previewed theme differing from the committed one)
  // runs a transition; otherwise clearing the preview changes nothing
  // displayed and stays silent. Keyboard Escape carries the focused
  // swatch's center; other dismissals pass nothing for the corner
  // fallback.
  const revertPalettePreview = (origin?: ThemeRevealOrigin) => {
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
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (event.pointerType === "mouse") return;

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
    sidebarVisuallyCollapsed ? "courses-app--collapsed" : "",
    sidebarPresentedAsOverlay ? "courses-app--hidden" : "",
    sidebarPresentedAsOverlay && edgeSidebarOpen
      ? "courses-app--edge-open"
      : "",
    sidebarOverlaySwipeOffset !== null ? "courses-app--overlay-swiping" : "",
    sidebarResizing ? "courses-app--resizing" : "",
    sidebarResizeContentVisible ? "courses-app--resize-content-visible" : "",
    draggedNavigationLabel ? "courses-app--navigation-dragging" : "",
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
      coarseNavigationInput ||
      navigationDragRef.current?.dragging
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

  const startSidebarScreenSwipe = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
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
        event.clientX >= window.innerWidth / 2) ||
      sidebarResizeRef.current ||
      isSidebarSwipeExcludedTarget(event.target) ||
      isFocusedSidebarSwipeInput(event.target)
    )
      return;

    sidebarResizeRef.current = createSidebarGesture({
      active: false,
      clientX: event.clientX,
      clientY: event.clientY,
      handle: event.currentTarget,
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
  sidebarResizeMoveRef.current = moveSidebarResize;
  sidebarResizeFinishRef.current = endSidebarResize;

  useEffect(() => {
    const continueResize = (event: PointerEvent) =>
      sidebarResizeMoveRef.current?.(event);
    const finishResize = (event: PointerEvent) =>
      sidebarResizeFinishRef.current?.(event);
    const cancelResize = (event: PointerEvent) =>
      sidebarResizeFinishRef.current?.(event, true);
    window.addEventListener("pointermove", continueResize, {
      capture: true,
      passive: false,
    });
    window.addEventListener("pointerup", finishResize, true);
    window.addEventListener("pointercancel", cancelResize, true);
    return () => {
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

  const learningSessions = getOpenCoursePlayerSessions();
  const visibleLearningCourseId = isLearningSurface ? courseSlug : undefined;
  const activateLearningSession = useCallback(
    (session: CoursePlayerSession) => {
      const destination =
        activateCoursePlayerSession(session.courseId) || session.path;
      onNavigatePage(destination);
    },
    [onNavigatePage],
  );
  const closeLearningSession = useCallback(
    (session: CoursePlayerSession) => {
      const closesVisibleSession =
        isLearningSurface && courseSlug === session.courseId;
      const nextSession = closeCoursePlayerSession(session.courseId);
      if (!closesVisibleSession) return;
      onNavigatePage(nextSession?.path || session.returnPath);
    },
    [courseSlug, isLearningSurface, onNavigatePage],
  );

  const mobileNavigation = getMobilePrimaryNavigation(role, navigation);
  const mobileMoreNavigation = getMobileOverflowNavigation(
    navigation,
    mobileNavigation,
  );
  const mobileMoreActive = Boolean(
    activeNavigationSection &&
    mobileMoreNavigation.some(isNavigationItemActive),
  );
  const currentAcademyThemeIndex = academyThemes.findIndex(
    (item) => item.id === academyTheme,
  );

  if (!storedPreferencesReady) return <AppLoadingScreen />;

  return (
    <div
      className={sidebarClassName}
      suppressHydrationWarning
      onPointerDownCapture={startSidebarScreenSwipe}
      style={
        {
          "--sidebar-expanded-width": `${sidebarResizePreviewWidth ?? sidebarWidth}px`,
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
            className="courses-sidebar"
            data-header-layout={sidebarHeaderLayout}
            aria-label={`${role === "creator" ? "Creator" : "Student"} navigation`}
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
                      ? sidebarWidth
                      : sidebarCollapsed
                        ? SIDEBAR_COLLAPSED_WIDTH
                        : sidebarWidth),
                )}
                aria-valuetext={
                  sidebarPresentedAsOverlay
                    ? `${Math.round(sidebarResizePreviewWidth ?? sidebarWidth)} pixel temporary sidebar`
                    : sidebarCollapsed
                      ? "Collapsed sidebar"
                      : `${Math.round(sidebarWidth)} pixels wide`
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
                const displayLabel = label;
                const accessibleLabel = [
                  displayLabel,
                  label === "Wishlist" && wishlisted.size > 0
                    ? `${wishlisted.size} saved`
                    : null,
                ]
                  .filter(Boolean)
                  .join(", ");
                return (
                  <Fragment key={label}>
                    {shouldRenderLearningSpace &&
                      !compactNavigation &&
                      label === "Settings" && (
                        <LearningSpace
                          sessions={learningSessions}
                          activeCourseId={visibleLearningCourseId}
                          expanded={learningSpaceExpanded}
                          collapsedSidebar={sidebarCollapsed}
                          iconColor={getNavigationIconColor(
                            "Learning Space",
                            sidebarPreferences,
                          )}
                          onExpandedChange={setLearningSpaceExpanded}
                          onActivate={activateLearningSession}
                          onClose={closeLearningSession}
                        />
                      )}
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
                          ? `${navigationIndex + 1} ${primaryShortcutModifier}+Comma Alt+ArrowUp Alt+ArrowDown`
                          : `${navigationIndex + 1} Alt+ArrowUp Alt+ArrowDown`
                      }
                      data-navigation-label={label}
                      data-sortable="true"
                      onClick={(event) =>
                        handleNavigationClick(event, label, item)
                      }
                      onContextMenu={(event) => {
                        if (navigationUsesCompactInteraction)
                          event.preventDefault();
                      }}
                      onPointerDown={(event) =>
                        startNavigationPointerDrag(event, label)
                      }
                      onPointerMove={moveNavigationPointerDrag}
                      onPointerUp={finishNavigationPointerDrag}
                      onPointerCancel={(event) =>
                        finishNavigationPointerDrag(event, true)
                      }
                      onKeyDown={(event) => {
                        if (
                          !event.altKey ||
                          (event.key !== "ArrowUp" && event.key !== "ArrowDown")
                        )
                          return;
                        event.preventDefault();
                        moveNavigationWithKeyboard(
                          label,
                          event.key === "ArrowUp" ? -1 : 1,
                        );
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
                              : [String(navigationIndex + 1)]
                          }
                        />
                      )}
                      {label === "Wishlist" && wishlisted.size > 0 && (
                        <b>{wishlisted.size}</b>
                      )}
                    </button>
                    {shouldRenderLearningSpace &&
                      mobileSidebarNavigationActive &&
                      label === "Courses" && (
                        <LearningSpace
                          sessions={learningSessions}
                          activeCourseId={visibleLearningCourseId}
                          expanded={learningSpaceExpanded}
                          mobile
                          mobileNavigationPlacement="sidebar"
                          iconColor={getNavigationIconColor(
                            "Learning Space",
                            sidebarPreferences,
                          )}
                          onExpandedChange={setLearningSpaceExpanded}
                          onActivate={activateLearningSession}
                          onClose={closeLearningSession}
                        />
                      )}
                  </Fragment>
                );
              })}
              {shouldRenderLearningSpace &&
                !compactNavigation &&
                !navigation.some(([label]) => label === "Settings") && (
                  <LearningSpace
                    sessions={learningSessions}
                    activeCourseId={visibleLearningCourseId}
                    expanded={learningSpaceExpanded}
                    collapsedSidebar={sidebarCollapsed}
                    iconColor={getNavigationIconColor(
                      "Learning Space",
                      sidebarPreferences,
                    )}
                    onExpandedChange={setLearningSpaceExpanded}
                    onActivate={activateLearningSession}
                    onClose={closeLearningSession}
                  />
                )}
            </nav>

            <div className="courses-profile" ref={profileRef}>
              {profileMenu && isAuthenticated && (
                <ProfileMenu
                  role={role}
                  allowedRoles={allowedWorkspaceRoles}
                  sidebarHidden={sidebarPresentedAsOverlay}
                  includeSidebarControl={!compactNavigation}
                  onClose={() => setProfileMenu(false)}
                  onRoleChange={setRole}
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
                  aria-label={`${shellProfileDisplayName}, ${
                    role === "creator" ? "Instructor" : "Student"
                  }. Open role and appearance menu`}
                  aria-expanded={profileMenu}
                  onClick={() => setProfileMenu((current) => !current)}
                >
                  <ShellProfileAvatar
                    avatarUrl={shellProfileAvatarUrl}
                    displayName={shellProfileDisplayName}
                  />
                  <span>
                    <strong>{shellProfileDisplayName}</strong>
                    <small>
                      {role === "creator" ? "Instructor" : "Student"} <i />
                    </small>
                  </span>
                  <CaretDown size={16} />
                </button>
              ) : (
                <LoginProfileButton
                  className="courses-profile__button"
                  iconSize={30}
                  arrowSize={16}
                  onLogin={() => onNavigatePage("/login")}
                />
              )}
              <div
                ref={appearanceControlsRef}
                className={`sidebar-appearance sidebar-appearance--${appearanceControlsHorizontal ? "horizontal" : "vertical"}`}
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
                          <Moon size={19} />
                        ) : (
                          <Sun size={19} />
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
                          size={20}
                          weight={readingModeEnabled ? "fill" : "regular"}
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
                        title="Open settings"
                        aria-current={settingsActive ? "page" : undefined}
                        aria-keyshortcuts={`${primaryShortcutModifier}+Comma`}
                        onClick={() => selectNavigation("Settings")}
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

      <main
        id="courses-main-scrollport"
        ref={mainScrollportRef}
        className={[
          "courses-main",
          renderMain
            ? "courses-main--learning"
            : page !== "courses"
              ? "student-surface-main"
              : "",
          !renderMain && page === "settings" ? "courses-main--settings" : "",
          mobileSidebarNavigationActive
            ? renderMain
              ? "max-[820px]:pb-0!"
              : "max-[820px]:pb-4!"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <>
          {renderMain ? (
            renderMain({
              mobileBottomNavigation:
                compactNavigation && !mobileSidebarNavigationActive,
              mobileBottomNavigationHidden: mobileBottomNavHidden,
            })
          ) : role === "creator" && page === "home" ? (
            <CreatorDashboard
              onNavigatePage={onNavigatePage}
              setNotice={setNotice}
              academyTheme={appliedAcademyTheme}
            />
          ) : role === "student" && page === "home" ? (
            <StudentHome
              onOpenCourse={onOpenCourse}
              onNavigatePage={onNavigatePage}
              studentName={shellProfileDisplayName}
            />
          ) : page === "settings" ? (
            <SettingsPage
              tab={settingsTab}
              role={role}
              onNavigatePage={onNavigatePage}
              onExitSettings={onExitSettings}
              onProfileSaved={(profile) => {
                setSavedShellProfiles((current) => ({
                  ...current,
                  [role]: profile,
                }));
              }}
              theme={theme}
              onThemeChange={(next, origin) => {
                if (next !== theme) {
                  themeRevealOriginRef.current = origin ?? null;
                }
                setTheme(next);
              }}
              academyTheme={appliedAcademyTheme}
              onAcademyThemeChange={changePalette}
              pageTabColors={pageTabColors}
              onPageTabColorsChange={setPageTabColors}
              sidebarPreferences={sidebarPreferences}
              onSidebarPreferencesChange={setSidebarPreferences}
              sidebarMode={sidebarMode}
              onSidebarModeChange={setSidebarMode}
              navigationItems={navigationItems}
              navigationVisibleItems={
                navigationPreferencesReady && !isPublicNavigation
                  ? navigationVisibility[role]
                  : isPublicNavigation
                    ? getDefaultNavigationVisibility(navigationItems)
                    : getInitialNavigationVisibility(role, navigationItems)
              }
              onNavigationVisibilityChange={(visibleItems) =>
                setNavigationVisibility((current) => ({
                  ...current,
                  [role]: visibleItems,
                }))
              }
            />
          ) : page === "workspace" ? (
            <WorkspacePage
              section={requestedSection || activeSection}
              role={role}
              discussionTab={discussionTab}
              onNavigatePage={onNavigatePage}
              setNotice={setNotice}
              onSignOut={() => {
                localStorage.removeItem("veolms-role");
                setRole("student");
              }}
            />
          ) : page === "course-create" ? (
            <Suspense fallback={null}>
              <CourseCreatePage
                onNavigatePage={onNavigatePage}
                bottomNavHidden={mobileBottomNavHidden}
              />
            </Suspense>
          ) : page === "course-overview" ? (
            <Suspense fallback={null}>
              <CourseOverviewPage
                courseSlug={courseSlug}
                onNavigateCourses={() => onNavigatePage("/courses")}
                onNavigatePage={onNavigatePage}
              />
            </Suspense>
          ) : page === "reviews" ||
            requestedSection === "Reviews" ||
            activeSection === "Reviews" ? (
            <ReviewsPage
              onNavigatePage={onNavigatePage}
              setNotice={setNotice}
            />
          ) : page === "orders" ||
            requestedSection === "Orders" ||
            activeSection === "Orders" ? (
            <OrdersPage onNavigatePage={onNavigatePage} setNotice={setNotice} />
          ) : page === "order-history" ||
            requestedSection === "Order History" ||
            activeSection === "Order History" ? (
            <OrderHistoryPage
              onNavigatePage={onNavigatePage}
              setNotice={setNotice}
            />
          ) : page === "notifications" ||
            requestedSection === "Notifications" ||
            activeSection === "Notifications" ||
            requestedSection === "Notification" ||
            activeSection === "Notification" ? (
            <NotificationsPage
              onNavigatePage={onNavigatePage}
              setNotice={setNotice}
            />
          ) : page === "placeholder" ? (
            <PlaceholderPage
              section={requestedSection || activeSection}
              role={role}
            />
          ) : (
            <CourseCatalogue
              activeSection={activeSection}
              role={role}
              wishlisted={wishlisted}
              enrollmentFilter={enrollmentFilter}
              onEnrollmentFilterChange={setEnrollmentFilter}
              search={search}
              onSearchChange={setSearch}
              sort={sort}
              onSortChange={setSort}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              visibleCourses={visibleCourses}
              onWishlist={toggleWishlist}
              onOpenCourse={onOpenCourse}
              courseMenu={courseMenu}
              setCourseMenu={setCourseMenu}
              setNotice={setNotice}
              onNavigatePage={onNavigatePage}
              onResetCatalogue={resetCatalogue}
              onDeleteCourse={handleDeleteCourse}
              onRestoreCourse={handleRestoreCourse}
            />
          )}
        </>
      </main>

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
          aria-label={`${role === "creator" ? "Creator" : "Student"} mobile navigation`}
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
                  aria-label={[
                    displayLabel,
                    label === "Wishlist" && wishlisted.size > 0
                      ? `${wishlisted.size} saved`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  data-navigation-label={label}
                  onClick={() => selectNavigation(label, item)}
                >
                  <span>
                    <Icon size={23} weight={active ? "fill" : "regular"} />
                    {label === "Wishlist" && wishlisted.size > 0 && (
                      <b>{wishlisted.size}</b>
                    )}
                  </span>
                  <small>{displayLabel}</small>
                </button>
                {shouldRenderLearningSpace && label === "Courses" && (
                  <LearningSpace
                    sessions={learningSessions}
                    activeCourseId={visibleLearningCourseId}
                    expanded={learningSpaceExpanded}
                    mobile
                    iconColor={getNavigationIconColor(
                      "Learning Space",
                      sidebarPreferences,
                    )}
                    onExpandedChange={setLearningSpaceExpanded}
                    onActivate={activateLearningSession}
                    onClose={closeLearningSession}
                  />
                )}
              </Fragment>
            );
          })}
          <button
            id="mobile-navigation-trigger"
            ref={mobileMoreRef}
            type="button"
            className={mobileMoreActive ? "is-active" : ""}
            aria-label="More navigation options"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation-sheet"
            onClick={() => {
              const nextSnapPoint = isLearningSurface
                ? getLearningMobileMenuSnapPoint()
                : MOBILE_DRAWER_INITIAL_SNAP_POINT;
              setMobilePaletteMenu(false);
              setMobileMenuCollapsedSnapPoint(nextSnapPoint);
              setMobileMenuSnapPoint(nextSnapPoint);
              setMobileMenuOpen(true);
            }}
          >
            <span>
              <DotsThreeCircle
                size={24}
                weight={mobileMoreActive ? "fill" : "regular"}
              />
            </span>
            <small>More</small>
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
          ref={mobileSheetRef}
          id="mobile-navigation-sheet"
          aria-labelledby="mobile-navigation-title"
          aria-describedby="mobile-navigation-description"
          initialFocus={mobileSheetRef}
          finalFocus={mobileMoreRef}
          tabIndex={-1}
          className="mobile-menu-sheet data-expanded:rounded-none data-[swipe-axis=y]:[--drawer-content-max-height:100dvh] rounded-t-[22px] px-3 pb-[max(14px,var(--app-safe-area-bottom))] shadow-[0_-24px_70px_rgba(0,0,0,0.42)]"
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
          <div className="mobile-menu-sheet__body">
            <div className="mobile-menu-sheet__heading">
              <div>
                <DrawerTitle id="mobile-navigation-title">More</DrawerTitle>
                <DrawerDescription id="mobile-navigation-description">
                  Navigation not shown in the bottom bar
                </DrawerDescription>
              </div>
            </div>
            <div
              className="mobile-menu-sheet__profile-wrap"
              data-profile-surface
            >
              {isAuthenticated ? (
                <button
                  type="button"
                  className="mobile-menu-sheet__profile"
                  aria-haspopup="menu"
                  aria-expanded={profileMenu}
                  aria-controls="mobile-profile-menu"
                  aria-label={`${shellProfileDisplayName}, ${role === "creator" ? "Instructor" : "Student"}. Open role menu`}
                  onClick={() => setProfileMenu((current) => !current)}
                >
                  <ShellProfileAvatar
                    avatarUrl={shellProfileAvatarUrl}
                    displayName={shellProfileDisplayName}
                  />
                  <span>
                    <strong>{shellProfileDisplayName}</strong>
                    <small>
                      {role === "creator" ? "Instructor" : "Student"}
                    </small>
                  </span>
                  <CaretDown size={17} aria-hidden="true" />
                </button>
              ) : (
                <LoginProfileButton
                  className="mobile-menu-sheet__profile"
                  iconSize={30}
                  arrowSize={17}
                  onLogin={() => onNavigatePage("/login")}
                />
              )}
              {profileMenu && isAuthenticated && (
                <ProfileMenu
                  id="mobile-profile-menu"
                  className="mobile-menu-sheet__profile-menu"
                  role={role}
                  allowedRoles={allowedWorkspaceRoles}
                  includeSidebarControl={false}
                  onClose={() => setProfileMenu(false)}
                  onRoleChange={setRole}
                  onLogout={() => {
                    closeMobileMenu();
                    setLogoutConfirmOpen(true);
                  }}
                />
              )}
            </div>
            <nav
              className="mobile-menu-sheet__list"
              aria-label="More navigation options"
            >
              {mobileMoreNavigation.map((item) => {
                const [label, Icon] = item;
                const active = isNavigationItemActive(item);
                const displayLabel = label;
                return (
                  <button
                    type="button"
                    key={label}
                    className={[
                      active ? "is-active" : "",
                      draggedNavigationLabel === label ? "is-dragging" : "",
                      navigationDropTarget?.label === label
                        ? "is-drop-target"
                        : "",
                      navigationDropTarget?.label === label &&
                      navigationDropTarget.position === "after"
                        ? "is-drop-after"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={
                      {
                        "--nav-icon-color": getNavigationIconColor(
                          label,
                          sidebarPreferences,
                        ),
                      } as CSSProperties
                    }
                    aria-current={active ? "page" : undefined}
                    aria-label={[
                      displayLabel,
                      label === "Wishlist" && wishlisted.size > 0
                        ? `${wishlisted.size} saved`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                    data-navigation-label={label}
                    onClick={(event) =>
                      handleNavigationClick(event, label, item)
                    }
                  >
                    <Icon size={23} weight={active ? "fill" : "regular"} />
                    <span>{displayLabel}</span>
                    {label === "Wishlist" && wishlisted.size > 0 && (
                      <b>{wishlisted.size}</b>
                    )}
                  </button>
                );
              })}
            </nav>
            <div
              className="mobile-menu-sheet__appearance"
              role="group"
              aria-label="Appearance controls"
              style={
                {
                  "--mobile-palette-anchor-x": `${mobilePaletteAnchorX}%`,
                } as CSSProperties
              }
            >
              {sidebarDockItems.map((item) => {
                if (item === "appearance") {
                  return (
                    <button
                      key={item}
                      ref={mobileAppearanceModeTriggerRef}
                      data-dock-item={item}
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
                        <Moon size={20} />
                      ) : (
                        <Sun size={20} />
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
                        size={20}
                        weight={readingModeEnabled ? "fill" : "regular"}
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
                      title="Open settings"
                      aria-current={settingsActive ? "page" : undefined}
                      aria-keyshortcuts={`${primaryShortcutModifier}+Comma`}
                      onClick={() => selectNavigation("Settings")}
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
              {mobilePaletteMenu && (
                <AcademyPaletteMenu
                  themes={academyThemes}
                  selectedTheme={displayedAcademyTheme}
                  id="mobile-theme-menu"
                  className="sidebar-palette-menu mobile-palette-menu"
                  mobile
                  onSelect={changePalette}
                  onPreview={previewAcademyTheme}
                  onConfirm={confirmMobilePaletteTheme}
                  onCancel={cancelMobilePalettePreview}
                />
              )}
            </div>
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
          </div>
        </DrawerContent>
      </Drawer>

      <LogoutConfirmModal
        isOpen={logoutConfirmOpen}
        isPending={logoutMutation.isPending}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={handleLogout}
      />

      {notice && (
        <ToastNotification
          message={notice}
          type="info"
          onDismiss={() => setNotice("")}
        />
      )}
    </div>
  );
}
