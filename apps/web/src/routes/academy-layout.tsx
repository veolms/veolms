import {
  lazy,
  Suspense,
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
import type { Route } from "./+types/academy-layout";
import academyShellStylesheet from "../shell-theme.css?url";
import type { AcademyStaticPageData } from "./academyStaticPageData";
import { CoursesPage } from "../CoursesPage";
import {
  getCourseRouteKey,
  type Course,
  type CourseOpenOptions,
} from "../courses/catalogue";
import { getStudentCatalogueEnrollmentFilterFromPath } from "../courses/catalogueRoutes";
import { authKeys, useCurrentUser, useSignOut } from "../services/auth";
import { useAuthStore } from "../store/auth.store";
import { queryClient } from "../lib/query-client";
import type { LearningCourse } from "../StudentPages";
import {
  getLearningReturnLocation,
  getLearningReturnLocationServerSnapshot,
  rememberLearningReturnLocation,
  subscribeToLearningReturnLocation,
} from "../learning/learningReturnLocation";
import type {
  LearningPlayerPresentation,
  PersistentLearningPlayerRegistration,
  RegisterPersistentLearningPlayer,
} from "../learning/player/PersistentLearningPlayerHost";
import type { LessonPlayerMinimizeGestureState } from "../learning/player/useLessonPlayerMinimizeGesture";
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
  courseRouteKeyFromLessonPath,
  resolveLearningMiniPlayerLessonPath,
  resolveMiniPlayerCourseId,
} from "../learning/player/persistentMiniPlayerLesson";
import {
  getCachedVideoPlaybackBootstrap,
  getVideoPlaybackBootstrap,
  refreshVideoPlaybackToken,
  VideoPlaybackBootstrapError,
} from "../learning/videoPlaybackBootstrap";

const loadPersistentLearningPlayerHost = () =>
  import("../learning/player/PersistentLearningPlayerHost");
const PersistentLearningPlayerHost = lazy(() =>
  loadPersistentLearningPlayerHost().then((module) => ({
    default: module.PersistentLearningPlayerHost,
  })),
);
const loadLearningMiniPlayer = () =>
  import("../learning/player/LearningMiniPlayer");
const LearningMiniPlayer = lazy(() =>
  loadLearningMiniPlayer().then((module) => ({
    default: module.LearningMiniPlayer,
  })),
);
import type { LearningMiniPlayerSession } from "../learning/player/learningMiniPlayerTypes";
import {
  closeLearningMiniPlayerSession,
  getLearningMiniPlayerServerSnapshot,
  getLearningMiniPlayerSnapshot,
  openLearningMiniPlayerSession,
  subscribeToLearningMiniPlayer,
} from "../learning/player/learningMiniPlayerStore";
import type { NavigateTo, NavigationOptions } from "../routing/navigation";
import { AcademyRouteGuard } from "../routing/RouteGuards";
import {
  buildLoginDialogPath,
  buildLoginPath,
  LOGIN_PATH,
} from "../routing/routeAccess";
import { LoginDialogHost } from "../auth/LoginDialogHost";
import {
  getNavigationDestination,
  getRoleNavigationItems,
  type NavigationItemWithMetadata,
} from "../shell/navigation";
import {
  getUserRoles,
  getWorkspaceRoleStorageKey,
  hasAdminRole,
  isStaffRole,
  resolveWorkspaceRole,
} from "../shell/workspaceRole";
import {
  followApplicationScrollPosition,
  readApplicationScrollPosition,
  scrollApplicationTo,
  type ApplicationScrollPosition,
} from "../shell/applicationScroll";
import { getInitialSidebarPreferences } from "../shell/sidebarPreferences";
import { normalizeSidebarDockItems } from "../settings/settingsPreferences";
// Not the autosync barrel: that would pull the autosave UI and TanStack
// persistence helpers into the shell bundle.
import { autosyncManager } from "../lib/autosync/manager";
import {
  getNumberShortcutIndex,
  isEditingShortcutTarget,
} from "../keyboardShortcuts";
import {
  getDestinationPath,
  getMatchedRouteDescriptor,
  getStaticRouteDescriptor,
  normalizeNavigationPath,
} from "../routing/routeDescriptors";

export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: academyShellStylesheet },
];

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
  pathname: string;
  section?: string;
  settingsTab?: string;
}

interface ApplicationScrollRestorationEntry {
  position: ApplicationScrollPosition;
  canRestoreScroll?: NavigationOptions["canRestoreScroll"];
}

const getApplicationScrollStorageKey = (
  path: string,
  restorationKey?: string,
) => (restorationKey ? `${path}\u0000${restorationKey}` : path);

const ACADEMY_NAVIGATION_ORIGIN_PATH = "academyNavigationOriginPath";
const ACADEMY_NAVIGATION_ORIGIN_SECTION = "academyNavigationOriginSection";

