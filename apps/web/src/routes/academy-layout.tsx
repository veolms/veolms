import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import {
  Outlet,
  useLocation,
  useMatches,
  useNavigate,
  useParams,
} from "react-router";
import { CoursesPage } from "../CoursesPage";
import type { Course, CourseOpenOptions } from "../courses/catalogue";
import { authStore, useAuthStore } from "../store/auth.store";
import { clearStoredProfilePreferences } from "../settings/profilePreferences";
import type { LearningCourse } from "../StudentPages";
import { getCoursePlayerLaunchPath } from "../learning/coursePlayerNavigation";
import type { LearningMiniPlayerSession } from "../learning/player/learningMiniPlayerTypes";
import {
  closeLearningMiniPlayerSession,
  getLearningMiniPlayerServerSnapshot,
  getLearningMiniPlayerSnapshot,
  openLearningMiniPlayerSession,
  subscribeToLearningMiniPlayer,
} from "../learning/player/learningMiniPlayerStore";
import type { NavigateTo } from "../routing/navigation";
import { AcademyRouteGuard } from "../routing/RouteGuards";
import {
  isCoursesPublicPath,
  isLearningPath,
  isPublicAcademyPath,
} from "../routing/routeAccess";
import {
  getDefaultNavigationOrder,
  getDefaultNavigationVisibility,
  getInitialNavigationOrder,
  getInitialNavigationVisibility,
  getVisibleOrderedNavigation,
  getNavigationDestination,
  resolveShellNavigation,
} from "../shell/navigation";
import {
  readApplicationScrollPosition,
  scrollApplicationTo,
} from "../shell/applicationScroll";
import { getInitialSidebarPreferences } from "../shell/sidebarPreferences";
import { normalizeSidebarDockItems } from "../settings/settingsPreferences";
import {
  getNumberShortcutIndex,
  isEditingShortcutTarget,
} from "../keyboardShortcuts";
import {
  getDestinationPath,
  getMatchedRouteDescriptor,
  normalizeNavigationPath,
} from "../routing/routeDescriptors";

const LazyLearningMiniPlayer = lazy(() =>
  import("../learning/player/LearningMiniPlayer").then((module) => ({
    default: module.LearningMiniPlayer,
  })),
);

export interface AcademyOutletContext {
  mobileBottomNavigation: boolean;
  mobileBottomNavigationHidden: boolean;
  navigateTo: NavigateTo;
  openLearningMiniPlayer: (session: LearningMiniPlayerSession) => void;
}

