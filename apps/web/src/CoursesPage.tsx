import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  TouchEvent as ReactTouchEvent,
} from "react";
import {
  CaretDown,
  Check,
  CornersIn,
  CornersOut,
  DotsThreeCircle,
  Eye,
  GearSix,
  Moon,
  Palette,
  Play,
  Question,
  SignOut,
  SidebarSimple,
  Student,
  Sun,
  Users,
} from "@phosphor-icons/react";
import logoDarkSvg from "./assets/procodrr-logo-dark.svg?raw";
import { CreatorDashboard } from "./CreatorDashboard";
import { MyCoursesPage, StudentHome } from "./StudentPages";
import type { LearningCourse } from "./StudentPages";
import { SettingsPage } from "./SettingsPage";
import { courses, getVisibleCourses } from "./courses/catalogue";
import type {
  Course,
  CourseCategory,
  CourseEnrollmentFilter,
  CourseRole,
  CourseSort,
} from "./courses/catalogue";
import { CourseCatalogue } from "./courses/CourseCatalogue";
import { AcademyPaletteMenu } from "./shell/AcademyPaletteMenu";
import { SidebarToggleIcon } from "./shell/SidebarToggleIcon";
import { PlaceholderPage } from "./courses/PlaceholderPage";
import { WorkspacePage } from "./workspace/WorkspacePages";
import {
  getInitialNavigationOrder,
  getNavigationDestination,
  getNavigationDisplayLabel,
  getNavigationIconColor,
  getOrderedNavigation,
} from "./shell/navigation";
import {
  SIDEBAR_MIN_WIDTH,
  clampSidebarMaxWidth,
  clampSidebarWidth,
  getInitialSidebarPreferences,
  getInitialSidebarWidth,
} from "./shell/sidebarPreferences";
import {
  academyThemes,
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
  normalizeSidebarDockItems,
  normalizeSidebarDockOrder,
  ELEVATED_SURFACES_KEY,
  PAGE_TAB_COLORS_KEY,
  readPageTabColors,
} from "./settings/settingsPreferences";
import { getStoredProfilePreferences } from "./settings/profilePreferences";
import type { ProfilePreferences } from "./settings/profilePreferences";
import type { NavigateTo } from "./routing/navigation";
import { isEditingShortcutTarget } from "./keyboardShortcuts";
import { useShortcutPlatform } from "./useShortcutPlatform";
import {
  canToggleDocumentFullscreen,
  getDocumentFullscreenElement,
  toggleDocumentFullscreen,
} from "./fullscreen";
import {
  COURSE_PLAYER_SESSION_CHANGE_EVENT,
  COURSE_PLAYER_SESSION_STORAGE_KEY,
  getCoursePlayerOriginFromSection,
  getRememberedCoursePlayerDestination,
} from "./learning/coursePlayerNavigation";
import {
  isStoredString,
  useSessionStorageState,
} from "./learning/useSessionStorageState";
import {
  persistReadingModePreferences,
  readReadingModePreferences,
  READING_MODE_CHANGE_EVENT,
} from "./reading-mode/readingModePreferences";
import type { ReadingModePreferences } from "./reading-mode/readingModePreferences";
import { ReadingModeQuickMenu } from "./reading-mode/ReadingModeQuickMenu";

type ThemePreference = "light" | "dark" | "device";
type AppearanceOption = ThemePreference | "theme";
type AppearanceSwipeSource = AppearanceOption;
type NavigationDropPosition = "before" | "after";

interface CoursesPageProps {
  onOpenCourse: (course: Course | LearningCourse) => void;
  onNavigatePage: NavigateTo;
  onExitSettings?: () => void;
  page?: string;
  section?: string | null;
  settingsTab?: string;
  discussionTab?: string;
  renderMain?: (() => ReactNode) | null;
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

type SidebarGestureSource = "rail" | "screen";

interface SidebarResize {
  pointerId: number;
  source: SidebarGestureSource;
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
  preventDefault?: () => void;
}

interface MobileDragBase {
  startY: number;
  lastY: number;
  startedAt: number;
  dragging: boolean;
  scrollRegion: HTMLElement | null;
}

interface MobilePointerDrag extends MobileDragBase {
  kind: "pointer";
  pointerId: number;
}

interface MobileTouchDrag extends MobileDragBase {
  kind: "touch";
  touchId: number;
}

type MobileDrag = MobilePointerDrag | MobileTouchDrag;

interface SidebarTooltip {
  label: string;
  shortcutGroups: readonly (readonly string[])[];
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

function CourseResumeIndicator() {
  return (
    <i className="courses-nav__resume-indicator" aria-hidden="true">
      <Play size={8} weight="fill" />
    </i>
  );
}

const isSidebarMode = (value: string | null): value is SidebarMode =>
  value === "expanded" || value === "collapsed" || value === "hidden";

const getClosestScrollRegion = (target: EventTarget): HTMLElement | null =>
  target instanceof Element
    ? target.closest<HTMLElement>(".mobile-menu-sheet__list")
    : null;

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
const APPEARANCE_LONG_PRESS_DURATION = 500;
const APPEARANCE_LONG_PRESS_MOVE_TOLERANCE = 10;
const NAVIGATION_LONG_PRESS_DURATION = 480;
const NAVIGATION_LONG_PRESS_MOVE_TOLERANCE = 10;
const MOBILE_NAV_HIDE_SCROLL_THRESHOLD = 56;
const MOBILE_NAV_SHOW_SCROLL_THRESHOLD = 18;
const MOBILE_NAV_TOP_GUARD = 12;

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
        <img src={avatarUrl} alt="" />
      ) : (
        <strong>{getProfileInitials(displayName)}</strong>
      )}
    </i>
  );
}

