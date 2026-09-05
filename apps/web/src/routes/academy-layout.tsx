import {
  startTransition,
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
import { useCurrentUser, useSignOut } from "../services/auth";
import { useAuthStore } from "../store/auth.store";
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
import {
  easeLearningPlayerMotionProgress,
  getLearningBackgroundMotionState,
  isDesktopLearningMinimizeViewport,
  LEARNING_BACKGROUND_REVEAL_END_VIEWPORT_PROGRESS,
  LEARNING_PLAYER_MOTION_DURATION_MS,
} from "../learning/player/learningPlayerMotion";
import {
  shouldDemoteDetachedPersistentPlayer,
  shouldRestoreMiniPlayerForMatchingCourse,
} from "../learning/player/persistentPlayerRegistration";
import {
  applyPersistentMiniPlayerLessonChange,
  resolveLearningMiniPlayerLessonPath,
  resolveMiniPlayerCourseId,
} from "../learning/player/persistentMiniPlayerLesson";
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
import { buildLoginPath } from "../routing/routeAccess";
import {
  getDefaultNavigationOrder,
  getDefaultNavigationVisibility,
  getInitialNavigationOrder,
  getInitialNavigationVisibility,
  getVisibleOrderedNavigation,
  getNavigationDestination,
  resolveShellNavigation,
  type NavigationItemWithMetadata,
} from "../shell/navigation";
import { getWorkspaceRoleStorageKey } from "../shell/workspaceRole";
import {
  readApplicationScrollPosition,
  scrollApplicationTo,
  type ApplicationScrollPosition,
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
  persistentPlayerMounted: boolean;
  registerPersistentPlayer: RegisterPersistentLearningPlayer;
}

interface LearningBackgroundSurface {
  courseSlug?: string;
  discussionTab?: string;
  page: string;
  section?: string;
  settingsTab?: string;
}

const clearLearningPlayerMotionProperties = (element: HTMLElement) => {
  element.style.removeProperty("--learning-background-reveal");
  element.style.removeProperty("--learning-background-reveal-duration");
  element.style.removeProperty("--learning-player-content-motion-duration");
  element.style.removeProperty("--learning-player-content-opacity");
  element.style.removeProperty("--learning-player-content-offset-y");
  delete element.dataset.learningPlayerMotion;
  delete element.dataset.learningPlayerRestoring;
};

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

const isLearningRoutePath = (path: string) =>
  normalizeNavigationPath(path.split(/[?#]/, 1)[0] || "/").startsWith(
    "/learn/",
  );

const getLearningCourseRouteKey = (path: string) => {
  const pathname = normalizeNavigationPath(path.split(/[?#]/, 1)[0] || "/");
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "learn" || !parts[1]) return null;
  try {
    return decodeURIComponent(parts[1]);
  } catch {
    return parts[1];
  }
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
  const applicationScrollPositionsRef = useRef(
    new Map<string, ApplicationScrollPosition>(),
  );
  const pendingScrollPositionRef = useRef<{
    destinationPath: string;
    sourcePath: string;
    position: ApplicationScrollPosition;
  } | null>(null);
  const locationPathRef = useRef(
    `${location.pathname}${location.search}${location.hash}`,
  );
  const renderedLocationPathRef = useRef(locationPathRef.current);
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
  const selectPersistentMiniPlayerLessonRef = useRef<
    (lessonNumber: number) => void
  >(() => {});
  const playerPresentationRef = useRef<LearningPlayerPresentation>("full");
  const persistentRegistrationTokenRef = useRef<symbol | null>(null);
  const playerRestoreVersionRef = useRef(0);
  const learningBackgroundMountedRef = useRef(false);
  const learningMotionStageRef = useRef<HTMLDivElement>(null);
  const learningMotionFadeStartViewportProgressRef = useRef<number | null>(
    null,
  );
  const learningMotionOffsetYRef = useRef(0);
  const learningMotionViewportHeightRef = useRef(0);
  const surfaceMotionFrameRef = useRef<number | null>(null);
  const surfaceMotionTimerRef = useRef<number | null>(null);
  const surfaceMotionVersionRef = useRef(0);
  const restoringPlayerRef = useRef(false);
  const restoreLearningMiniPlayerRef = useRef<() => void>(() => {});
  const currentLocationPath = `${location.pathname}${location.search}${location.hash}`;
  const route = getMatchedRouteDescriptor(matches, location.pathname);
  const {
    data: authUser,
    isError: authUserError,
    isFetched: authUserFetched,
  } = useCurrentUser();
  const storeUser = useAuthStore((state) => state.user);
  const activeUser = authUserFetched && !authUserError ? authUser : storeUser;
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

  const { signOut } = useSignOut();

  useEffect(() => {
    const pathname = normalizeNavigationPath(location.pathname);
    if (pathname === "/logout") {
      signOut();
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
  }, [location.pathname, location.search, navigate, signOut]);

  useLayoutEffect(() => {
    const previousPath = renderedLocationPathRef.current;
    const pending = pendingScrollPositionRef.current;
    if (previousPath === currentLocationPath && !pending) return;

    if (previousPath !== currentLocationPath) {
      if (pending?.sourcePath !== previousPath) {
        applicationScrollPositionsRef.current.set(
          previousPath,
          readApplicationScrollPosition(),
        );
      }
      renderedLocationPathRef.current = currentLocationPath;
    }

    const position =
      pending?.destinationPath === currentLocationPath
        ? pending.position
        : (applicationScrollPositionsRef.current.get(currentLocationPath) ?? {
            left: 0,
            top: 0,
          });
    pendingScrollPositionRef.current = null;
    const restorePosition = () =>
      scrollApplicationTo({ ...position, behavior: "auto" });
    restorePosition();
    const frame = window.requestAnimationFrame(restorePosition);
    return () => window.cancelAnimationFrame(frame);
  }, [currentLocationPath]);

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

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
      if (
        !restoringPlayerRef.current &&
        shouldRestoreMiniPlayerForMatchingCourse({
          presentation: playerPresentationRef.current,
          activeCourseRouteKey: persistentPlayerRef.current?.courseRouteKey,
          requestedCourseRouteKey: getLearningCourseRouteKey(path),
        })
      ) {
        restoreLearningMiniPlayerRef.current();
        return;
      }
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
        const sourcePath = locationPathRef.current;
        const sourcePosition = readApplicationScrollPosition();
        applicationScrollPositionsRef.current.set(sourcePath, sourcePosition);
        pendingScrollPositionRef.current = {
          destinationPath: path,
          sourcePath,
          position: options?.preserveScroll
            ? sourcePosition
            : (applicationScrollPositionsRef.current.get(path) ?? {
                left: 0,
                top: 0,
              }),
        };
        // Update synchronously so a second shortcut pressed before React's
        // route render still compares against the destination just requested.
        locationPathRef.current = path;
        void navigate(path, {
          preventScrollReset: true,
        });
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
    const sourcePath = locationPathRef.current;
    applicationScrollPositionsRef.current.set(
      sourcePath,
      readApplicationScrollPosition(),
    );
    pendingScrollPositionRef.current = {
      destinationPath: destination.path,
      sourcePath,
      position: {
        left: destination.left,
        top: destination.top,
      },
    };
    locationPathRef.current = destination.path;
    void navigate(destination.path, { preventScrollReset: true });
  }, [navigate]);

  useEffect(() => {
    const navigateByNumber = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditingShortcutTarget(event.target))
        return;

      const cycleDirection =
        event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (event.key === "ArrowUp" || event.key === "ArrowDown")
          ? event.key === "ArrowDown"
            ? 1
            : -1
          : null;
      const numberIndex =
        cycleDirection === null && !event.altKey
          ? getNumberShortcutIndex(event)
          : null;
      if (cycleDirection === null && numberIndex === null) return;

      const navigationRole =
        localStorage.getItem(getWorkspaceRoleStorageKey(activeUser?.id)) ||
        "student";
      const orderedNavigation = getVisibleOrderedNavigation(
        isPublicNavigation
          ? getDefaultNavigationOrder(navigationItems)
          : getInitialNavigationOrder(
              navigationRole,
              navigationItems,
              activeUser?.id,
            ),
        isPublicNavigation
          ? getDefaultNavigationVisibility(navigationItems)
          : getInitialNavigationVisibility(
              navigationRole,
              navigationItems,
              activeUser?.id,
            ),
        navigationItems,
      ).filter(
        ([label]) =>
          label !== "Settings" ||
          !normalizeSidebarDockItems(
            getInitialSidebarPreferences().dockItems,
          ).includes("settings"),
      );

      let destination: NavigationItemWithMetadata | undefined;
      if (cycleDirection !== null) {
        const cycleNavigation = orderedNavigation.filter(
          ([label]) => label !== "Logout",
        );
        if (cycleNavigation.length === 0) return;

        const currentPath = normalizeNavigationPath(
          locationPathRef.current.split(/[?#]/)[0] || "/",
        );
        let currentIndex = -1;
        let currentMatchLength = -1;
        cycleNavigation.forEach((item, index) => {
          const destinationPath = normalizeNavigationPath(
            getDestinationPath(getNavigationDestination(item)).split(
              /[?#]/,
            )[0] || "/",
          );
          const matches =
            destinationPath === "/"
              ? currentPath === "/"
              : currentPath === destinationPath ||
                currentPath.startsWith(`${destinationPath}/`);
          if (matches && destinationPath.length > currentMatchLength) {
            currentIndex = index;
            currentMatchLength = destinationPath.length;
          }
        });
        const nextIndex =
          currentIndex < 0
            ? cycleDirection > 0
              ? 0
              : cycleNavigation.length - 1
            : (currentIndex + cycleDirection + cycleNavigation.length) %
              cycleNavigation.length;
        destination = cycleNavigation[nextIndex];
      } else if (numberIndex !== null) {
        destination = orderedNavigation[numberIndex];
      }
      if (!destination) return;

      event.preventDefault();
      if (cycleDirection !== null) {
        if (numberNavigationTimerRef.current !== null) {
          window.clearTimeout(numberNavigationTimerRef.current);
          numberNavigationTimerRef.current = null;
        }
        navigateToRef.current(getNavigationDestination(destination));
        return;
      }

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
      const playerPath = `/learn/${encodeURIComponent(courseRouteKey)}${options?.preview ? "/1" : ""}`;
      if (!activeUser) {
        navigateTo(buildLoginPath(playerPath), { exact: true });
        return;
      }
      const activePlayer = persistentPlayerRef.current;
      if (
        shouldRestoreMiniPlayerForMatchingCourse({
          presentation: playerPresentationRef.current,
          activeCourseRouteKey: activePlayer?.courseRouteKey,
          requestedCourseRouteKey: courseRouteKey,
        })
      ) {
        restoreLearningMiniPlayerRef.current();
        return;
      }
      if (activePlayer?.courseRouteKey === courseRouteKey) {
        navigateTo(activePlayer.lessonPath, { exact: true });
        return;
      }
      navigateTo(playerPath);
    },
    [activeUser, navigateTo],
  );

  const registerPersistentPlayer =
    useCallback<RegisterPersistentLearningPlayer>((registration) => {
      const token = Symbol("persistent-learning-player-registration");
      const restoreVersionAtRegistration = playerRestoreVersionRef.current;
      persistentRegistrationTokenRef.current = token;
      persistentPlayerRef.current = registration;
      setPersistentPlayer(registration);
      if (playerPresentationRef.current === "mini") {
        // Opening the learning route while the same (or another) course is
        // minimized should expand into the in-page player, not leave a hollow
        // lesson page with a stuck mini player.
        restoringPlayerRef.current = true;
      } else {
        playerPresentationRef.current = "full";
        setPlayerPresentation("full");
      }
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
          if (
            shouldDemoteDetachedPersistentPlayer({
              presentation: playerPresentationRef.current,
              restoreVersionAtRegistration,
              currentRestoreVersion: playerRestoreVersionRef.current,
            })
          ) {
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
    if (
      playerPresentationRef.current === "mini" &&
      persistentPlayerRef.current &&
      isLearningRoutePath(locationPathRef.current)
    ) {
      restoreLearningMiniPlayerRef.current();
      return;
    }
    persistentRegistrationTokenRef.current = null;
    persistentPlayerRef.current = null;
    setPersistentPlayer(null);
    closeLearningMiniPlayerSession();
  }, []);

  selectPersistentMiniPlayerLessonRef.current = (lessonNumber: number) => {
    const current = persistentPlayerRef.current;
    if (!current || playerPresentationRef.current !== "mini") return;

    const updated = applyPersistentMiniPlayerLessonChange(
      current,
      lessonNumber,
    );
    if (!updated) return;

    persistentPlayerRef.current = updated;
    setPersistentPlayer(updated);
  };

  const selectPersistentMiniPlayerLesson = useCallback(
    (lessonNumber: number) => {
      selectPersistentMiniPlayerLessonRef.current(lessonNumber);
    },
    [],
  );

  const mountLearningBackground = useCallback((deferred = true) => {
    if (deferred && learningBackgroundMountedRef.current) return;
    learningBackgroundMountedRef.current = true;
    const mount = () => setLearningBackgroundMounted(true);
    if (deferred) {
      startTransition(mount);
    } else {
      mount();
    }
  }, []);

  const unmountLearningBackground = useCallback(() => {
    if (!learningBackgroundMountedRef.current) return;
    learningBackgroundMountedRef.current = false;
    setLearningBackgroundMounted(false);
  }, []);

  const cancelLearningSurfaceMotion = useCallback(() => {
    surfaceMotionVersionRef.current += 1;
    if (surfaceMotionFrameRef.current !== null) {
      window.cancelAnimationFrame(surfaceMotionFrameRef.current);
      surfaceMotionFrameRef.current = null;
    }
    if (surfaceMotionTimerRef.current !== null) {
      window.clearTimeout(surfaceMotionTimerRef.current);
      surfaceMotionTimerRef.current = null;
    }
  }, []);

  const setLearningLessonContentMotionActive = useCallback(
    (active: boolean) => {
      const lessonContent = document.querySelector<HTMLElement>(
        "[data-learning-lesson-content]",
      );
      if (!lessonContent) return;
      lessonContent.inert = active;
      if (active) {
        lessonContent.style.pointerEvents = "none";
        lessonContent.style.willChange = "transform, opacity";
        return;
      }
      lessonContent.style.removeProperty("pointer-events");
      lessonContent.style.removeProperty("will-change");
    },
    [],
  );

  const applyLearningSurfaceMotion = useCallback(
    (
      offsetY: number,
      viewportHeight: number,
      phase: LessonPlayerMinimizeGestureState["phase"] | "restoring",
      forceMount = false,
    ) => {
      const viewportTop = window.visualViewport?.offsetTop ?? 0;
      const playerBottom =
        document
          .querySelector<HTMLElement>("[data-learning-persistent-player]")
          ?.getBoundingClientRect().bottom ?? viewportTop + offsetY;
      const playerBottomViewportProgress = Math.min(
        1,
        Math.max(0, (playerBottom - viewportTop) / Math.max(1, viewportHeight)),
      );
      learningMotionFadeStartViewportProgressRef.current ??=
        playerBottomViewportProgress;
      const motion = getLearningBackgroundMotionState(
        playerBottom,
        viewportHeight,
        {
          contentFadeStartViewportProgress:
            learningMotionFadeStartViewportProgressRef.current,
          viewportTop,
        },
      );
      learningMotionOffsetYRef.current = offsetY;
      learningMotionViewportHeightRef.current = viewportHeight;
      if (forceMount || motion.shouldMount) mountLearningBackground();

      const motionStage = learningMotionStageRef.current;
      if (!motionStage) return;
      motionStage.style.setProperty(
        "--learning-background-reveal-duration",
        "0ms",
      );
      motionStage.style.setProperty(
        "--learning-background-reveal",
        String(motion.revealProgress),
      );
      motionStage.style.setProperty(
        "--learning-player-content-motion-duration",
        "0ms",
      );
      motionStage.style.setProperty(
        "--learning-player-content-opacity",
        isDesktopLearningMinimizeViewport()
          ? "1"
          : String(motion.contentOpacity),
      );
      motionStage.style.setProperty(
        "--learning-player-content-offset-y",
        isDesktopLearningMinimizeViewport()
          ? "0px"
          : `${offsetY.toFixed(3)}px`,
      );
      motionStage.dataset.learningPlayerMotion = phase;
    },
    [mountLearningBackground],
  );

  const animateLearningSurfaceMotion = useCallback(
    (
      fromOffsetY: number,
      toOffsetY: number,
      viewportHeight: number,
      phase: LessonPlayerMinimizeGestureState["phase"] | "restoring",
      onComplete?: () => void,
    ) => {
      cancelLearningSurfaceMotion();
      const forceMount = phase === "settling-mini" || phase === "restoring";
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        applyLearningSurfaceMotion(
          toOffsetY,
          viewportHeight,
          phase,
          forceMount,
        );
        onComplete?.();
        return;
      }

      const version = surfaceMotionVersionRef.current;
      const startedAt = performance.now();
      const complete = () => {
        if (surfaceMotionVersionRef.current !== version) return;
        if (surfaceMotionFrameRef.current !== null) {
          window.cancelAnimationFrame(surfaceMotionFrameRef.current);
          surfaceMotionFrameRef.current = null;
        }
        if (surfaceMotionTimerRef.current !== null) {
          window.clearTimeout(surfaceMotionTimerRef.current);
          surfaceMotionTimerRef.current = null;
        }
        applyLearningSurfaceMotion(
          toOffsetY,
          viewportHeight,
          phase,
          forceMount,
        );
        onComplete?.();
      };
      const tick = (timestamp: number) => {
        if (surfaceMotionVersionRef.current !== version) return;
        const elapsedProgress = Math.min(
          1,
          Math.max(
            0,
            (timestamp - startedAt) / LEARNING_PLAYER_MOTION_DURATION_MS,
          ),
        );
        const easedProgress = easeLearningPlayerMotionProgress(elapsedProgress);
        applyLearningSurfaceMotion(
          fromOffsetY + (toOffsetY - fromOffsetY) * easedProgress,
          viewportHeight,
          phase,
          forceMount,
        );
        if (elapsedProgress >= 1) {
          complete();
          return;
        }
        surfaceMotionFrameRef.current = window.requestAnimationFrame(tick);
      };

      applyLearningSurfaceMotion(
        fromOffsetY,
        viewportHeight,
        phase,
        forceMount,
      );
      surfaceMotionFrameRef.current = window.requestAnimationFrame(tick);
      surfaceMotionTimerRef.current = window.setTimeout(
        complete,
        LEARNING_PLAYER_MOTION_DURATION_MS + 80,
      );
    },
    [applyLearningSurfaceMotion, cancelLearningSurfaceMotion],
  );

  const finishLearningPlayerRestoreMotion = useCallback(() => {
    cancelLearningSurfaceMotion();
    restoringPlayerRef.current = false;
    const motionStage = learningMotionStageRef.current;
    if (motionStage) clearLearningPlayerMotionProperties(motionStage);
    unmountLearningBackground();
    learningMotionOffsetYRef.current = 0;
    setLearningLessonContentMotionActive(false);
  }, [
    cancelLearningSurfaceMotion,
    setLearningLessonContentMotionActive,
    unmountLearningBackground,
  ]);

  const commitPersistentPlayerRestore = useCallback(() => {
    if (!restoringPlayerRef.current) return;
    playerPresentationRef.current = "full";
    setPlayerPresentation("full");
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const restoreOffsetY = Math.max(
      learningMotionOffsetYRef.current,
      viewportHeight * LEARNING_BACKGROUND_REVEAL_END_VIEWPORT_PROGRESS,
    );
    setLearningLessonContentMotionActive(true);
    animateLearningSurfaceMotion(
      restoreOffsetY,
      0,
      viewportHeight,
      "restoring",
      finishLearningPlayerRestoreMotion,
    );
  }, [
    animateLearningSurfaceMotion,
    finishLearningPlayerRestoreMotion,
    setLearningLessonContentMotionActive,
  ]);

  const handleLearningPlayerMinimizeGestureChange = useCallback(
    (state: LessonPlayerMinimizeGestureState) => {
      if (state.phase === "idle" && playerPresentationRef.current === "mini") {
        return;
      }
      if (state.phase !== "idle" && restoringPlayerRef.current) {
        finishLearningPlayerRestoreMotion();
      }
      const viewportHeight =
        window.visualViewport?.height ?? window.innerHeight;
      const motionStage = learningMotionStageRef.current;
      if (!motionStage) return;
      if (state.phase === "idle") {
        cancelLearningSurfaceMotion();
        clearLearningPlayerMotionProperties(motionStage);
        unmountLearningBackground();
        learningMotionOffsetYRef.current = 0;
        learningMotionFadeStartViewportProgressRef.current = null;
        setLearningLessonContentMotionActive(false);
        return;
      }

      setLearningLessonContentMotionActive(true);
      if (state.phase === "dragging") {
        if (learningMotionOffsetYRef.current === 0) {
          learningMotionFadeStartViewportProgressRef.current = null;
        }
        cancelLearningSurfaceMotion();
        applyLearningSurfaceMotion(state.offsetY, viewportHeight, state.phase);
        return;
      }
      animateLearningSurfaceMotion(
        learningMotionOffsetYRef.current,
        state.offsetY,
        viewportHeight,
        state.phase,
      );
    },
    [
      animateLearningSurfaceMotion,
      applyLearningSurfaceMotion,
      cancelLearningSurfaceMotion,
      finishLearningPlayerRestoreMotion,
      setLearningLessonContentMotionActive,
      unmountLearningBackground,
    ],
  );

  useEffect(
    () => () => {
      cancelLearningSurfaceMotion();
      const motionStage = learningMotionStageRef.current;
      if (motionStage) clearLearningPlayerMotionProperties(motionStage);
      // Remove properties left on the root by an older hot-reloaded build.
      clearLearningPlayerMotionProperties(document.documentElement);
    },
    [cancelLearningSurfaceMotion],
  );

  useLayoutEffect(() => {
    if (route.kind === "learning") return;
    cancelLearningSurfaceMotion();
    const motionStage = learningMotionStageRef.current;
    if (motionStage) clearLearningPlayerMotionProperties(motionStage);
    unmountLearningBackground();
  }, [cancelLearningSurfaceMotion, route.kind, unmountLearningBackground]);

  useLayoutEffect(() => {
    if (route.kind !== "learning" || !restoringPlayerRef.current) return;
    // Keep the persistent player in its mini presentation until the learning
    // route (including the title and comments) is mounted. The player and the
    // lesson surface can then run the same edge-driven motion in reverse from
    // their very first frame.
    commitPersistentPlayerRestore();
  }, [commitPersistentPlayerRestore, route.kind]);

  useEffect(
    () => () => finishLearningPlayerRestoreMotion(),
    [finishLearningPlayerRestoreMotion],
  );

  const openPersistentPlayerCourseOverview = useCallback(() => {
    const slug =
      persistentPlayer?.courseSlug ?? persistentPlayer?.courseRouteKey;
    if (!slug) return;
    navigateTo(`/courses/${encodeURIComponent(slug)}/overview`);
  }, [
    navigateTo,
    persistentPlayer?.courseRouteKey,
    persistentPlayer?.courseSlug,
  ]);

  const openStandaloneMiniPlayerCourseOverview = useCallback(() => {
    const slug = learningMiniPlayer?.courseSlug;
    if (!slug) return;
    navigateTo(`/courses/${encodeURIComponent(slug)}/overview`);
  }, [learningMiniPlayer?.courseSlug, navigateTo]);

  const restoreLearningMiniPlayer = useCallback(() => {
    const activePlayer = persistentPlayerRef.current;
    const lessonPath = resolveLearningMiniPlayerLessonPath({
      courseRouteKey:
        activePlayer?.courseRouteKey ?? learningMiniPlayer?.courseSlug,
      lessonNumber:
        activePlayer?.selectedLesson ?? learningMiniPlayer?.selectedLesson,
      lessonPath: activePlayer?.lessonPath ?? learningMiniPlayer?.lessonPath,
    });
    if (!lessonPath) return;
    // A route unmount queues the outgoing registration cleanup. Mark this
    // restore before navigating so that stale cleanup cannot turn the player
    // back into a mini player after the first touch already restored it.
    playerRestoreVersionRef.current += 1;
    if (persistentPlayerRef.current) {
      finishLearningPlayerRestoreMotion();
      restoringPlayerRef.current = true;
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        mountLearningBackground(false);
        const motionStage = learningMotionStageRef.current;
        if (motionStage) {
          motionStage.dataset.learningPlayerRestoring = "true";
          const viewportHeight =
            learningMotionViewportHeightRef.current ||
            window.visualViewport?.height ||
            window.innerHeight;
          applyLearningSurfaceMotion(
            Math.max(
              learningMotionOffsetYRef.current,
              viewportHeight * LEARNING_BACKGROUND_REVEAL_END_VIEWPORT_PROGRESS,
            ),
            viewportHeight,
            "restoring",
            true,
          );
        }
      }
    }
    const alreadyOnLearningRoute = isLearningRoutePath(locationPathRef.current);
    navigateTo(lessonPath, { exact: true });
    if (alreadyOnLearningRoute) {
      commitPersistentPlayerRestore();
    }
  }, [
    applyLearningSurfaceMotion,
    commitPersistentPlayerRestore,
    finishLearningPlayerRestoreMotion,
    learningMiniPlayer,
    mountLearningBackground,
    navigateTo,
  ]);
  restoreLearningMiniPlayerRef.current = restoreLearningMiniPlayer;

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
        miniPlayerCourseId={resolveMiniPlayerCourseId({
          presentation: playerPresentation,
          persistentCourseRouteKey: persistentPlayer?.courseRouteKey,
          persistentCourseSlug: persistentPlayer?.courseSlug,
          persistentLessonPath: persistentPlayer?.lessonPath,
          miniPlayerCourseSlug: learningMiniPlayer?.courseSlug,
          miniPlayerLessonPath: learningMiniPlayer?.lessonPath,
        })}
        learningBackground={learningBackground}
        learningMotionStageRef={learningMotionStageRef}
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
                      persistentPlayerMounted: Boolean(persistentPlayer),
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
          onSelectMiniPlayerLesson={selectPersistentMiniPlayerLesson}
          onOpenCourseOverview={openPersistentPlayerCourseOverview}
        />
      ) : learningMiniPlayer ? (
        <LearningMiniPlayer
          session={learningMiniPlayer}
          onClose={closeLearningMiniPlayer}
          onRestore={restoreLearningMiniPlayer}
          onOpenCourseOverview={openStandaloneMiniPlayerCourseOverview}
        />
      ) : null}
    </AcademyRouteGuard>
  );
}
