import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
import {
  getCourseRouteKey,
  type Course,
  type CourseOpenOptions,
} from "../courses/catalogue";
import { useCurrentUser, useLogout } from "../services/auth";
import { useAuthStore } from "../store/auth.store";
import { clearStoredProfilePreferences } from "../settings/profilePreferences";
import type { LearningCourse } from "../StudentPages";
import {
  getCoursePlayerLaunchPath,
  getCoursePlayerReturnPath,
  getCoursePlayerSession,
} from "../learning/coursePlayerNavigation";
import { LearningMiniPlayer } from "../learning/player/LearningMiniPlayer";
import {
  PersistentLearningPlayerHost,
  type LearningPlayerPresentation,
  type LessonPlayerMinimizeGestureState,
  type PersistentLearningPlayerRegistration,
  type RegisterPersistentLearningPlayer,
} from "../learning/player";
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

export interface AcademyOutletContext {
  mobileBottomNavigation: boolean;
  mobileBottomNavigationHidden: boolean;
  navigateTo: NavigateTo;
  onLearningPlayerMinimizeGestureChange: (
    state: LessonPlayerMinimizeGestureState,
  ) => void;
  onMiniPlayerRestoreReady: () => void;
  openLearningMiniPlayer: (session: LearningMiniPlayerSession) => void;
  registerPersistentPlayer: RegisterPersistentLearningPlayer;
}

interface LearningBackgroundSurface {
  courseSlug?: string;
  discussionTab?: string;
  page: string;
  section?: string;
  settingsTab?: string;
}

const resolveLearningBackgroundSurface = (
  returnPath: string,
): LearningBackgroundSurface => {
  try {
    const url = new URL(returnPath, "https://procodrr.local");
    const pathname = normalizeNavigationPath(url.pathname);
    const overviewMatch = /^\/courses\/([^/]+)\/overview$/.exec(pathname);
    if (overviewMatch?.[1]) {
      return {
        courseSlug: decodeURIComponent(overviewMatch[1]),
        page: "course-overview",
        section: "Courses",
      };
    }
    if (pathname === "/" || pathname === "/home") return { page: "home" };
    if (pathname === "/wishlist") {
      return { page: "courses", section: "Wishlist" };
    }
    if (pathname === "/settings" || pathname.startsWith("/settings/")) {
      return {
        page: "settings",
        section: "Settings",
        settingsTab: pathname.split("/").filter(Boolean)[1] ?? "profile",
      };
    }
    if (pathname.startsWith("/discussions")) {
      return {
        discussionTab: pathname.split("/").filter(Boolean)[1] ?? "q-and-a",
        page: "workspace",
        section: "Discussions",
      };
    }
  } catch {
    // Fall back to the catalogue for an invalid or retired return path.
  }
  return { page: "courses", section: "Courses" };
};