export function CoursesPage({
  onOpenCourse,
  onNavigatePage,
  onExitSettings,
  page = "explore-courses",
  section: requestedSection = null,
  settingsTab = "profile",
  discussionTab = "q-and-a",
  renderMain = null,
}: CoursesPageProps) {
  const [role, setRole] = useState<CourseRole>(
    () => (localStorage.getItem("veolms-role") || "student") as CourseRole,
  );
  const [savedShellProfiles, setSavedShellProfiles] = useState<
    Record<CourseRole, ProfilePreferences | null>
  >(() => ({
    student: getStoredProfilePreferences("student"),
    creator: getStoredProfilePreferences("creator"),
  }));
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() => {
    const savedMode = localStorage.getItem("veolms-sidebar-mode");
    if (isSidebarMode(savedMode)) return savedMode;
    return localStorage.getItem("veolms-sidebar-collapsed") === "true"
      ? "collapsed"
      : "expanded";
  });
  const [sidebarWidth, setSidebarWidth] = useState(getInitialSidebarWidth);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [sidebarResizePreviewWidth, setSidebarResizePreviewWidth] = useState<
    number | null
  >(null);
  const [navigationOrders, setNavigationOrders] = useState<
    Record<CourseRole, string[]>
  >(() => ({
    student: getInitialNavigationOrder("student"),
    creator: getInitialNavigationOrder("creator"),
  }));
  const [draggedNavigationLabel, setDraggedNavigationLabel] = useState<
    string | null
  >(null);
  const [navigationDropTarget, setNavigationDropTarget] =
    useState<NavigationDropTarget | null>(null);
  const [compactNavigation, setCompactNavigation] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 820px)").matches
      : false,
  );
  const [coarseNavigationInput, setCoarseNavigationInput] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(hover: none), (pointer: coarse)").matches
      : false,
  );
  const [edgeSidebarOpen, setEdgeSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(
    () => (localStorage.getItem("veolms-theme") || "dark") as ThemePreference,
  );
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() =>
    theme === "device"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme,
  );
  const [academyTheme, setAcademyTheme] = useState(getInitialAcademyTheme);
  const [palettePreviewTheme, setPalettePreviewTheme] = useState<string | null>(
    null,
  );
  const displayedAcademyTheme = palettePreviewTheme ?? academyTheme;
  const [sidebarPreferences, setSidebarPreferences] = useState(
    getInitialSidebarPreferences,
  );
  const [pageTabColors, setPageTabColors] =
    useState<PageTabColors>(readPageTabColors);
  const sidebarHeaderLayout =
    sidebarPreferences.headerLayout === "inline" ? "inline" : "fixed";
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
  const [readingModePreferences, setReadingModePreferences] = useState(
    readReadingModePreferences,
  );
  const readingModeEnabled = readingModePreferences.enabled;
  const [, setCoursePlayerSessionVersion] = useState(0);
  const [activeSection, setActiveSection] = useState(() => {
    if (page === "home") return role === "creator" ? "Dashboard" : "Home";
    if (page === "my-courses") return "My Courses";
    if (page === "explore-courses")
      return role === "creator" ? "Courses" : "Explore Courses";
    const storedSection = sessionStorage.getItem("veolms-course-section");
    if (role === "student" && storedSection === "Courses")
      return "Explore Courses";
    return (
      storedSection || (role === "creator" ? "Courses" : "Explore Courses")
    );
  });
  const [enrollmentFilter, setEnrollmentFilter] =
    useState<CourseEnrollmentFilter>("all");
  const [search, setSearch] = useSessionStorageState(
    "veolms-course-catalogue-search",
    "",
    isStoredString,
  );
  const [category, setCategory] = useState<"all" | CourseCategory>("all");
  const [sort, setSort] = useState<CourseSort>("latest");
  const [wishlisted, setWishlisted] = useState<Set<string>>(() => {
    try {
      const savedWishlist: unknown = JSON.parse(
        localStorage.getItem("veolms-wishlist") || "[]",
      );
      return new Set<string>(savedWishlist as Iterable<string>);
    } catch {
      return new Set();
    }
  });
  const [courseMenu, setCourseMenu] = useState<string | null>(null);
  const [profileMenu, setProfileMenu] = useState(false);
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
  const [sidebarTooltip, setSidebarTooltip] = useState<SidebarTooltip | null>(
    null,
  );
  const [navigationScrollFade, setNavigationScrollFade] = useState({
    top: false,
    bottom: false,
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobilePaletteMenu, setMobilePaletteMenu] = useState(false);
  const [mobileSheetOffset, setMobileSheetOffset] = useState(0);
  const [mobileBottomNavHidden, setMobileBottomNavHidden] = useState(false);
  const [notice, setNotice] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(() =>
    typeof document === "undefined"
      ? false
      : Boolean(getDocumentFullscreenElement(document)),
  );
  const shortcutPlatform = useShortcutPlatform();
  const savedShellProfile = savedShellProfiles[role];
  const shellProfileDisplayName =
    savedShellProfile?.displayName ??
    (role === "creator" ? "Anurag Singh" : "Ashi Singh");
  const shellProfileAvatarUrl = savedShellProfile
    ? savedShellProfile.avatarDataUrl
    : role === "creator"
      ? "/assets/ethan-avatar.jpg"
      : "/assets/sofia-avatar.jpg";
  const profileRef = useRef<HTMLDivElement>(null);
  const appearanceControlsRef = useRef<HTMLDivElement>(null);
  const appearanceControlRectsRef = useRef<DOMRect[]>([]);
  const appearanceLayoutRef = useRef<boolean | null>(null);
  const appearanceAnimationsRef = useRef<Animation[]>([]);
  const appearanceModeTriggerRef = useRef<HTMLButtonElement>(null);
  const paletteTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileAppearanceModeTriggerRef = useRef<HTMLButtonElement>(null);
  const mobilePaletteTriggerRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const mobileBottomNavRef = useRef<HTMLElement>(null);
  const mobileMoreRef = useRef<HTMLButtonElement>(null);
  const mobileSheetRef = useRef<HTMLElement>(null);
  const mobileDragRef = useRef<MobileDrag | null>(null);
  const mobileDragConsumedRef = useRef(false);
  const mobileMenuWasOpenRef = useRef(false);
  const sidebarResizeRef = useRef<SidebarResize | null>(null);
  const sidebarResizeMoveRef = useRef<
    ((event: PointerPositionEvent) => void) | null
  >(null);
  const sidebarResizeFinishRef = useRef<
    ((event: PointerPositionEvent, cancelled?: boolean) => void) | null
  >(null);
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
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const nextTheme =
        theme === "device" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = nextTheme;
      document.documentElement.dataset.appearance = theme;
      setResolvedTheme(nextTheme);
    };
    applyTheme();
    localStorage.setItem("veolms-theme", theme);
    if (theme !== "device") return undefined;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  useEffect(() => {
    // Appearance preferences are stored independently from the settings route,
    // so restore this shell-wide preference whenever the app mounts or refreshes.
    document.documentElement.dataset.hideScrollbars = String(
      localStorage.getItem("veolms-hide-scrollbars") === "true",
    );
    document.documentElement.dataset.elevatedSurfaces = String(
      localStorage.getItem(ELEVATED_SURFACES_KEY) !== "false",
    );
  }, []);

  useEffect(() => {
    document.documentElement.dataset.palette = displayedAcademyTheme;
  }, [displayedAcademyTheme]);

  useEffect(() => {
    persistAcademyTheme(academyTheme);
  }, [academyTheme]);

  useEffect(() => {
    const next = sidebarPreferences || {};
    document.documentElement.dataset.sidebarIconStyle =
      next.iconStyle || "monochrome";
    document.documentElement.dataset.sidebarMonochromeMode =
      next.monochromeMode || "theme";
    document.documentElement.dataset.contentLayout =
      next.contentLayout || "framed";
    document.documentElement.dataset.sidebarHeaderLayout =
      next.headerLayout === "inline" ? "inline" : "fixed";
    document.documentElement.dataset.collapsedTooltips = String(
      next.showCollapsedLabels !== false,
    );
    document.documentElement.dataset.collapsedSidebarLogo = String(
      next.showCollapsedLogo !== false,
    );
    document.documentElement.dataset.activeFill = String(
      next.highlightActive !== false,
    );
    document.documentElement.dataset.sidebarMenuElevation = String(
      next.elevateMenus === true,
    );
    document.documentElement.style.setProperty(
      "--sidebar-monochrome-color",
      next.monochromeColor || "#6c78ff",
    );
    localStorage.setItem("veolms-sidebar-preferences", JSON.stringify(next));
  }, [sidebarPreferences]);

  useEffect(() => {
    document.documentElement.dataset.pageTabColors = pageTabColors;
    localStorage.setItem(PAGE_TAB_COLORS_KEY, pageTabColors);
  }, [pageTabColors]);

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
      if (event.key === COURSE_PLAYER_SESSION_STORAGE_KEY)
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
    setSidebarWidth((currentWidth) => {
      const nextWidth = clampSidebarWidth(currentWidth, sidebarMaxWidth);
      if (nextWidth === currentWidth) return currentWidth;
      localStorage.setItem(
        "veolms-sidebar-width",
        String(Math.round(nextWidth)),
      );
      return nextWidth;
    });
  }, [sidebarMaxWidth]);

  useEffect(() => {
    Object.entries(navigationOrders).forEach(([roleName, order]) => {
      localStorage.setItem(
        `veolms-navigation-order-${roleName}`,
        JSON.stringify(order),
      );
    });
  }, [navigationOrders]);

  useEffect(() => {
    localStorage.setItem("veolms-role", role);
    setCourseMenu(null);
    setEnrollmentFilter("all");
    if (role === "creator" && page === "my-courses") {
      onNavigatePage?.("home");
      setActiveSection("Dashboard");
      return;
    }
    if (page === "home")
      setActiveSection(role === "creator" ? "Dashboard" : "Home");
    else if (page === "my-courses") setActiveSection("My Courses");
    else if (requestedSection) setActiveSection(requestedSection);
    else if (page === "explore-courses")
      setActiveSection(role === "creator" ? "Courses" : "Explore Courses");
    else {
      const storedSection = sessionStorage.getItem("veolms-course-section");
      setActiveSection(
        role === "student" && storedSection === "Courses"
          ? "Explore Courses"
          : storedSection ||
              (role === "creator" ? "Courses" : "Explore Courses"),
      );
      sessionStorage.removeItem("veolms-course-section");
    }
  }, [onNavigatePage, page, requestedSection, role]);

  useEffect(() => {
    localStorage.setItem("veolms-sidebar-mode", sidebarMode);
    localStorage.setItem(
      "veolms-sidebar-collapsed",
      String(sidebarMode === "collapsed"),
    );
    navigationRef.current?.scrollTo({ top: 0 });
    if (sidebarMode !== "hidden") setEdgeSidebarOpen(false);
  }, [sidebarMode]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 820px)");
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
    if (!mobileMenuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setMobilePaletteMenu(false);
    setReadingModeMenu((current) => (current === "mobile" ? null : current));
    setMobileSheetOffset(0);

    const focusTimer = window.setTimeout(() => {
      mobileSheetRef.current?.focus({ preventScroll: true });
    }, 0);

    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !mobileSheetRef.current) return;
      const focusable = [
        ...mobileSheetRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === mobileSheetRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", keepFocusInside);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keepFocusInside);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!compactNavigation) {
      setMobileMenuOpen(false);
      setMobilePaletteMenu(false);
      setReadingModeMenu((current) => (current === "mobile" ? null : current));
    }
  }, [compactNavigation]);

  useEffect(() => {
    if (mobileMenuWasOpenRef.current && !mobileMenuOpen) {
      mobileMoreRef.current?.focus();
    }
    mobileMenuWasOpenRef.current = mobileMenuOpen;
  }, [mobileMenuOpen]);

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
    localStorage.setItem("veolms-wishlist", JSON.stringify([...wishlisted]));
  }, [wishlisted]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest("[data-course-menu]")
      )
        setCourseMenu(null);
      if (
        !(event.target instanceof Node) ||
        !profileRef.current?.contains(event.target)
      ) {
        setProfileMenu(false);
      }
      if (
        !(event.target instanceof Element) ||
        !event.target.closest("[data-palette-menu], [data-palette-trigger]")
      ) {
        setPalettePreviewTheme(null);
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
        setPalettePreviewTheme(null);
        setPaletteMenu(false);
        setReadingModeMenu(null);
        setMobileMenuOpen(false);
        setMobilePaletteMenu(false);
        setMobileSheetOffset(0);
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
  }, [onNavigatePage]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const navigation = getOrderedNavigation(role, navigationOrders[role]).filter(
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
  }, [compactNavigation, navigation, role, sidebarMode]);

  const visibleCourses = useMemo(
    () =>
      getVisibleCourses(courses, {
        activeSection,
        wishlisted,
        role,
        enrollmentFilter,
        category,
        search,
        sort,
      }),
    [activeSection, category, enrollmentFilter, role, search, sort, wishlisted],
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
    setActiveSection(role === "creator" ? "Courses" : "Explore Courses");
    setSearch("");
    setCategory("all");
    setEnrollmentFilter("all");
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    setMobilePaletteMenu(false);
    setReadingModeMenu((current) => (current === "mobile" ? null : current));
    setMobileSheetOffset(0);
    mobileDragConsumedRef.current = false;
  };

  const selectNavigation = (label: string) => {
    closeMobileMenu();
    if (label === "Courses" || label === "Explore Courses") {
      setSearch("");
      setActiveSection(label);
    }
    if (label === "Wishlist") {
      setSearch("");
      setActiveSection("Wishlist");
    }
    onNavigatePage?.(getNavigationDestination(label));
  };

  const reorderNavigation = (
    sourceLabel: string,
    targetLabel: string,
    position: NavigationDropPosition = "before",
  ) => {
    if (!sourceLabel || !targetLabel || sourceLabel === targetLabel) return;
    setNavigationOrders((current) => {
      const currentOrder = current[role] || getInitialNavigationOrder(role);
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
      navigationOrders[role] || getInitialNavigationOrder(role);
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
  ) => {
    if (navigationDragConsumedRef.current) {
      navigationDragConsumedRef.current = false;
      event.preventDefault();
      return;
    }
    selectNavigation(label);
  };

  const navigationUsesCompactInteraction =
    compactNavigation || coarseNavigationInput;
  const sidebarHidden =
    sidebarMode === "hidden" && !navigationUsesCompactInteraction;
  const sidebarCollapsed =
    sidebarMode === "collapsed" ||
    (sidebarMode === "hidden" && navigationUsesCompactInteraction);
  const appearanceControlsHorizontal =
    !sidebarCollapsed ||
    (sidebarResizing &&
      sidebarResizePreviewWidth !== null &&
      sidebarResizePreviewWidth >= SIDEBAR_MIN_WIDTH);

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
    setPalettePreviewTheme(null);
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
    setPalettePreviewTheme(null);
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

  const selectAcademyTheme = (themeId: string) => {
    setAcademyTheme(themeId);
    setPalettePreviewTheme(null);
  };

  const focusPaletteTrigger = (trigger: HTMLButtonElement | null) => {
    window.setTimeout(() => trigger?.focus({ preventScroll: true }), 0);
  };

  const confirmDesktopPaletteTheme = (themeId: string) => {
    selectAcademyTheme(themeId);
    setPaletteMenu(false);
    focusPaletteTrigger(
      paletteMenuSource === "appearance"
        ? appearanceModeTriggerRef.current
        : paletteTriggerRef.current,
    );
  };

  const cancelDesktopPalettePreview = () => {
    setPalettePreviewTheme(null);
    setPaletteMenu(false);
    focusPaletteTrigger(
      paletteMenuSource === "appearance"
        ? appearanceModeTriggerRef.current
        : paletteTriggerRef.current,
    );
  };

  const confirmMobilePaletteTheme = (themeId: string) => {
    selectAcademyTheme(themeId);
    setMobilePaletteMenu(false);
    focusPaletteTrigger(
      paletteMenuSource === "appearance"
        ? mobileAppearanceModeTriggerRef.current
        : mobilePaletteTriggerRef.current,
    );
  };

  const cancelMobilePalettePreview = () => {
    setPalettePreviewTheme(null);
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
    setPalettePreviewTheme(null);
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
  const sidebarResizeStartedExpanded =
    sidebarResizing && sidebarResizeRef.current?.collapsedAtStart === false;
  const sidebarResizeContentVisible =
    sidebarResizing &&
    sidebarResizePreviewWidth !== null &&
    (sidebarResizeStartedExpanded ||
      sidebarResizePreviewWidth >=
        SIDEBAR_COLLAPSED_WIDTH + SIDEBAR_CONTENT_REVEAL_DISTANCE);
  const sidebarClassName = [
    "courses-app",
    sidebarCollapsed ? "courses-app--collapsed" : "",
    sidebarHidden ? "courses-app--hidden" : "",
    sidebarHidden && edgeSidebarOpen ? "courses-app--edge-open" : "",
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
    activeSection,
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
    shortcutGroups: readonly (readonly string[])[] = [],
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
      shortcutGroups: showKeyboardShortcuts ? shortcutGroups : [],
      active,
      top: rect.top + rect.height / 2,
      left: rect.right + 11,
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
    const collapsedAtStart = sidebarCollapsed || sidebarHidden;
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
    if (resize.source === "screen" && resize.modeAtStart === "hidden") {
      setSidebarMode("collapsed");
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
    if (
      compactNavigation ||
      event.pointerType !== "touch" ||
      !event.isPrimary ||
      sidebarResizeRef.current ||
      isSidebarSwipeExcludedTarget(event.target)
    )
      return;

    sidebarResizeRef.current = createSidebarGesture({
      active: false,
      clientX: event.clientX,
      clientY: event.clientY,
      handle: event.currentTarget,
      pointerId: event.pointerId,
      source: "screen",
      timeStamp: event.timeStamp,
    });
  };

  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (compactNavigation || sidebarHidden) return;
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
      source: "rail",
      timeStamp: event.timeStamp,
    });
    setSidebarResizePreviewWidth(sidebarResizeRef.current.previewWidth);
    setSidebarResizing(true);
  };

  const moveSidebarResize = (event: PointerPositionEvent) => {
    const resize = sidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;

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
      const closesExpandedSidebar = !resize.collapsedAtStart && deltaX < 0;
      if (!opensCollapsedSidebar && !closesExpandedSidebar) {
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

    const maximumWidth =
      resize.source === "screen"
        ? resize.expandedWidthAtStart
        : sidebarMaxWidth;
    const previewWidth = Math.min(
      maximumWidth,
      Math.max(SIDEBAR_COLLAPSED_WIDTH, resize.startWidth + deltaX),
    );
    resize.previewWidth = previewWidth;
    setSidebarResizePreviewWidth(previewWidth);
  };

  const endSidebarResize = (event: PointerPositionEvent, cancelled = false) => {
    const resize = sidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    if (resize.active && !cancelled) moveSidebarResize(event);
    sidebarResizeRef.current = null;
    try {
      resize.handle?.releasePointerCapture?.(resize.pointerId);
    } catch {
      // Capture may already have been released when the gesture ends.
    }

    if (!resize.active) return;

    setSidebarResizing(false);
    setSidebarResizePreviewWidth(null);

    if (cancelled) {
      setSidebarWidth(resize.expandedWidthAtStart);
      setSidebarMode(resize.modeAtStart);
      return;
    }

    const totalDistance = event.clientX - resize.startX;
    const finishedAt = event.timeStamp || performance.now();
    const averageVelocity =
      totalDistance / Math.max(1, finishedAt - resize.startedAt);
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
    setSidebarMode((current) =>
      current === "expanded" ? "collapsed" : "expanded",
    );
    setPaletteMenu(false);
    setEdgeSidebarOpen(false);
  };

  const mobileNavigation = navigation.slice(0, 4);
  const mobileMoreActive = !mobileNavigation.some(
    ([label]) => label === activeSection,
  );
  const currentAcademyThemeIndex = academyThemes.findIndex(
    (item) => item.id === academyTheme,
  );

  const startMobileSheetDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    mobileDragRef.current = {
      kind: "pointer",
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      startedAt: performance.now(),
      dragging: false,
      scrollRegion: getClosestScrollRegion(event.target),
    };
  };

  const moveMobileSheetDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = mobileDragRef.current;
    if (drag?.kind !== "pointer" || drag.pointerId !== event.pointerId) return;
    if (drag.scrollRegion && drag.scrollRegion.scrollTop > 0) {
      drag.startY = event.clientY;
      drag.lastY = event.clientY;
      drag.startedAt = performance.now();
      return;
    }
    const distance = event.clientY - drag.startY;
    drag.lastY = event.clientY;
    if (distance <= 0) {
      if (drag.dragging) setMobileSheetOffset(0);
      return;
    }
    if (!drag.dragging && distance < 8) return;
    if (!drag.dragging) {
      drag.dragging = true;
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // Continuing inside the sheet is sufficient when capture is unavailable.
      }
    }
    event.preventDefault();
    setMobileSheetOffset(distance);
  };

  const finishMobileSheetDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = mobileDragRef.current;
    if (drag?.kind !== "pointer" || drag.pointerId !== event.pointerId) return;
    const distance = Math.max(0, drag.lastY - drag.startY);
    const elapsed = Math.max(1, performance.now() - drag.startedAt);
    const velocity = distance / elapsed;
    mobileDragRef.current = null;
    if (drag.dragging) {
      mobileDragConsumedRef.current = true;
      event.preventDefault();
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      } catch {
        // Release can be a no-op when the pointer finishes outside the sheet.
      }
      if (
        event.type !== "pointercancel" &&
        (distance > 72 || velocity > 0.45)
      ) {
        window.setTimeout(closeMobileMenu, 0);
        return;
      }
      window.setTimeout(() => {
        mobileDragConsumedRef.current = false;
      }, 0);
    }
    setMobileSheetOffset(0);
  };

  const startMobileSheetTouch = (event: ReactTouchEvent<HTMLElement>) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0]!;
    mobileDragRef.current = {
      kind: "touch",
      touchId: touch.identifier,
      startY: touch.clientY,
      lastY: touch.clientY,
      startedAt: performance.now(),
      dragging: false,
      scrollRegion: getClosestScrollRegion(event.target),
    };
  };

  const moveMobileSheetTouch = (event: ReactTouchEvent<HTMLElement>) => {
    const drag = mobileDragRef.current;
    if (drag?.kind !== "touch") return;
    const touch = Array.from(event.touches).find(
      (item) => item.identifier === drag.touchId,
    );
    if (!touch) return;
    if (drag.scrollRegion && drag.scrollRegion.scrollTop > 0) {
      drag.startY = touch.clientY;
      drag.lastY = touch.clientY;
      drag.startedAt = performance.now();
      return;
    }
    const distance = touch.clientY - drag.startY;
    drag.lastY = touch.clientY;
    if (distance <= 0) {
      if (drag.dragging) setMobileSheetOffset(0);
      return;
    }
    if (!drag.dragging && distance < 8) return;
    drag.dragging = true;
    event.preventDefault();
    setMobileSheetOffset(distance);
  };

  const finishMobileSheetTouch = (event: ReactTouchEvent<HTMLElement>) => {
    const drag = mobileDragRef.current;
    if (drag?.kind !== "touch") return;
    const touch = Array.from(event.changedTouches).find(
      (item) => item.identifier === drag.touchId,
    );
    if (touch) drag.lastY = touch.clientY;
    const distance = Math.max(0, drag.lastY - drag.startY);
    const elapsed = Math.max(1, performance.now() - drag.startedAt);
    const velocity = distance / elapsed;
    mobileDragRef.current = null;
    if (drag.dragging) {
      mobileDragConsumedRef.current = true;
      if (event.type !== "touchcancel" && (distance > 72 || velocity > 0.45)) {
        window.setTimeout(closeMobileMenu, 0);
        return;
      }
      window.setTimeout(() => {
        mobileDragConsumedRef.current = false;
      }, 0);
    }
    setMobileSheetOffset(0);
  };

  return (
    <div
      className={sidebarClassName}
      onPointerDownCapture={startSidebarScreenSwipe}
      style={
        {
          "--sidebar-expanded-width": `${sidebarResizePreviewWidth ?? sidebarWidth}px`,
          "--sidebar-resize-preview-width": `${sidebarResizePreviewWidth ?? SIDEBAR_COLLAPSED_WIDTH}px`,
        } as CSSProperties
      }
    >
      {sidebarHidden && (
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
        aria-hidden={sidebarHidden && !edgeSidebarOpen ? "true" : undefined}
        inert={sidebarHidden && !edgeSidebarOpen ? true : undefined}
        onPointerEnter={() => sidebarHidden && setEdgeSidebarOpen(true)}
        onPointerLeave={() => sidebarHidden && setEdgeSidebarOpen(false)}
        onFocusCapture={() => sidebarHidden && setEdgeSidebarOpen(true)}
      >
        {!compactNavigation && !sidebarHidden && (
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
            aria-valuemin={SIDEBAR_COLLAPSED_WIDTH}
            aria-valuemax={sidebarMaxWidth}
            aria-valuenow={Math.round(
              sidebarResizePreviewWidth ??
                (sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth),
            )}
            aria-valuetext={
              sidebarCollapsed
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
          />
        )}
        <div className="courses-sidebar__brand">
          <span
            className="courses-logo-clip"
            role="img"
            aria-label="ProCodrr"
            dangerouslySetInnerHTML={{ __html: procodrrLogoSvg }}
          />
          <button
            type="button"
            className="sidebar-collapse"
            aria-label={
              sidebarHidden
                ? "Pin navigation"
                : sidebarCollapsed
                  ? "Expand navigation"
                  : "Collapse navigation"
            }
            aria-pressed={sidebarCollapsed}
            aria-keyshortcuts={`${primaryShortcutModifier}+B`}
            title={
              sidebarHidden
                ? "Pin navigation"
                : showKeyboardShortcuts
                  ? `${sidebarCollapsed ? "Expand" : "Collapse"} navigation (${sidebarShortcutTitle})`
                  : `${sidebarCollapsed ? "Expand" : "Collapse"} navigation`
            }
            onClick={toggleSidebarWidth}
          >
            <span className="sidebar-collapse__asset" aria-hidden="true">
              <SidebarToggleIcon
                direction={sidebarCollapsed || sidebarHidden ? "right" : "left"}
              />
            </span>
          </button>
        </div>

        <nav
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
          {navigation.map(([label, Icon], navigationIndex) => {
            const active = activeSection === label;
            const displayLabel = getNavigationDisplayLabel(label, page);
            const badge = label === "Wishlist" ? wishlisted.size : 0;
            const playerOrigin = getCoursePlayerOriginFromSection(label);
            const hasResumableLesson = Boolean(
              playerOrigin &&
              getRememberedCoursePlayerDestination(playerOrigin),
            );
            const accessibleLabel = [
              displayLabel,
              label === "Wishlist" && wishlisted.size > 0
                ? `${wishlisted.size} saved`
                : null,
              hasResumableLesson ? "lesson in progress" : null,
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <button
                type="button"
                key={label}
                className={[
                  active ? "is-active" : "",
                  draggedNavigationLabel === label ? "is-dragging" : "",
                  navigationDropTarget?.label === label ? "is-drop-target" : "",
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
                aria-label={accessibleLabel}
                aria-current={active ? "page" : undefined}
                aria-keyshortcuts={
                  label === "Settings"
                    ? `${navigationIndex + 1} ${primaryShortcutModifier}+Comma Alt+ArrowUp Alt+ArrowDown`
                    : `${navigationIndex + 1} Alt+ArrowUp Alt+ArrowDown`
                }
                data-navigation-label={label}
                data-sortable="true"
                onClick={(event) => handleNavigationClick(event, label)}
                onContextMenu={(event) => {
                  if (navigationUsesCompactInteraction) event.preventDefault();
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
                  showSidebarTooltip(
                    event,
                    displayLabel,
                    active,
                    label === "Settings"
                      ? [settingsShortcutKeys]
                      : [[String(navigationIndex + 1)]],
                  )
                }
                onMouseLeave={hideCollapsedNavigationTooltip}
                onFocus={(event) =>
                  showSidebarTooltip(
                    event,
                    displayLabel,
                    active,
                    label === "Settings"
                      ? [settingsShortcutKeys]
                      : [[String(navigationIndex + 1)]],
                  )
                }
                onBlur={hideCollapsedNavigationTooltip}
              >
                <Icon size={23} weight={active ? "fill" : "regular"} />
                {hasResumableLesson && <CourseResumeIndicator />}
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
            );
          })}
        </nav>

        <div className="courses-profile" ref={profileRef}>
          {profileMenu && (
            <div className="profile-menu" role="menu">
              <p>Preview workspace as</p>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={role === "student"}
                onClick={() => {
                  setRole("student");
                  setProfileMenu(false);
                }}
              >
                <Student size={18} />
                <span>Student</span>
                {role === "student" && (
                  <Check
                    className="profile-menu__check"
                    size={16}
                    weight="bold"
                  />
                )}
              </button>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={role === "creator"}
                onClick={() => {
                  setRole("creator");
                  setProfileMenu(false);
                }}
              >
                <Users size={18} />
                <span>Creator</span>
                {role === "creator" && (
                  <Check
                    className="profile-menu__check"
                    size={16}
                    weight="bold"
                  />
                )}
              </button>
              {!navigationUsesCompactInteraction && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSidebarMode(sidebarHidden ? "expanded" : "hidden");
                    setProfileMenu(false);
                    setEdgeSidebarOpen(false);
                  }}
                >
                  <SidebarSimple size={18} />
                  <span>
                    {sidebarHidden ? "Keep sidebar visible" : "Hide sidebar"}
                  </span>
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setProfileMenu(false);
                  onNavigatePage?.("Logout");
                }}
              >
                <SignOut size={18} />
                <span>Logout</span>
              </button>
            </div>
          )}
          <button
            type="button"
            className="courses-profile__button"
            aria-label="Open role and appearance menu"
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
          <div
            ref={appearanceControlsRef}
            className={`sidebar-appearance sidebar-appearance--${appearanceControlsHorizontal ? "horizontal" : "vertical"}`}
            role="group"
            aria-label="Appearance controls"
            style={
              {
                "--reading-mode-dock-index": Math.max(0, readingModeDockIndex),
                "--palette-menu-dock-index": Math.max(0, paletteMenuDockIndex),
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
                    title={`${resolvedTheme === "dark" ? "Dark" : "Light"} mode — switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
                    onClick={(event) => {
                      if (consumeAppearanceGestureClick(event)) return;
                      toggleAppearance();
                    }}
                    onContextMenu={openAppearanceThemeMenu}
                    onPointerDown={(event) =>
                      startDockLongPress(event, () =>
                        activateAppearanceOption("theme", false, "appearance"),
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
                        if (paletteMenu) cancelDesktopPalettePreview();
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
                    title={`Reading mode — ${readingModeEnabled ? "on" : "off"}`}
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
              <ReadingModeQuickMenu
                id="desktop-reading-mode-quick-settings"
                className={
                  sidebarCollapsed ? "reading-mode-quick-menu--collapsed" : ""
                }
                preferences={readingModePreferences}
                onChange={updateReadingMode}
              />
            )}
            {paletteMenu && (
              <AcademyPaletteMenu
                themes={academyThemes}
                selectedTheme={displayedAcademyTheme}
                id="desktop-theme-menu"
                className={`sidebar-palette-menu sidebar-palette-menu--dock-attached${sidebarCollapsed ? " sidebar-palette-menu--collapsed" : ""}`}
                onSelect={selectAcademyTheme}
                onPreview={setPalettePreviewTheme}
                onConfirm={confirmDesktopPaletteTheme}
                onCancel={cancelDesktopPalettePreview}
              />
            )}
          </div>
        </div>
      </aside>

      {sidebarTooltip && (
        <div
          className={`sidebar-nav-tooltip${sidebarTooltip.active ? " is-active" : ""}${sidebarTooltip.focusVisible ? " is-focus-visible" : ""}${sidebarTooltip.shortcutGroups.length ? " has-shortcut" : ""}${sidebarTooltip.preferenceControlled ? " is-preference-controlled" : ""}`}
          aria-hidden="true"
          style={
            {
              "--sidebar-tooltip-top": `${sidebarTooltip.top}px`,
              "--sidebar-tooltip-left": `${sidebarTooltip.left}px`,
            } as CSSProperties
          }
        >
          <svg
            className="sidebar-nav-tooltip__pointer"
            viewBox="0 0 9 20"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M9 0C9 3.2 7.8 4.7 5.5 6.2L0.9 9.2C0.3 9.6 0.3 10.4 0.9 10.8L5.5 13.8C7.8 15.3 9 16.8 9 20Z" />
          </svg>
          <span className="sidebar-nav-tooltip__label">
            {sidebarTooltip.label}
          </span>
          {sidebarTooltip.shortcutGroups.length > 0 && (
            <span className="sidebar-nav-tooltip__shortcuts">
              {sidebarTooltip.shortcutGroups.map((keys, index) => (
                <ShortcutKeys keys={keys} key={`${keys.join("-")}-${index}`} />
              ))}
            </span>
          )}
        </div>
      )}

      <main
        className={`courses-main ${renderMain ? "courses-main--learning" : page !== "explore-courses" ? "student-surface-main" : ""}${!renderMain && page === "settings" ? " courses-main--settings" : ""}`}
      >
        {renderMain ? (
          renderMain()
        ) : role === "creator" && page === "home" ? (
          <CreatorDashboard
            onNavigatePage={onNavigatePage}
            setNotice={setNotice}
            academyTheme={academyTheme}
          />
        ) : role === "student" && page === "home" ? (
          <StudentHome
            onOpenCourse={onOpenCourse}
            onNavigatePage={onNavigatePage}
            studentName={shellProfileDisplayName}
          />
        ) : role === "student" && page === "my-courses" ? (
          <MyCoursesPage
            onOpenCourse={onOpenCourse}
            wishlisted={wishlisted}
            onWishlist={toggleWishlist}
            setNotice={setNotice}
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
            onThemeChange={setTheme}
            academyTheme={academyTheme}
            onAcademyThemeChange={setAcademyTheme}
            pageTabColors={pageTabColors}
            onPageTabColorsChange={setPageTabColors}
            sidebarPreferences={sidebarPreferences}
            onSidebarPreferencesChange={setSidebarPreferences}
            sidebarMode={sidebarMode}
            onSidebarModeChange={setSidebarMode}
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
              sessionStorage.removeItem("veolms-course-section");
              setRole("student");
            }}
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
            category={category}
            onCategoryChange={setCategory}
            visibleCourses={visibleCourses}
            onWishlist={toggleWishlist}
            onOpenCourse={onOpenCourse}
            courseMenu={courseMenu}
            setCourseMenu={setCourseMenu}
            setNotice={setNotice}
            onNavigatePage={onNavigatePage}
            onResetCatalogue={resetCatalogue}
          />
        )}
      </main>

      <nav
        ref={mobileBottomNavRef}
        className={`mobile-bottom-nav${mobileBottomNavHidden ? " is-scroll-hidden" : ""}`}
        aria-label={`${role === "creator" ? "Creator" : "Student"} mobile navigation`}
        onFocusCapture={() => setMobileBottomNavHidden(false)}
      >
        {mobileNavigation.map(([label, Icon]) => {
          const active = activeSection === label;
          const displayLabel = getNavigationDisplayLabel(label, page);
          const playerOrigin = getCoursePlayerOriginFromSection(label);
          const hasResumableLesson = Boolean(
            playerOrigin && getRememberedCoursePlayerDestination(playerOrigin),
          );
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
              aria-current={active ? "page" : undefined}
              aria-label={[
                displayLabel,
                label === "Wishlist" && wishlisted.size > 0
                  ? `${wishlisted.size} saved`
                  : null,
                hasResumableLesson ? "lesson in progress" : null,
              ]
                .filter(Boolean)
                .join(", ")}
              onClick={() => selectNavigation(label)}
            >
              <span>
                <Icon size={23} weight={active ? "fill" : "regular"} />
                {hasResumableLesson && <CourseResumeIndicator />}
                {label === "Wishlist" && wishlisted.size > 0 && (
                  <b>{wishlisted.size}</b>
                )}
              </span>
              <small>{displayLabel}</small>
            </button>
          );
        })}
        <button
          ref={mobileMoreRef}
          type="button"
          className={mobileMoreActive ? "is-active" : ""}
          aria-label="More navigation options"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation-sheet"
          onClick={() => {
            setMobilePaletteMenu(false);
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

      {mobileMenuOpen && (
        <div
          className="mobile-menu-layer"
          role="presentation"
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            event.preventDefault();
            event.stopPropagation();
            closeMobileMenu();
          }}
        >
          <section
            ref={mobileSheetRef}
            id="mobile-navigation-sheet"
            className={`mobile-menu-sheet${mobileSheetOffset > 0 ? " is-dragging" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-navigation-title"
            tabIndex={-1}
            style={
              {
                "--mobile-sheet-offset": `${mobileSheetOffset}px`,
              } as CSSProperties
            }
            onPointerDownCapture={(event) => {
              if (
                mobilePaletteMenu &&
                (!(event.target instanceof Element) ||
                  (!event.target.closest("[data-mobile-palette-menu]") &&
                    !event.target.closest("[data-mobile-palette-trigger]")))
              )
                setMobilePaletteMenu(false);
            }}
            onPointerDown={startMobileSheetDrag}
            onPointerMove={moveMobileSheetDrag}
            onPointerUp={finishMobileSheetDrag}
            onPointerCancel={finishMobileSheetDrag}
            onTouchStart={startMobileSheetTouch}
            onTouchMove={moveMobileSheetTouch}
            onTouchEnd={finishMobileSheetTouch}
            onTouchCancel={finishMobileSheetTouch}
            onClickCapture={(event) => {
              if (!mobileDragConsumedRef.current) return;
              event.preventDefault();
              event.stopPropagation();
              mobileDragConsumedRef.current = false;
            }}
          >
            <div className="mobile-menu-sheet__drag-zone">
              <span aria-hidden="true" />
            </div>
            <div className="mobile-menu-sheet__heading">
              <div>
                <h2 id="mobile-navigation-title">More</h2>
                <p>All academy navigation</p>
              </div>
            </div>
            <div className="mobile-menu-sheet__profile">
              <ShellProfileAvatar
                avatarUrl={shellProfileAvatarUrl}
                displayName={shellProfileDisplayName}
              />
              <span>
                <strong>{shellProfileDisplayName}</strong>
                <small>{role === "creator" ? "Instructor" : "Student"}</small>
              </span>
            </div>
            <nav
              className="mobile-menu-sheet__list"
              aria-label="All navigation options"
            >
              {navigation.map(([label, Icon]) => {
                const active = activeSection === label;
                const displayLabel = getNavigationDisplayLabel(label, page);
                const playerOrigin = getCoursePlayerOriginFromSection(label);
                const hasResumableLesson = Boolean(
                  playerOrigin &&
                  getRememberedCoursePlayerDestination(playerOrigin),
                );
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
                      hasResumableLesson ? "lesson in progress" : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                    data-navigation-label={label}
                    data-sortable="true"
                    onClick={(event) => handleNavigationClick(event, label)}
                    onContextMenu={(event) => event.preventDefault()}
                    onPointerDown={(event) =>
                      startNavigationPointerDrag(event, label)
                    }
                    onPointerMove={moveNavigationPointerDrag}
                    onPointerUp={finishNavigationPointerDrag}
                    onPointerCancel={(event) =>
                      finishNavigationPointerDrag(event, true)
                    }
                    onTouchStart={(event) => event.stopPropagation()}
                    onTouchMove={(event) => event.stopPropagation()}
                    onTouchEnd={(event) => event.stopPropagation()}
                    onTouchCancel={(event) => event.stopPropagation()}
                  >
                    <Icon size={23} weight={active ? "fill" : "regular"} />
                    {hasResumableLesson && <CourseResumeIndicator />}
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
                      title={`${resolvedTheme === "dark" ? "Dark" : "Light"} mode — switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
                      onClick={(event) => {
                        if (consumeAppearanceGestureClick(event)) return;
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
                      title={`Choose color theme — ${academyThemes[currentAcademyThemeIndex]?.name}`}
                      onClick={(event) => {
                        if (consumeAppearanceGestureClick(event)) return;
                        setReadingModeMenu(null);
                        setPaletteMenuSource("theme");
                        if (mobilePaletteMenu) cancelMobilePalettePreview();
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
                      title={`Reading mode — ${readingModeEnabled ? "on" : "off"}`}
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
            </div>
            {mobilePaletteMenu && (
              <AcademyPaletteMenu
                themes={academyThemes}
                selectedTheme={displayedAcademyTheme}
                id="mobile-theme-menu"
                className="sidebar-palette-menu mobile-palette-menu"
                mobile
                onSelect={selectAcademyTheme}
                onPreview={setPalettePreviewTheme}
                onConfirm={confirmMobilePaletteTheme}
                onCancel={cancelMobilePalettePreview}
              />
            )}
          </section>
          {readingModeMenu === "mobile" && (
            <ReadingModeQuickMenu
              id="mobile-reading-mode-quick-settings"
              className="reading-mode-quick-menu--mobile"
              preferences={readingModePreferences}
              onChange={updateReadingMode}
            />
          )}
        </div>
      )}

      {notice && (
        <div className="courses-toast" role="status">
          <Question size={18} /> {notice}
        </div>
      )}
    </div>
  );
}
