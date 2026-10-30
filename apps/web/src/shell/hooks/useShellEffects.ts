import {
  useEffect,
  useLayoutEffect,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import type { QueryClient } from "@tanstack/react-query";
import type {
  CourseEnrollmentFilter,
  CourseRole,
  CourseStatusFilter,
} from "../../courses/catalogue";
import { prefetchGuestHomePage } from "../../services/home";
import { guestHomeBody } from "../../routing/prerenderedBodies";
import {
  resolveWorkspaceRole,
  getWorkspaceRoleStorageKey,
} from "../workspaceRole";
import { setLearnerView } from "../../lib/learner-view";
import { courseKeys } from "../../services/courses";
import { learningProgressKeys } from "../../services/learning-progress";
import { mediaKeys } from "../../services/media";
import { clampSidebarWidth } from "../sidebarPreferences";
import {
  installPhoneVideoFullscreenHold,
  watchLayoutQuery,
} from "../phoneVideoFullscreenHold";
import {
  COMPACT_NAVIGATION_QUERY,
  getResponsiveSidebarMode,
  SIDEBAR_RESPONSIVE_COLLAPSE_QUERY,
} from "../sidebarVisibility";
import {
  readApplicationScrollPosition,
  scrollApplicationTo,
} from "../applicationScroll";
import type {
  PageTabColors,
  SidebarMode,
  SidebarPreferences,
} from "../../settings/settingsPreferences";
import {
  applySidebarGlowShapeSize,
  normalizeSidebarGlow,
  normalizeSidebarGlowBlur,
  normalizeSidebarGlowShape,
  normalizeSidebarGlowIntensity,
  PAGE_TAB_COLORS_KEY,
} from "../../settings/settingsPreferences";
import type { NavigateTo } from "../../routing/navigation";
import {
  readReadingModePreferences,
  READING_MODE_CHANGE_EVENT,
  type ReadingModeColors,
} from "../../reading-mode/readingModePreferences";
import {
  loadProfileMenuModule,
  loadMobileMenuDrawerModule,
} from "../academyLazyPages";
import type { AuthUser } from "../../store/auth.store";

export interface UseShellEffectsArgs {
  onNavigatePage: NavigateTo;
  page: string;
  requestedSection: string | null;
  queryClient: QueryClient;
  role: CourseRole;
  setRole: Dispatch<SetStateAction<CourseRole>>;
  setSidebarMode: Dispatch<SetStateAction<SidebarMode>>;
  sidebarMode: SidebarMode;
  setSidebarWidth: Dispatch<SetStateAction<number>>;
  sidebarShellHydratedRef: RefObject<boolean>;
  setCompactNavigation: Dispatch<SetStateAction<boolean>>;
  setCoarseNavigationInput: Dispatch<SetStateAction<boolean>>;
  setEdgeSidebarOpen: Dispatch<SetStateAction<boolean>>;
  sidebarPreferences: SidebarPreferences;
  pageTabColors: PageTabColors;
  sidebarMaxWidth: number;
  setReadingModePreferences: Dispatch<
    SetStateAction<{
      enabled: boolean;
      colorTemperature: number;
      texture: number;
      textureGrainSize: number;
      colors: ReadingModeColors;
    }>
  >;
  setActiveSection: Dispatch<SetStateAction<string>>;
  setCreatorEnrollmentFilter: Dispatch<SetStateAction<CourseEnrollmentFilter>>;
  setStatusFilter: Dispatch<SetStateAction<CourseStatusFilter>>;
  filterOwnerRef: RefObject<string | null>;
  storedPreferencesReady: boolean;
  setCourseMenu: Dispatch<SetStateAction<string | null>>;
  profileMenu: boolean;
  setProfileMenu: Dispatch<SetStateAction<boolean>>;
  logoutConfirmOpen: boolean;
  setMobileMenuOpen: Dispatch<SetStateAction<boolean>>;
  mobileNavigationSheetMounted: boolean;
  pendingMobileMenuOpen: boolean;
  setPendingMobileMenuOpen: Dispatch<SetStateAction<boolean>>;
  profileMenuSurfaceMounted: boolean;
  setProfileMenuSurfaceMounted: Dispatch<SetStateAction<boolean>>;
  pendingProfileMenuOpen: boolean;
  setPendingProfileMenuOpen: Dispatch<SetStateAction<boolean>>;
  setLogoutModalMounted: Dispatch<SetStateAction<boolean>>;
  authUserFetched: boolean;
  activeUser: AuthUser | null | undefined;
  isAuthenticated: boolean;
  userRoles: readonly string[] | undefined;
  isAdmin: boolean;
  canSwitchWorkspace: boolean;
  effectiveRole: CourseRole;
  isWorkspaceRoleHydrated: boolean;
  navigationRef: RefObject<HTMLElement | null>;
}

export function useShellEffects({
  onNavigatePage,
  page,
  requestedSection,
  queryClient,
  role,
  setRole,
  setSidebarMode,
  sidebarMode,
  setSidebarWidth,
  sidebarShellHydratedRef,
  setCompactNavigation,
  setCoarseNavigationInput,
  setEdgeSidebarOpen,
  sidebarPreferences,
  pageTabColors,
  sidebarMaxWidth,
  setReadingModePreferences,
  setActiveSection,
  setCreatorEnrollmentFilter,
  setStatusFilter,
  filterOwnerRef,
  storedPreferencesReady,
  setCourseMenu,
  profileMenu,
  setProfileMenu,
  logoutConfirmOpen,
  setMobileMenuOpen,
  mobileNavigationSheetMounted,
  pendingMobileMenuOpen,
  setPendingMobileMenuOpen,
  profileMenuSurfaceMounted,
  setProfileMenuSurfaceMounted,
  pendingProfileMenuOpen,
  setPendingProfileMenuOpen,
  setLogoutModalMounted,
  authUserFetched,
  activeUser,
  isAuthenticated,
  userRoles,
  isAdmin,
  canSwitchWorkspace,
  effectiveRole,
  isWorkspaceRoleHydrated,
  navigationRef,
}: UseShellEffectsArgs) {
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
    root.dataset.sidebarIconStyle = next.iconStyle || "multicolor";
    root.dataset.sidebarMonochromeMode = next.monochromeMode || "theme";
    root.dataset.contentLayout = nextContentLayout;
    root.dataset.sidebarHeaderLayout = "inline";
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
  }, [setReadingModePreferences]);

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
  }, [sidebarMaxWidth, storedPreferencesReady, setSidebarWidth]);

  useEffect(() => {
    const nextRole = resolveWorkspaceRole(userRoles, role);
    if (nextRole !== role) {
      setRole(nextRole);
    }
  }, [role, userRoles, setRole]);

  // An account that manages courses is answered by the API as a learner
  // while it is in its Student view (see `lib/learner-view`). What was
  // fetched under the other view lists and numbers lessons differently, so
  // it is fetched again when the view changes.
  useEffect(() => {
    if (!isWorkspaceRoleHydrated) return;
    const learnerView =
      isAuthenticated && canSwitchWorkspace && effectiveRole === "student";
    if (!setLearnerView(learnerView)) return;
    void queryClient.invalidateQueries({ queryKey: courseKeys.overviews() });
    void queryClient.invalidateQueries({ queryKey: learningProgressKeys.all });
    void queryClient.invalidateQueries({ queryKey: mediaKeys.all });
  }, [
    canSwitchWorkspace,
    effectiveRole,
    isAuthenticated,
    isWorkspaceRoleHydrated,
    queryClient,
  ]);

  useEffect(() => {
    if (!storedPreferencesReady || !authUserFetched || !isWorkspaceRoleHydrated)
      return;
    localStorage.setItem(getWorkspaceRoleStorageKey(activeUser?.id), role);
    setCourseMenu(null);
    // The list filters belong to an account in one workspace view. They are
    // cleared when that changes, not when the creator opens the course
    // editor and comes back.
    const filterOwner = `${activeUser?.id ?? ""}|${role}|${effectiveRole}`;
    if (filterOwnerRef.current !== filterOwner) {
      filterOwnerRef.current = filterOwner;
      setCreatorEnrollmentFilter("all");
      setStatusFilter("all");
    }
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
    filterOwnerRef,
    setActiveSection,
    setCourseMenu,
    setCreatorEnrollmentFilter,
    setStatusFilter,
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
  }, [
    sidebarMode,
    storedPreferencesReady,
    navigationRef,
    setEdgeSidebarOpen,
    sidebarShellHydratedRef,
  ]);

  useEffect(() => {
    if (!storedPreferencesReady) return undefined;
    const media = window.matchMedia(SIDEBAR_RESPONSIVE_COLLAPSE_QUERY);
    let releaseTransitionFrame: number | null = null;
    const applyResponsiveSidebarMode = () => {
      document.documentElement.dataset.responsiveSidebarSwitching = "true";
      if (releaseTransitionFrame !== null) {
        window.cancelAnimationFrame(releaseTransitionFrame);
      }
      setSidebarMode((currentMode) =>
        getResponsiveSidebarMode(currentMode, media.matches),
      );
      releaseTransitionFrame = window.requestAnimationFrame(() => {
        releaseTransitionFrame = window.requestAnimationFrame(() => {
          delete document.documentElement.dataset.responsiveSidebarSwitching;
          releaseTransitionFrame = null;
        });
      });
    };

    // Not while a phone plays a video full screen sideways (see
    // phoneVideoFullscreenHold): the viewer's sidebar mode would change.
    const stopWatching = watchLayoutQuery(media, applyResponsiveSidebarMode);
    return () => {
      stopWatching();
      if (releaseTransitionFrame !== null) {
        window.cancelAnimationFrame(releaseTransitionFrame);
      }
      delete document.documentElement.dataset.responsiveSidebarSwitching;
    };
  }, [storedPreferencesReady, setSidebarMode]);

  // Layout effect so the real navigation mode is applied in the same frame
  // as hydration: the first render pass must use the prerendered "wide"
  // markup (see the compactNavigation state above), and painting that markup
  // on a phone would flash the wrong controls for a frame.
  useLayoutEffect(() => {
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
    // A phone playing a video full screen sideways keeps the phone layout
    // (see phoneVideoFullscreenHold).
    const stopWatchingWidth = watchLayoutQuery(media, syncNavigationMode);
    const stopWatchingInput = watchLayoutQuery(coarseInput, syncNavigationMode);
    return () => {
      stopWatchingWidth();
      stopWatchingInput();
    };
  }, [setCoarseNavigationInput, setCompactNavigation]);

  useEffect(() => installPhoneVideoFullscreenHold(), []);

  useEffect(() => {
    if (!pendingMobileMenuOpen || !mobileNavigationSheetMounted) {
      return undefined;
    }
    // A tap arrived before the sheet was warmed. Open only after the lazy
    // drawer module has resolved and its closed state has committed (two
    // frames after the Suspense retry), so the open transition runs from a
    // mounted drawer instead of being dismissed during its first mount.
    let cancelled = false;
    void loadMobileMenuDrawerModule().then(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled) return;
          setPendingMobileMenuOpen(false);
          setMobileMenuOpen(true);
        });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    pendingMobileMenuOpen,
    mobileNavigationSheetMounted,
    setMobileMenuOpen,
    setPendingMobileMenuOpen,
  ]);

  useEffect(() => {
    if (!isAuthenticated || profileMenuSurfaceMounted) return undefined;
    if (profileMenu) {
      setProfileMenuSurfaceMounted(true);
      return undefined;
    }
    const mount = () => {
      void loadProfileMenuModule();
      setProfileMenuSurfaceMounted(true);
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(mount, { timeout: 4000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(mount, 2000);
    return () => window.clearTimeout(handle);
  }, [
    isAuthenticated,
    profileMenu,
    profileMenuSurfaceMounted,
    setProfileMenuSurfaceMounted,
  ]);

  useEffect(() => {
    if (!pendingProfileMenuOpen || !profileMenuSurfaceMounted) {
      return undefined;
    }
    // A click arrived before the menu surface was warmed. Open only after
    // the lazy module resolves and the closed menu has committed, so the
    // opening click cannot race the menu's own dismiss listeners.
    let cancelled = false;
    void loadProfileMenuModule().then(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled) return;
          setPendingProfileMenuOpen(false);
          setProfileMenu(true);
        });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    pendingProfileMenuOpen,
    profileMenuSurfaceMounted,
    setPendingProfileMenuOpen,
    setProfileMenu,
  ]);

  useEffect(() => {
    if (!logoutConfirmOpen) return;
    setLogoutModalMounted(true);
    // The signed-out page is put up the moment "Sign out" is pressed. The
    // guest home (where a page that needs a session goes) is fetched while
    // the question is open, so it is ready by then.
    void guestHomeBody.preload();
    void prefetchGuestHomePage(queryClient);
  }, [logoutConfirmOpen, queryClient, setLogoutModalMounted]);
}