const isSettingsPath = (path: string) => {
  const pathname = normalizeNavigationPath(path.split(/[?#]/, 1)[0] || "/");
  return pathname === "/settings" || pathname.startsWith("/settings/");
};

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
  const [learningBackgroundMounted, setLearningBackgroundMounted] =
    useState(false);
  const [persistentPlayer, setPersistentPlayer] =
    useState<PersistentLearningPlayerRegistration | null>(null);
  const [playerPresentation, setPlayerPresentation] =
    useState<LearningPlayerPresentation>("full");
  const persistentPlayerRef =
    useRef<PersistentLearningPlayerRegistration | null>(null);
  const playerPresentationRef = useRef<LearningPlayerPresentation>("full");
  const persistentRegistrationTokenRef = useRef<symbol | null>(null);
  const learningBackgroundMountedRef = useRef(false);
  const currentLocationPath = `${location.pathname}${location.search}${location.hash}`;
  const route = getMatchedRouteDescriptor(matches, location.pathname);
  const { data: authUser } = useCurrentUser();
  const storeUser = useAuthStore((state) => state.user);
  const activeUser = authUser || storeUser;
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

  const logoutMutation = useLogout();

  useEffect(() => {
    const pathname = normalizeNavigationPath(location.pathname);
    if (pathname === "/logout") {
      void logoutMutation.mutateAsync().finally(() => {
        clearStoredProfilePreferences();
        window.location.href = "/";
      });
      return;
    }
    const destination =
      pathname === "/my-learning" ||
      pathname === "/my-courses" ||
      pathname === "/explore-courses"
        ? "/courses"
        : null;
    if (destination)
      void navigate(`${destination}${location.search}`, { replace: true });
  }, [location.pathname, location.search, navigate, logoutMutation]);

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
      const courseRouteKey = getCourseRouteKey(course);
      const activePlayer = persistentPlayerRef.current;
      if (activePlayer?.courseRouteKey === courseRouteKey) {
        navigateTo(activePlayer.lessonPath, { exact: true });
        return;
      }
      navigateTo(
        `/learn/${encodeURIComponent(courseRouteKey)}${options?.preview ? "/1" : ""}`,
      );
    },
    [navigateTo],
  );

  const registerPersistentPlayer =
    useCallback<RegisterPersistentLearningPlayer>((registration) => {
      const token = Symbol("persistent-learning-player-registration");
      persistentRegistrationTokenRef.current = token;
      persistentPlayerRef.current = registration;
      setPersistentPlayer(registration);
      playerPresentationRef.current = "full";
      setPlayerPresentation("full");
      if (getLearningMiniPlayerSnapshot()) {
        closeLearningMiniPlayerSession();
      }

      return () => {
        queueMicrotask(() => {
          if (persistentRegistrationTokenRef.current !== token) return;
          const current = persistentPlayerRef.current;
          if (!current) return;
          const detachedPlayer = { ...current, anchor: null };
          persistentPlayerRef.current = detachedPlayer;
          setPersistentPlayer(detachedPlayer);
          if (playerPresentationRef.current === "full") {
            playerPresentationRef.current = "mini";
            setPlayerPresentation("mini");
          }
        });
      };
    }, []);

  const openLearningMiniPlayer = useCallback(
    (session: LearningMiniPlayerSession) => {
      playerPresentationRef.current = "mini";
      setPlayerPresentation("mini");
      openLearningMiniPlayerSession(session);
      navigateTo(session.returnPath, { exact: true });
    },
    [navigateTo],
  );

  const closeLearningMiniPlayer = useCallback(() => {
    persistentRegistrationTokenRef.current = null;
    persistentPlayerRef.current = null;
    setPersistentPlayer(null);
    closeLearningMiniPlayerSession();
  }, []);

  const handleLearningPlayerMinimizeGestureChange = useCallback(
    (state: LessonPlayerMinimizeGestureState) => {
      const revealProgress = Math.min(
        1,
        Math.max(0, (state.progress - 0.2) / 0.3),
      );
      const settling =
        state.phase === "settling-back" || state.phase === "settling-mini";
      document.documentElement.style.setProperty(
        "--learning-background-reveal-duration",
        settling ? "200ms" : "0ms",
      );
      document.documentElement.style.setProperty(
        "--learning-background-reveal",
        String(revealProgress),
      );

      if (state.progress >= 0.2 && !learningBackgroundMountedRef.current) {
        learningBackgroundMountedRef.current = true;
        setLearningBackgroundMounted(true);
      }

      if (state.phase === "idle" && learningBackgroundMountedRef.current) {
        learningBackgroundMountedRef.current = false;
        setLearningBackgroundMounted(false);
      }
    },
    [],
  );

  useEffect(
    () => () => {
      document.documentElement.style.removeProperty(
        "--learning-background-reveal",
      );
      document.documentElement.style.removeProperty(
        "--learning-background-reveal-duration",
      );
    },
    [],
  );

  const restoreLearningMiniPlayer = useCallback(() => {
    const lessonPath =
      persistentPlayerRef.current?.lessonPath ?? learningMiniPlayer?.lessonPath;
    if (!lessonPath) return;
    if (persistentPlayerRef.current) {
      playerPresentationRef.current = "full";
      setPlayerPresentation("full");
    }
    navigateTo(lessonPath, { exact: true });
  }, [learningMiniPlayer, navigateTo]);

  const activeLearningReturnPath =
    route.kind === "learning"
      ? (courseSlug && getCoursePlayerSession(courseSlug)?.returnPath) ||
        getCoursePlayerReturnPath(location.search)
      : null;
  const learningBackground =
    route.kind === "learning" &&
    learningBackgroundMounted &&
    activeLearningReturnPath
      ? {
          ...resolveLearningBackgroundSurface(activeLearningReturnPath),
        }
      : null;

  return (
    <AcademyRouteGuard>
      <CoursesPage
        page={route.page}
        section={route.section}
        settingsTab={route.settingsTab}
        discussionTab={route.discussionTab}
        courseSlug={courseSlug}
        learningBackground={learningBackground}
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
                      onLearningPlayerMinimizeGestureChange:
                        handleLearningPlayerMinimizeGestureChange,
                      onMiniPlayerRestoreReady: closeLearningMiniPlayer,
                      openLearningMiniPlayer,
                      registerPersistentPlayer,
                    } satisfies AcademyOutletContext
                  }
                />
              )
            : null
        }
      />
      {persistentPlayer ? (
        <PersistentLearningPlayerHost
          player={persistentPlayer}
          presentation={playerPresentation}
          onClose={closeLearningMiniPlayer}
          onRestore={restoreLearningMiniPlayer}
        />
      ) : learningMiniPlayer ? (
        <LearningMiniPlayer
          session={learningMiniPlayer}
          onClose={closeLearningMiniPlayer}
          onRestore={restoreLearningMiniPlayer}
        />
      ) : null}
    </AcademyRouteGuard>
  );
}