const isSettingsPath = (path: string) => {
  const pathname = normalizeNavigationPath(path.split(/[?#]/, 1)[0] || "/");
  return pathname === "/settings" || pathname.startsWith("/settings/");
};

function LearningMiniPlayerFallback({
  lessonTitle,
}: Pick<LearningMiniPlayerSession, "lessonTitle">) {
  return (
    <aside
      role="status"
      aria-busy="true"
      aria-label={`Loading mini player for ${lessonTitle}`}
      className="fixed right-3 z-150 aspect-video w-[min(82vw,22rem)] overflow-hidden rounded-xl border border-white/14 bg-black shadow-[0_18px_48px_rgba(0,0,0,0.52)] sm:hidden"
      style={{ bottom: "calc(5.25rem + env(safe-area-inset-bottom))" }}
    >
      <span className="sr-only">Loading mini player…</span>
    </aside>
  );
}

const decorateCoursePlayerLaunch = (
  destinationPath: string,
  sourcePath: string,
) => {
  const sourcePathname = normalizeNavigationPath(
    sourcePath.split(/[?#]/, 1)[0] || "/",
  );
  if (sourcePathname.startsWith("/learn/")) return destinationPath;

  try {
    const localOrigin = "https://procodrr.local";
    const destinationUrl = new URL(destinationPath, localOrigin);
    const pathParts = destinationUrl.pathname.split("/").filter(Boolean);
    if (
      destinationUrl.origin !== localOrigin ||
      pathParts[0] !== "learn" ||
      pathParts.length < 2 ||
      pathParts.length > 3
    )
      return destinationPath;
    if (
      destinationUrl.searchParams.has("from") ||
      destinationUrl.searchParams.has("returnTo")
    )
      return destinationPath;

    const courseId = decodeURIComponent(pathParts[1]!);
    const lessonIdentifier = pathParts[2]
      ? decodeURIComponent(pathParts[2])
      : undefined;
    return getCoursePlayerLaunchPath(courseId, sourcePath, lessonIdentifier);
  } catch {
    return destinationPath;
  }
};

export default function AcademyLayout() {
  const matches = useMatches();
  const location = useLocation();
  const navigate = useNavigate();
  const { courseSlug } = useParams();
  const preservedScrollPositionRef = useRef<{
    left: number;
    top: number;
  } | null>(null);
  const locationPathRef = useRef(
    `${location.pathname}${location.search}${location.hash}`,
  );
  const settingsReturnLocationRef = useRef({
    path: "/",
    left: 0,
    top: 0,
  });
  const numberNavigationTimerRef = useRef<number | null>(null);
  const learningMiniPlayer = useSyncExternalStore(
    subscribeToLearningMiniPlayer,
    getLearningMiniPlayerSnapshot,
    getLearningMiniPlayerServerSnapshot,
  );
  const currentLocationPath = `${location.pathname}${location.search}${location.hash}`;
  const route = getMatchedRouteDescriptor(matches, location.pathname);
  const publicLearningRoute =
    isPublicAcademyPath(location.pathname) &&
    isLearningPath(location.pathname) &&
    !isCoursesPublicPath(location.pathname);
  const currentUserQueryEnabled = !publicLearningRoute;
  const storeUser = useAuthStore((state) => state.user);
  const activeUser = storeUser;
  const { items: navigationItems, isDefault: isPublicNavigation } = useMemo(
    () => resolveShellNavigation(activeUser?.menus),
    [activeUser?.menus],
  );

  useLayoutEffect(() => {
    locationPathRef.current = currentLocationPath;
    if (!isSettingsPath(currentLocationPath)) {
      settingsReturnLocationRef.current.path = currentLocationPath;
    }
  }, [currentLocationPath]);

  useEffect(() => {
    const pathname = normalizeNavigationPath(location.pathname);
    if (pathname === "/logout") {
      let active = true;
      void import("../services/auth/auth.service")
        .then(({ authService }) => authService.logout())
        .catch(() => undefined)
        .finally(() => {
          if (!active) return;
          authStore.clearAuth();
          clearStoredProfilePreferences();
          window.location.href = "/";
        });
      return () => {
        active = false;
      };
    }
    const destination =
      pathname === "/my-learning" ||
      pathname === "/my-courses" ||
      pathname === "/explore-courses"
        ? "/courses"
        : null;
    if (destination)
      void navigate(`${destination}${location.search}`, { replace: true });
    return undefined;
  }, [location.pathname, location.search, navigate]);

  useLayoutEffect(() => {
    const position = preservedScrollPositionRef.current;
    if (!position) return undefined;
    preservedScrollPositionRef.current = null;

    scrollApplicationTo({ ...position, behavior: "auto" });
    const frame = window.requestAnimationFrame(() => {
      scrollApplicationTo({ ...position, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);

  const navigateTo: NavigateTo = useCallback(
    (destination, options) => {
      const destinationPath = options?.exact
        ? destination
        : getDestinationPath(destination);
      const activeLocationPath = locationPathRef.current;
      const path = decorateCoursePlayerLaunch(
        destinationPath,
        activeLocationPath,
      );
      if (isSettingsPath(path) && !isSettingsPath(locationPathRef.current)) {
        const currentScrollPosition = readApplicationScrollPosition();
        settingsReturnLocationRef.current = {
          path: locationPathRef.current,
          ...currentScrollPosition,
        };
      }
      if (
        normalizeNavigationPath(path) !==
        normalizeNavigationPath(locationPathRef.current)
      ) {
        if (options?.preserveScroll) {
          preservedScrollPositionRef.current = readApplicationScrollPosition();
        }
        // Update synchronously so a second shortcut pressed before React's
        // route render still compares against the destination just requested.
        locationPathRef.current = path;
        void navigate(path, {
          preventScrollReset: options?.preserveScroll,
        });
      }
      if (!options?.preserveScroll) {
        scrollApplicationTo({ top: 0, behavior: "auto" });
      }
    },
    [navigate],
  );
  const navigateToRef = useRef(navigateTo);
  useLayoutEffect(() => {
    navigateToRef.current = navigateTo;
  }, [navigateTo]);
  const exitSettings = useCallback(() => {
    const destination = settingsReturnLocationRef.current;
    preservedScrollPositionRef.current = {
      left: destination.left,
      top: destination.top,
    };
    locationPathRef.current = destination.path;
    void navigate(destination.path, { preventScrollReset: true });
  }, [navigate]);

  useEffect(() => {
    const navigateByNumber = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        isEditingShortcutTarget(event.target)
      )
        return;
      const index = getNumberShortcutIndex(event);
      if (index === null) return;

      const navigationRole = localStorage.getItem("veolms-role") || "student";
      const orderedNavigation = getVisibleOrderedNavigation(
        isPublicNavigation
          ? getDefaultNavigationOrder(navigationItems)
          : getInitialNavigationOrder(navigationRole, navigationItems),
        isPublicNavigation
          ? getDefaultNavigationVisibility(navigationItems)
          : getInitialNavigationVisibility(navigationRole, navigationItems),
        navigationItems,
      ).filter(
        ([label]) =>
          label !== "Settings" ||
          !normalizeSidebarDockItems(
            getInitialSidebarPreferences().dockItems,
          ).includes("settings"),
      );
      const destination = orderedNavigation[index];
      if (!destination) return;

      event.preventDefault();
      if (numberNavigationTimerRef.current !== null) {
        window.clearTimeout(numberNavigationTimerRef.current);
      }
      numberNavigationTimerRef.current = window.setTimeout(() => {
        navigateToRef.current(getNavigationDestination(destination));
        numberNavigationTimerRef.current = null;
      }, 60);
    };

    window.addEventListener("keydown", navigateByNumber, true);
    return () => {
      window.removeEventListener("keydown", navigateByNumber, true);
      if (numberNavigationTimerRef.current !== null) {
        window.clearTimeout(numberNavigationTimerRef.current);
      }
    };
  }, [activeUser, isPublicNavigation, navigationItems]);

  const openCourse = useCallback(
    (course: Course | LearningCourse, options?: CourseOpenOptions) => {
      navigateTo(
        `/learn/${encodeURIComponent(course.id)}${options?.preview ? "/1" : ""}`,
      );
    },
    [navigateTo],
  );

  const openLearningMiniPlayer = useCallback(
    (session: LearningMiniPlayerSession) =>
      openLearningMiniPlayerSession(session),
    [],
  );

  const closeLearningMiniPlayer = useCallback(() => {
    closeLearningMiniPlayerSession();
  }, []);

  const restoreLearningMiniPlayer = useCallback(() => {
    if (!learningMiniPlayer) return;
    const lessonPath = learningMiniPlayer.lessonPath;
    closeLearningMiniPlayer();
    navigateTo(lessonPath, { exact: true });
  }, [closeLearningMiniPlayer, learningMiniPlayer, navigateTo]);

  return (
    <AcademyRouteGuard>
      <CoursesPage
        page={route.page}
        section={route.section}
        settingsTab={route.settingsTab}
        discussionTab={route.discussionTab}
        courseSlug={courseSlug}
        currentUserQueryEnabled={currentUserQueryEnabled}
        onNavigatePage={navigateTo}
        onExitSettings={exitSettings}
        onOpenCourse={openCourse}
        renderMain={
          route.kind === "learning"
            ? ({ mobileBottomNavigation, mobileBottomNavigationHidden }) => (
                <Outlet
                  context={
                    {
                      mobileBottomNavigation,
                      mobileBottomNavigationHidden,
                      navigateTo,
                      openLearningMiniPlayer,
                    } satisfies AcademyOutletContext
                  }
                />
              )
            : null
        }
      />
      {learningMiniPlayer ? (
        <Suspense
          fallback={
            <LearningMiniPlayerFallback
              lessonTitle={learningMiniPlayer.lessonTitle}
            />
          }
        >
          <LazyLearningMiniPlayer
            session={learningMiniPlayer}
            onClose={closeLearningMiniPlayer}
            onRestore={restoreLearningMiniPlayer}
          />
        </Suspense>
      ) : null}
    </AcademyRouteGuard>
  );
}