function readAcademyNavigationState(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getNavigationMatch(
  pathname: string,
  items: readonly NavigationItemWithMetadata[],
) {
  const path = normalizeNavigationPath(pathname.split(/[?#]/, 1)[0] || "/");
  let bestMatch:
    { label: string; path: string; exact: boolean; length: number } | undefined;

  for (const [label, , metadata] of items) {
    const itemPath = normalizeNavigationPath(metadata?.routeLink ?? "/");
    // The Discussions menu resolves to the last tab visited in this session,
    // so its tab URLs are still the menu's destination rather than a detail
    // page that should inherit the previously selected section.
    const isDiscussionTab =
      itemPath === "/discussions" && path.startsWith("/discussions/");
    const exact = path === itemPath || isDiscussionTab;
    const isChild =
      itemPath !== "/" && path.startsWith(`${itemPath.replace(/\/$/, "")}/`);
    if (!exact && !isChild) continue;
    if (!bestMatch || itemPath.length > bestMatch.length) {
      bestMatch = { label, path: itemPath, exact, length: itemPath.length };
    }
  }

  return bestMatch;
}

function getWorkspaceNavigationItems(
  user: { id?: string } | null | undefined,
  settingsDocked: boolean,
) {
  const roles = getUserRoles(user);
  let storedRole: string | null = null;
  if (typeof window !== "undefined") {
    try {
      storedRole = localStorage.getItem(getWorkspaceRoleStorageKey(user?.id));
    } catch {
      storedRole = null;
    }
  }
  const rolePreference =
    storedRole === "creator" || storedRole === "student"
      ? storedRole
      : isStaffRole(roles)
        ? "creator"
        : "student";
  const navigation = getRoleNavigationItems(
    resolveWorkspaceRole(roles, rolePreference),
    hasAdminRole(roles),
  );
  return navigation.filter(
    ([label]) => label !== "Settings" || !settingsDocked,
  );
}

function getFallbackNavigationPath(
  path: string,
  items: readonly NavigationItemWithMetadata[],
) {
  const match = getNavigationMatch(path, items);
  if (match && !match.exact) return match.path;
  const courses = items.find(([label]) => label === "Courses");
  if (courses?.[2]?.routeLink) return courses[2].routeLink;
  return items[0]?.[2]?.routeLink ?? "/";
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

/**
 * Describes the page behind the player so the shell can draw it while the
 * player shrinks. A page whose address cannot be resolved without a router
 * match gets no preview rather than the preview of a different page.
 */
const resolveLearningBackgroundSurface = (
  returnPath: string,
): LearningBackgroundSurface | null => {
  try {
    const url = new URL(returnPath, "https://procodrr.local");
    const pathname = normalizeNavigationPath(url.pathname);
    const overviewMatch = /^\/courses\/([^/]+)\/overview$/.exec(pathname);
    if (overviewMatch?.[1]) {
      return {
        courseSlug: decodeURIComponent(overviewMatch[1]),
        page: "course-overview",
        pathname,
        section: "Courses",
      };
    }
    const descriptor = getStaticRouteDescriptor(pathname);
    if (descriptor?.kind !== "shell") return null;
    return {
      discussionTab: descriptor.discussionTab,
      page: descriptor.page,
      pathname,
      section:
        descriptor.section ??
        (descriptor.page === "courses" ? "Courses" : undefined),
      settingsTab: descriptor.settingsTab,
    };
  } catch {
    return null;
  }
};

const isSettingsPath = (path: string) => {
  const pathname = normalizeNavigationPath(path.split(/[?#]/, 1)[0] || "/");
  return pathname === "/settings" || pathname.startsWith("/settings/");
};

const isLearningRoutePath = (path: string) =>
  normalizeNavigationPath(path.split(/[?#]/, 1)[0] || "/").startsWith(
    "/learn/",
  );

/** A page the player can go back to: not a lesson, and not the sign-out step. */
const isLearningReturnCandidate = (path: string) =>
  !isLearningRoutePath(path) &&
  normalizeNavigationPath(path.split(/[?#]/, 1)[0] || "/") !== "/logout";

/**
 * A lesson opened from settings still counts as being inside settings: when
 * the player is minimized back, leaving settings must go to wherever settings
 * was opened from, not back into the lesson.
 */
const isLessonOpenedFromSettings = (path: string) =>
  isLearningRoutePath(path) && isSettingsPath(getLearningReturnLocation().path);

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

export default function AcademyLayout() {
  const matches = useMatches();
  const location = useLocation();
  const navigate = useNavigate();
  const { courseSlug, quizId, assignmentId, username, couponId } = useParams();
  const applicationScrollPositionsRef = useRef(
    new Map<string, ApplicationScrollRestorationEntry>(),
  );
  const pendingScrollPositionRef = useRef<{
    destinationPath: string;
    sourcePath: string;
    position: ApplicationScrollPosition;
    canRestoreScroll?: NavigationOptions["canRestoreScroll"];
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
  const learningReturnLocation = useSyncExternalStore(
    subscribeToLearningReturnLocation,
    getLearningReturnLocation,
    getLearningReturnLocationServerSnapshot,
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
    (lessonNumber: number, options?: { retry?: boolean }) => void
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
  const commitPersistentPlayerRestoreRef = useRef<() => void>(() => {});
  const selectLessonTokenRef = useRef(0);
  const currentLocationPath = `${location.pathname}${location.search}${location.hash}`;
  const route = getMatchedRouteDescriptor(matches, location.pathname);
  const staticCourseRouteData = matches.find((match) => match.id === "root")
    ?.loaderData as AcademyStaticPageData | undefined;
  const {
    data: authUser,
    isError: authUserError,
    isFetched: authUserFetched,
  } = useCurrentUser();
  const storeUser = useAuthStore((state) => state.user);
  const activeUser = authUserFetched && !authUserError ? authUser : storeUser;
  const settingsDocked = normalizeSidebarDockItems(
    getInitialSidebarPreferences().dockItems,
  ).includes("settings");
  // The menu depends on the workspace role ("view as"), which is kept in
  // local storage and can be switched without the user object changing. It is
  // therefore re-read on every navigation; held for the whole session, a role
  // switch left this list on the old role's menu, so the new role's extra
  // pages were not recognised as menu pages and never showed as selected.
  const workspaceNavigationItems = useMemo(
    () => getWorkspaceNavigationItems(activeUser, settingsDocked),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- location.key is the re-read trigger
    [activeUser, settingsDocked, location.key],
  );
  const currentNavigationState = readAcademyNavigationState(location.state);
  const originPathValue =
    currentNavigationState[ACADEMY_NAVIGATION_ORIGIN_PATH];
  const originSectionValue =
    currentNavigationState[ACADEMY_NAVIGATION_ORIGIN_SECTION];
  const hasValidNavigationOrigin =
    typeof originPathValue === "string" &&
    originPathValue.startsWith("/") &&
    !originPathValue.startsWith("//") &&
    typeof originSectionValue === "string" &&
    workspaceNavigationItems.some(([label]) => label === originSectionValue);
  const currentNavigationMatch = getNavigationMatch(
    location.pathname,
    workspaceNavigationItems,
  );
  const activeRouteSection = hasValidNavigationOrigin
    ? originSectionValue
    : (currentNavigationMatch?.label ??
      (workspaceNavigationItems.some(([label]) => label === route.section)
        ? route.section
        : workspaceNavigationItems[0]?.[0]));
  const showRouteBackButton = !currentNavigationMatch?.exact;

  useLayoutEffect(() => {
    locationPathRef.current = currentLocationPath;
    if (
      !isSettingsPath(currentLocationPath) &&
      !isLessonOpenedFromSettings(currentLocationPath)
    ) {
      settingsReturnLocationRef.current.path = currentLocationPath;
    }
  }, [currentLocationPath]);

  // Every page that is not a lesson is where the player would go back to, so
  // it is recorded on arrival together with its highlighted section. Its
  // scroll position is added when the learner leaves it.
  useLayoutEffect(() => {
    if (!isLearningReturnCandidate(currentLocationPath)) return;
    rememberLearningReturnLocation({
      path: currentLocationPath,
      section: activeRouteSection ?? null,
    });
  }, [activeRouteSection, currentLocationPath]);

  useEffect(() => {
    // A plain link reloads the document, so nothing else sees the page go.
    const rememberScrollPosition = () => {
      const path = renderedLocationPathRef.current;
      if (!isLearningReturnCandidate(path)) return;
      rememberLearningReturnLocation({
        path,
        ...readApplicationScrollPosition(),
      });
    };
    window.addEventListener("pagehide", rememberScrollPosition);
    return () => window.removeEventListener("pagehide", rememberScrollPosition);
  }, []);

  const { signOut } = useSignOut();

  useLayoutEffect(() => {
    const pathname = normalizeNavigationPath(location.pathname);
    if (pathname !== "/home" && pathname !== "/dashboard") return;
    void navigate(`/${location.search}${location.hash}`, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);

  useLayoutEffect(() => {
    if (normalizeNavigationPath(location.pathname) !== "/wishlist") return;
    void navigate(`/courses/wishlist${location.search}${location.hash}`, {
      replace: true,
    });
  }, [location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    const pathname = normalizeNavigationPath(location.pathname);
    if (pathname === "/logout") {
      void signOut().catch(() => {
        // A critical sync barrier must be allowed to stop logout. Return to
        // the previous screen so an offline/blocked draft is not stranded on
        // a route with no actionable UI.
        void navigate(-1);
      });
      return;
    }
    const destination = pathname === "/my-learning" ? "/courses" : null;
    if (destination)
      void navigate(`${destination}${location.search}`, { replace: true });
  }, [location.pathname, location.search, navigate, signOut]);

  useLayoutEffect(() => {
    const previousPath = renderedLocationPathRef.current;
    const pending = pendingScrollPositionRef.current;
    if (previousPath === currentLocationPath && !pending) return;

    if (previousPath !== currentLocationPath) {
      if (pending?.sourcePath !== previousPath) {
        const previousPosition = readApplicationScrollPosition();
        applicationScrollPositionsRef.current.set(previousPath, {
          position: previousPosition,
        });
        // A lesson reached by a plain route change or the browser history
        // never passes through navigateTo, which is what records this.
        if (
          isLearningRoutePath(currentLocationPath) &&
          isLearningReturnCandidate(previousPath)
        ) {
          rememberLearningReturnLocation({
            path: previousPath,
            ...previousPosition,
          });
        }
      }
      renderedLocationPathRef.current = currentLocationPath;
    }

    const storedEntry =
      applicationScrollPositionsRef.current.get(currentLocationPath);
    const position =
      pending?.destinationPath === currentLocationPath
        ? pending.position
        : (storedEntry?.position ?? { left: 0, top: 0 });
    const canRestoreScroll =
      pending?.destinationPath === currentLocationPath
        ? pending.canRestoreScroll
        : storedEntry?.canRestoreScroll;
    pendingScrollPositionRef.current = null;
    const restorePosition = () => {
      const shouldRestore = canRestoreScroll?.(position) ?? true;
      scrollApplicationTo({
        ...(shouldRestore ? position : { left: 0, top: 0 }),
        behavior: "auto",
      });
    };
    restorePosition();
    const frame = window.requestAnimationFrame(restorePosition);
    // After a reload the page is still loading its code and data, so it may
    // not be tall enough for the position yet.
    const stopFollowingPosition =
      (canRestoreScroll?.(position) ?? true)
        ? followApplicationScrollPosition(position)
        : undefined;
    return () => {
      window.cancelAnimationFrame(frame);
      stopFollowingPosition?.();
    };
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
      const requestedPath = options?.exact
        ? destination
        : getDestinationPath(destination);
      const requestedPathname = normalizeNavigationPath(
        requestedPath.split(/[?#]/, 1)[0] || "/",
      );
      const isDiscussionsPath =
        requestedPathname === "/discussions" ||
        requestedPathname.startsWith("/discussions/");

      if (
        isDiscussionsPath &&
        authUserFetched &&
        !authUserError &&
        !activeUser
      ) {
        // Keep the confirmed signed-out state fresh so the login route can
        // render immediately without revalidating the same session query.
        queryClient.setQueryData(authKeys.me(), null);
        void navigate(
          buildLoginDialogPath(requestedPath, locationPathRef.current),
        );
        return;
      }

      // "Log in" from anywhere opens the pop-up over the page the visitor
      // is on (or the page the link was heading for), not a login page.
      if (requestedPathname === LOGIN_PATH) {
        const loginReturnTo = new URLSearchParams(
          requestedPath.split("#", 1)[0]?.split("?")[1] ?? "",
        ).get("returnTo");
        void navigate(
          buildLoginDialogPath(loginReturnTo, locationPathRef.current),
        );
        return;
      }

      const performNavigation = () => {
        const path = requestedPath;
        const activeLocationPath = locationPathRef.current;
        const navigationState = {
          ...readAcademyNavigationState(location.state),
        };
        // Read the menu afresh: the role may have been switched since the
        // last navigation, which is the only time the list above is rebuilt.
        const workspaceNavigationItems = getWorkspaceNavigationItems(
          activeUser,
          settingsDocked,
        );
        const targetNavigationMatch = getNavigationMatch(
          path,
          workspaceNavigationItems,
        );
        if (targetNavigationMatch?.exact) {
          delete navigationState[ACADEMY_NAVIGATION_ORIGIN_PATH];
          delete navigationState[ACADEMY_NAVIGATION_ORIGIN_SECTION];
        } else {
          const existingOriginPath =
            navigationState[ACADEMY_NAVIGATION_ORIGIN_PATH];
          const existingOriginSection =
            navigationState[ACADEMY_NAVIGATION_ORIGIN_SECTION];
          const originIsValid =
            typeof existingOriginPath === "string" &&
            existingOriginPath.startsWith("/") &&
            !existingOriginPath.startsWith("//") &&
            typeof existingOriginSection === "string" &&
            workspaceNavigationItems.some(
              ([label]) => label === existingOriginSection,
            );
          const sourceNavigationMatch = getNavigationMatch(
            activeLocationPath,
            workspaceNavigationItems,
          );
          const originSection = originIsValid
            ? existingOriginSection
            : (sourceNavigationMatch?.label ??
              (workspaceNavigationItems.some(
                ([label]) => label === route.section,
              )
                ? route.section
                : workspaceNavigationItems[0]?.[0]));
          if (originSection) {
            navigationState[ACADEMY_NAVIGATION_ORIGIN_PATH] = originIsValid
              ? existingOriginPath
              : activeLocationPath;
            navigationState[ACADEMY_NAVIGATION_ORIGIN_SECTION] = originSection;
          }
        }
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
        if (
          isSettingsPath(path) &&
          !isSettingsPath(locationPathRef.current) &&
          !isLessonOpenedFromSettings(locationPathRef.current)
        ) {
          const currentScrollPosition = readApplicationScrollPosition();
          settingsReturnLocationRef.current = {
            path: locationPathRef.current,
            ...currentScrollPosition,
          };
        }
        const sourcePath = locationPathRef.current;
        const sourcePosition = readApplicationScrollPosition();
        const routeChanged =
          normalizeNavigationPath(path) !==
          normalizeNavigationPath(locationPathRef.current);
        const resetDestinationScroll =
          !options?.scrollPosition &&
          (options?.resetScroll ||
            (isSettingsPath(path) && !isSettingsPath(sourcePath)));
        const sourceStorageKey = getApplicationScrollStorageKey(
          sourcePath,
          options?.sourceScrollRestorationKey,
        );
        const destinationStorageKey = getApplicationScrollStorageKey(
          path,
          options?.scrollRestorationKey,
        );
        const sourceEntry: ApplicationScrollRestorationEntry = {
          position: sourcePosition,
          canRestoreScroll: options?.canRestoreScroll,
        };
        if (options?.captureScroll !== false) {
          applicationScrollPositionsRef.current.set(
            sourceStorageKey,
            sourceEntry,
          );
          if (sourceStorageKey !== sourcePath) {
            applicationScrollPositionsRef.current.set(sourcePath, sourceEntry);
          }
        }

        const hasScrollTransition =
          resetDestinationScroll ||
          options?.scrollRestorationKey !== undefined ||
          options?.sourceScrollRestorationKey !== undefined;

        if (!routeChanged) {
          if (!hasScrollTransition) return;

          const storedDestination = resetDestinationScroll
            ? undefined
            : applicationScrollPositionsRef.current.get(destinationStorageKey);
          const position = storedDestination?.position ?? { left: 0, top: 0 };
          const restorePosition = () => {
            const shouldRestore =
              resetDestinationScroll ||
              options?.canRestoreScroll?.(position) !== false;
            scrollApplicationTo({
              ...(shouldRestore ? position : { left: 0, top: 0 }),
              behavior: "auto",
            });
          };
          restorePosition();
          window.requestAnimationFrame(restorePosition);
          return;
        }

        const storedDestination = resetDestinationScroll
          ? undefined
          : options?.scrollRestorationKey
            ? applicationScrollPositionsRef.current.get(destinationStorageKey)
            : applicationScrollPositionsRef.current.get(path);
        const position =
          options?.scrollPosition ??
          (resetDestinationScroll
            ? { left: 0, top: 0 }
            : options?.preserveScroll
              ? sourcePosition
              : (storedDestination?.position ?? { left: 0, top: 0 }));
        if (
          isLearningRoutePath(path) &&
          isLearningReturnCandidate(sourcePath)
        ) {
          // Only a page that is on screen has a scroll position worth
          // keeping; a page that was requested but never rendered keeps the
          // one it already had.
          rememberLearningReturnLocation(
            renderedLocationPathRef.current === sourcePath
              ? { path: sourcePath, ...sourcePosition }
              : { path: sourcePath },
          );
        }
        pendingScrollPositionRef.current = {
          destinationPath: path,
          sourcePath,
          position,
          canRestoreScroll: resetDestinationScroll
            ? undefined
            : (options?.canRestoreScroll ??
              storedDestination?.canRestoreScroll),
        };
        // Update synchronously so a second shortcut pressed before React's
        // route render still compares against the destination just requested.
        locationPathRef.current = path;
        void navigate(path, {
          preventScrollReset: true,
          replace: options?.replace,
          state: navigationState,
        });
      };

      void autosyncManager.flushAll().then(performNavigation);
    },
    [
      activeUser,
      authUserError,
      authUserFetched,
      location.state,
      navigate,
      route.section,
      settingsDocked,
    ],
  );
  const navigateToRef = useRef(navigateTo);
  useLayoutEffect(() => {
    navigateToRef.current = navigateTo;
  }, [navigateTo]);
  const navigateBackToOrigin = useCallback(() => {
    const targetPath = hasValidNavigationOrigin
      ? (originPathValue as string)
      : getFallbackNavigationPath(location.pathname, workspaceNavigationItems);
    navigateTo(targetPath, { replace: true });
  }, [
    hasValidNavigationOrigin,
    location.pathname,
    navigateTo,
    originPathValue,
    workspaceNavigationItems,
  ]);
  const exitSettings = useCallback(() => {
    const destination = settingsReturnLocationRef.current;
    const sourcePath = locationPathRef.current;
    applicationScrollPositionsRef.current.set(sourcePath, {
      position: readApplicationScrollPosition(),
    });
    pendingScrollPositionRef.current = {
      destinationPath: destination.path,
      sourcePath,
      position: {
        left: destination.left,
        top: destination.top,
      },
    };
    locationPathRef.current = destination.path;
    void autosyncManager
      .flushAll()
      .then(() => navigate(destination.path, { preventScrollReset: true }));
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

      const storedWorkspaceRole = localStorage.getItem(
        getWorkspaceRoleStorageKey(activeUser?.id),
      );
      const userRoles = getUserRoles(activeUser);
      const rolePreference =
        storedWorkspaceRole === "creator" || storedWorkspaceRole === "student"
          ? storedWorkspaceRole
          : isStaffRole(userRoles)
            ? "creator"
            : "student";
      const navigationRole = resolveWorkspaceRole(userRoles, rolePreference);
      const navigationItems = getRoleNavigationItems(
        navigationRole,
        hasAdminRole(userRoles),
      );
      const orderedNavigation = navigationItems.filter(
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
  }, [activeUser]);

  const openCourse = useCallback(
    (course: Course | LearningCourse, options?: CourseOpenOptions) => {
      const courseRouteKey = getCourseRouteKey(course);
      const playerPath = `/learn/${encodeURIComponent(courseRouteKey)}${options?.preview ? "/1" : ""}`;
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
    [navigateTo],
  );

  const registerPersistentPlayer =
    useCallback<RegisterPersistentLearningPlayer>((registration) => {
      void loadPersistentLearningPlayerHost().catch(() => undefined);
      const token = Symbol("persistent-learning-player-registration");
      const restoreVersionAtRegistration = playerRestoreVersionRef.current;
      persistentRegistrationTokenRef.current = token;
      const existing = persistentPlayerRef.current;
      const resolvedRegistration =
        registration.playerProps.playbackBootstrap == null &&
        existing?.mediaKey === registration.mediaKey &&
        existing.playerProps.playbackBootstrap != null
          ? {
              ...registration,
              playerProps: {
                ...registration.playerProps,
                playbackBootstrap: existing.playerProps.playbackBootstrap,
                refreshPlaybackToken:
                  registration.playerProps.refreshPlaybackToken ??
                  existing.playerProps.refreshPlaybackToken,
              },
            }
          : registration;
      persistentPlayerRef.current = resolvedRegistration;
      setPersistentPlayer(resolvedRegistration);
      if (playerPresentationRef.current === "mini") {
        // Opening the learning route while the same (or another) course is
        // minimized should expand into the in-page player, not leave a hollow
        // lesson page with a stuck mini player.
        restoringPlayerRef.current = true;
        // The route effect commits this restore when the lesson page arrives
        // together with the route change. When the page mounts on a lesson
        // route that is already showing (it was unmounted for a moment, or
        // its code only just loaded), that effect has nothing to react to,
        // so the restore is committed here once this commit has settled.
        queueMicrotask(() => {
          if (
            persistentRegistrationTokenRef.current !== token ||
            !restoringPlayerRef.current ||
            playerPresentationRef.current !== "mini"
          ) {
            return;
          }
          commitPersistentPlayerRestoreRef.current();
        });
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
      void loadLearningMiniPlayer().catch(() => undefined);
      playerPresentationRef.current = "mini";
      setPlayerPresentation("mini");
      openLearningMiniPlayerSession(session);
      // Go back to the page the player was opened from, exactly where the
      // learner left it.
      const returnLocation = getLearningReturnLocation();
      navigateTo(returnLocation.path, {
        exact: true,
        scrollPosition: { left: returnLocation.left, top: returnLocation.top },
      });
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

  const openPersistentPlayerLogin = useCallback(() => {
    const returnPath =
      persistentPlayerRef.current?.lessonPath ?? locationPathRef.current;
    navigateTo(buildLoginPath(returnPath), { exact: true });
  }, [navigateTo]);

  selectPersistentMiniPlayerLessonRef.current = (
    lessonNumber: number,
    options,
  ) => {
    const current = persistentPlayerRef.current;
    if (!current || playerPresentationRef.current !== "mini") return;
    const retry = options?.retry === true;

    const courseSlug =
      current.courseSlug ??
      courseRouteKeyFromLessonPath(current.lessonPath) ??
      current.courseRouteKey;
    if (!courseSlug) return;

    const cachedBootstrap = courseSlug
      ? getCachedVideoPlaybackBootstrap({ courseSlug, lessonNumber })
      : null;

    const isProtected = Boolean(
      current.playerProps.protectedPlayback ||
      current.playerProps.playbackBootstrap != null,
    );

    const token = ++selectLessonTokenRef.current;

    if (!retry && (cachedBootstrap || !isProtected)) {
      const updated = applyPersistentMiniPlayerLessonChange(
        current,
        lessonNumber,
        {
          playbackBootstrap: cachedBootstrap,
          playbackSuspended: false,
        },
      );
      if (!updated) return;

      persistentPlayerRef.current = updated;
      setPersistentPlayer(updated);
      return;
    }

    const updated = retry
      ? {
          ...current,
          playerProps: {
            ...current.playerProps,
            playbackBootstrap: null,
            playbackBootstrapPending: true,
            playbackAccessError: null,
            playbackUnavailableMessage: null,
            playbackSuspended: true,
          },
        }
      : applyPersistentMiniPlayerLessonChange(current, lessonNumber, {
          playbackBootstrap: null,
          playbackSuspended: true,
        });
    if (!updated) return;

    persistentPlayerRef.current = updated;
    setPersistentPlayer(updated);

    void getVideoPlaybackBootstrap({ courseSlug, lessonNumber })
      .then((bootstrap) => {
        if (selectLessonTokenRef.current !== token) return;
        const active = persistentPlayerRef.current;
        if (
          !active ||
          active.selectedLesson !== lessonNumber ||
          playerPresentationRef.current !== "mini"
        ) {
          return;
        }

        const withBootstrap: PersistentLearningPlayerRegistration = {
          ...active,
          playerProps: {
            ...active.playerProps,
            playbackBootstrap: bootstrap,
            playbackBootstrapPending: false,
            playbackAccessError: null,
            playbackUnavailableMessage: null,
            playbackSuspended: false,
            refreshPlaybackToken: () =>
              refreshVideoPlaybackToken({ courseSlug, lessonNumber }),
          },
        };
        persistentPlayerRef.current = withBootstrap;
        setPersistentPlayer(withBootstrap);
      })
      .catch((error: unknown) => {
        if (selectLessonTokenRef.current !== token) return;
        const active = persistentPlayerRef.current;
        if (!active || active.selectedLesson !== lessonNumber) return;

        const bootstrapError =
          error instanceof VideoPlaybackBootstrapError ? error : null;
        const playbackAccessError =
          bootstrapError?.status === 401 ||
          bootstrapError?.code === "UNAUTHORIZED" ||
          bootstrapError?.code === "MFA_REQUIRED"
            ? {
                kind: "login" as const,
                message: "Log in to access the lesson.",
                actionLabel: "Log in",
                onAction: openPersistentPlayerLogin,
              }
            : bootstrapError?.status === 403
              ? {
                  kind: "access" as const,
                  message: "Get access to this course to watch this lesson.",
                  actionLabel: "Get access",
                  onAction: openPersistentPlayerCourseOverview,
                }
              : {
                  kind: "retry" as const,
                  message: "We couldn't prepare this video.",
                  actionLabel: "Retry",
                  onAction: () =>
                    selectPersistentMiniPlayerLessonRef.current(lessonNumber, {
                      retry: true,
                    }),
                };

        const withError: PersistentLearningPlayerRegistration = {
          ...active,
          playerProps: {
            ...active.playerProps,
            playbackBootstrapPending: false,
            playbackAccessError,
            playbackUnavailableMessage:
              playbackAccessError.kind === "retry"
                ? (bootstrapError?.message ?? "Unable to prepare this video.")
                : null,
            playbackSuspended: false,
          },
        };
        persistentPlayerRef.current = withError;
        setPersistentPlayer(withError);
      });
  };

  const selectPersistentMiniPlayerLesson = useCallback(
    (lessonNumber: number) => {
      selectPersistentMiniPlayerLessonRef.current(lessonNumber);
    },
    [],
  );
  const retryPersistentMiniPlayerPlayback = useCallback(() => {
    const current = persistentPlayerRef.current;
    if (!current || current.selectedLesson === undefined) return;
    selectPersistentMiniPlayerLessonRef.current(current.selectedLesson, {
      retry: true,
    });
  }, []);

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
        isDesktopLearningMinimizeViewport() ? "0px" : `${offsetY.toFixed(3)}px`,
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
      if (isDesktopLearningMinimizeViewport()) {
        // Desktop motion is always a timed settle, so the page behind the
        // player gets one CSS opacity transition instead of a value written
        // on every frame. The compositor runs it, nothing is measured, and
        // the stage's custom properties (which restyle the whole app when
        // they change) are written once.
        learningMotionOffsetYRef.current = toOffsetY;
        learningMotionViewportHeightRef.current = viewportHeight;
        if (forceMount) mountLearningBackground();
        const motionStage = learningMotionStageRef.current;
        if (motionStage) {
          motionStage.style.setProperty(
            "--learning-background-reveal-duration",
            `${LEARNING_PLAYER_MOTION_DURATION_MS}ms`,
          );
          // Minimizing reveals the page behind the player; restoring and
          // settling back cover it again.
          motionStage.style.setProperty(
            "--learning-background-reveal",
            toOffsetY > fromOffsetY ? "1" : "0",
          );
          motionStage.dataset.learningPlayerMotion = phase;
        }
        surfaceMotionTimerRef.current = window.setTimeout(() => {
          if (surfaceMotionVersionRef.current !== version) return;
          surfaceMotionTimerRef.current = null;
          onComplete?.();
        }, LEARNING_PLAYER_MOTION_DURATION_MS + 80);
        return;
      }

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
    [
      applyLearningSurfaceMotion,
      cancelLearningSurfaceMotion,
      mountLearningBackground,
    ],
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

  commitPersistentPlayerRestoreRef.current = commitPersistentPlayerRestore;

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
        // Idle with the full player showing also ends any restore that was
        // still winding down.
        restoringPlayerRef.current = false;
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
    // The lesson page counts as "already here" while it is still the page
    // on screen, even if a navigation away from it has been requested: a
    // minimize asks to leave, and an expand right behind it cancels that
    // before the route ever changes. Without this the route never changes,
    // so nothing would switch the player back to the page.
    const alreadyOnLearningRoute =
      isLearningRoutePath(locationPathRef.current) ||
      isLearningRoutePath(renderedLocationPathRef.current);
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

  const onLearningRoute = route.kind === "learning";
  const learningBackgroundSurface =
    onLearningRoute && learningBackgroundMounted
      ? resolveLearningBackgroundSurface(learningReturnLocation.path)
      : null;
  const learningBackground = learningBackgroundSurface
    ? {
        ...learningBackgroundSurface,
        scrollLeft: learningReturnLocation.left,
        scrollTop: learningReturnLocation.top,
      }
    : null;
  // While a lesson fills the screen the shell keeps pointing at the page the
  // player was opened from.
  const learningOriginSection =
    onLearningRoute &&
    workspaceNavigationItems.some(
      ([label]) => label === learningReturnLocation.section,
    )
      ? learningReturnLocation.section
      : null;
  const learningOriginPage =
    onLearningRoute && isSettingsPath(learningReturnLocation.path)
      ? "settings"
      : null;

  return (
    <AcademyRouteGuard>
      <CoursesPage
        cataloguePathname={location.pathname}
        routeCatalogueEnrollmentFilter={getStudentCatalogueEnrollmentFilterFromPath(
          learningBackground?.pathname ?? location.pathname,
        )}
        initialPublishedCoursePage={staticCourseRouteData?.publishedCoursePage}
        initialPublishedCoursePageNeedsRefresh={
          staticCourseRouteData?.publishedCoursePageNeedsRefresh
        }
        initialCourseOverview={staticCourseRouteData?.courseOverview}
        initialGuestHomePage={staticCourseRouteData?.guestHomePage}
        initialGuestHomeCopy={staticCourseRouteData?.guestHomeCopy}
        page={route.page}
        section={activeRouteSection}
        settingsTab={route.settingsTab}
        showPageBackButton={showRouteBackButton}
        discussionTab={route.discussionTab}
        courseSlug={courseSlug}
        quizId={quizId}
        assignmentId={assignmentId}
        username={username}
        couponId={couponId}
        miniPlayerCourseId={resolveMiniPlayerCourseId({
          presentation: playerPresentation,
          persistentCourseRouteKey: persistentPlayer?.courseRouteKey,
          persistentCourseSlug: persistentPlayer?.courseSlug,
          persistentLessonPath: persistentPlayer?.lessonPath,
          miniPlayerCourseSlug: learningMiniPlayer?.courseSlug,
          miniPlayerLessonPath: learningMiniPlayer?.lessonPath,
        })}
        learningBackground={learningBackground}
        learningOriginPage={learningOriginPage}
        learningOriginSection={learningOriginSection}
        learningMotionStageRef={learningMotionStageRef}
        onNavigatePage={navigateTo}
        onNavigateBack={navigateBackToOrigin}
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
        <Suspense fallback={null}>
          <PersistentLearningPlayerHost
            player={persistentPlayer}
            presentation={playerPresentation}
            onClose={closeLearningMiniPlayer}
            onRestore={restoreLearningMiniPlayer}
            onSelectMiniPlayerLesson={selectPersistentMiniPlayerLesson}
            onRetryMiniPlayerPlayback={retryPersistentMiniPlayerPlayback}
            onOpenCourseOverview={openPersistentPlayerCourseOverview}
          />
        </Suspense>
      ) : learningMiniPlayer ? (
        <Suspense fallback={null}>
          <LearningMiniPlayer
            session={learningMiniPlayer}
            onClose={closeLearningMiniPlayer}
            onRestore={restoreLearningMiniPlayer}
            onOpenCourseOverview={openStandaloneMiniPlayerCourseOverview}
          />
        </Suspense>
      ) : null}
      <LoginDialogHost />
    </AcademyRouteGuard>
  );
}
