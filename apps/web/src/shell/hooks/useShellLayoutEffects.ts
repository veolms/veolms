import {
  useEffect,
  useLayoutEffect,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import { subscribeToPointerGestureClaims } from "../../gestures/pointerGestureOwnership";
import type { CourseRole } from "../../courses/catalogue";
import { readSavedWorkspaceView } from "../workspaceRole";
import {
  applySidebarShellToDocument,
  getInitialSidebarPreferences,
  getInitialSidebarShellState,
} from "../sidebarPreferences";
import {
  applyRootPalette,
  applyWithThemeViewTransition,
} from "../themeViewTransition";
import type { ThemeRevealOrigin } from "../themeViewTransition";
import { getInitialAcademyTheme, persistAcademyTheme } from "../../themes";
import {
  persistDisplayMode,
  readInitialDisplayMode,
} from "../../store/appearanceDefaults";
import type {
  PageTabColors,
  SidebarMode,
  SidebarPreferences,
} from "../../settings/settingsPreferences";
import {
  ELEVATED_SURFACES_KEY,
  readPageTabColors,
} from "../../settings/settingsPreferences";
import {
  readReadingModePreferences,
  type ReadingModeColors,
} from "../../reading-mode/readingModePreferences";
import { MOBILE_DRAWER_INITIAL_SNAP_POINT } from "../academyShellConstants";
import type {
  ThemePreference,
  DockLongPress,
  SidebarResize,
} from "../academyShellTypes";
import { getLearningMobileMenuSnapPoint } from "../academyShellGeometry";
import type { AuthUser } from "../../store/auth.store";

export interface UseShellLayoutEffectsArgs {
  setRole: Dispatch<SetStateAction<CourseRole>>;
  setHydratedWorkspaceRoleKey: Dispatch<SetStateAction<string | null>>;
  setSidebarMode: Dispatch<SetStateAction<SidebarMode>>;
  sidebarMode: SidebarMode;
  setSidebarWidth: Dispatch<SetStateAction<number>>;
  sidebarWidth: number;
  sidebarShellHydratedRef: RefObject<boolean>;
  setSidebarResizing: Dispatch<SetStateAction<boolean>>;
  setSidebarResizePreviewWidth: Dispatch<SetStateAction<number | null>>;
  setSidebarOverlaySwipeOffset: Dispatch<SetStateAction<number | null>>;
  compactNavigation: boolean;
  setTheme: Dispatch<SetStateAction<ThemePreference>>;
  theme: ThemePreference;
  setResolvedTheme: Dispatch<SetStateAction<"light" | "dark">>;
  academyTheme: string;
  setAcademyTheme: Dispatch<SetStateAction<string>>;
  setAppliedAcademyTheme: Dispatch<SetStateAction<string>>;
  displayedAcademyTheme: string;
  setSidebarPreferences: Dispatch<SetStateAction<SidebarPreferences>>;
  setPageTabColors: Dispatch<SetStateAction<PageTabColors>>;
  setReadingModePreferences: Dispatch<
    SetStateAction<{
      enabled: boolean;
      colorTemperature: number;
      texture: number;
      textureGrainSize: number;
      colors: ReadingModeColors;
    }>
  >;
  setStoredPreferencesReady: Dispatch<SetStateAction<boolean>>;
  storedPreferencesReady: boolean;
  mobileMenuOpen: boolean;
  setMobileMenuCollapsedSnapPoint: Dispatch<SetStateAction<number>>;
  setMobileMenuSnapPoint: Dispatch<SetStateAction<string | number | null>>;
  authUserFetched: boolean;
  activeUser: AuthUser | null | undefined;
  userRoles: readonly string[] | undefined;
  appliedThemeRef: RefObject<"light" | "dark" | null>;
  appliedPaletteRef: RefObject<string | null>;
  themeRevealOriginRef: RefObject<ThemeRevealOrigin | null>;
  isLearningSurface: boolean;
  mobileMenuContentSnapPoint: number;
  sidebarResizeRef: RefObject<SidebarResize | null>;
  dockLongPressRef: RefObject<DockLongPress | null>;
  longPressAudioContextRef: RefObject<AudioContext | null>;
}

export function useShellLayoutEffects({
  setRole,
  setHydratedWorkspaceRoleKey,
  setSidebarMode,
  sidebarMode,
  setSidebarWidth,
  sidebarWidth,
  sidebarShellHydratedRef,
  setSidebarResizing,
  setSidebarResizePreviewWidth,
  setSidebarOverlaySwipeOffset,
  compactNavigation,
  setTheme,
  theme,
  setResolvedTheme,
  academyTheme,
  setAcademyTheme,
  setAppliedAcademyTheme,
  displayedAcademyTheme,
  setSidebarPreferences,
  setPageTabColors,
  setReadingModePreferences,
  setStoredPreferencesReady,
  storedPreferencesReady,
  mobileMenuOpen,
  setMobileMenuCollapsedSnapPoint,
  setMobileMenuSnapPoint,
  authUserFetched,
  activeUser,
  userRoles,
  appliedThemeRef,
  appliedPaletteRef,
  themeRevealOriginRef,
  isLearningSurface,
  mobileMenuContentSnapPoint,
  sidebarResizeRef,
  dockLongPressRef,
  longPressAudioContextRef,
}: UseShellLayoutEffectsArgs) {
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
    [
      setSidebarOverlaySwipeOffset,
      setSidebarResizePreviewWidth,
      setSidebarResizing,
      sidebarResizeRef,
    ],
  );

  useEffect(() => {
    try {
      const shellState = getInitialSidebarShellState();
      setSidebarMode(shellState.mode);
      setSidebarWidth(shellState.width);
      // The visitor's own mode, or the academy's default.
      setTheme(readInitialDisplayMode());
      setAcademyTheme(getInitialAcademyTheme());
      setSidebarPreferences(getInitialSidebarPreferences());
      setPageTabColors(readPageTabColors());
      setReadingModePreferences(readReadingModePreferences());
    } catch {
      // Deterministic defaults remain usable when storage is unavailable.
    } finally {
      setStoredPreferencesReady(true);
    }
  }, [
    setAcademyTheme,
    setPageTabColors,
    setReadingModePreferences,
    setSidebarMode,
    setSidebarPreferences,
    setSidebarWidth,
    setStoredPreferencesReady,
    setTheme,
  ]);

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
  }, [
    sidebarMode,
    sidebarWidth,
    setSidebarMode,
    setSidebarWidth,
    sidebarShellHydratedRef,
  ]);

  useEffect(() => {
    if (!authUserFetched) return;
    setRole(readSavedWorkspaceView(activeUser?.id, userRoles));
    setHydratedWorkspaceRoleKey(activeUser?.id ?? "guest");
  }, [
    activeUser,
    authUserFetched,
    userRoles,
    setHydratedWorkspaceRoleKey,
    setRole,
  ]);

  useEffect(
    () => () => {
      const press = dockLongPressRef.current;
      if (press) window.clearTimeout(press.timer);
      void longPressAudioContextRef.current?.close();
    },
    [dockLongPressRef, longPressAudioContextRef],
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
      let reveal: ViewTransition | null = null;
      if (appliedThemeRef.current && appliedThemeRef.current !== nextTheme) {
        reveal = applyWithThemeViewTransition(
          commit,
          "mode",
          pointerOrigin ?? undefined,
        );
      } else {
        commit();
      }
      appliedThemeRef.current = nextTheme;
      // The React copy of the mode re-renders the whole shell and page
      // (about 90ms on a lesson page in a production build, several times
      // that in development). Set before the reveal, it ran ahead of the
      // snapshot the reveal starts from, and nothing on screen answered the
      // click until it was done. It is set once the reveal is under way; the
      // colours themselves come from the root attributes `commit` sets.
      const mirrorTheme = () => {
        if (appliedThemeRef.current === nextTheme) setResolvedTheme(nextTheme);
      };
      if (reveal) void reveal.ready.then(mirrorTheme, mirrorTheme);
      else mirrorTheme();
    };
    applyTheme();
    persistDisplayMode(theme);
    if (theme !== "device") return undefined;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [
    storedPreferencesReady,
    theme,
    appliedThemeRef,
    setResolvedTheme,
    themeRevealOriginRef,
  ]);

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
    setMobileMenuCollapsedSnapPoint,
    setMobileMenuSnapPoint,
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
  }, [
    displayedAcademyTheme,
    storedPreferencesReady,
    appliedPaletteRef,
    setAppliedAcademyTheme,
  ]);

  useEffect(() => {
    if (!storedPreferencesReady) return;
    persistAcademyTheme(academyTheme);
  }, [academyTheme, storedPreferencesReady]);
}
