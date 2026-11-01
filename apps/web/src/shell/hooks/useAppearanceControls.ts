import {
  useCallback,
  useEffect,
  useLayoutEffect,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { ToastMessage } from "../../ToastNotification";
import { useEmptyAreaDoubleTap } from "../../gestures/useEmptyAreaDoubleTap";
import {
  applyRootPalette,
  applyWithThemeViewTransition,
} from "../themeViewTransition";
import { ensureAcademyPaletteStylesheets } from "../academyPaletteStyles";
import type { ThemeRevealOrigin } from "../themeViewTransition";
import {
  canToggleDocumentFullscreen,
  getDocumentFullscreenElement,
  toggleDocumentFullscreen,
} from "../../fullscreen";
import {
  persistReadingModePreferences,
  readReadingModePreferences,
  type ReadingModeColors,
} from "../../reading-mode/readingModePreferences";
import type { ReadingModePreferences } from "../../reading-mode/readingModePreferences";
import type { ThemePreference } from "../academyShellTypes";

export interface UseAppearanceControlsArgs {
  sidebarWidth: number;
  sidebarResizePreviewWidth: number | null;
  setTheme: Dispatch<SetStateAction<ThemePreference>>;
  resolvedTheme: "light" | "dark";
  setAcademyTheme: Dispatch<SetStateAction<string>>;
  setAppliedAcademyTheme: Dispatch<SetStateAction<string>>;
  setPalettePreviewTheme: Dispatch<SetStateAction<string | null>>;
  displayedAcademyTheme: string;
  setReadingModePreferences: Dispatch<
    SetStateAction<{
      enabled: boolean;
      colorTemperature: number;
      texture: number;
      textureGrainSize: number;
      colors: ReadingModeColors;
    }>
  >;
  setProfileMenu: Dispatch<SetStateAction<boolean>>;
  setPaletteMenu: Dispatch<SetStateAction<boolean>>;
  readingModeMenu: "desktop" | "mobile" | null;
  setReadingModeMenu: Dispatch<SetStateAction<"desktop" | "mobile" | null>>;
  setSettingsQuickMenu: Dispatch<SetStateAction<"desktop" | "mobile" | null>>;
  settingsQuickMenu: "desktop" | "mobile" | null;
  setSettingsQuickMenuLoaded: Dispatch<SetStateAction<boolean>>;
  setMobilePaletteMenu: Dispatch<SetStateAction<boolean>>;
  setNotice: Dispatch<SetStateAction<ToastMessage | null>>;
  isFullscreen: boolean;
  setIsFullscreen: Dispatch<SetStateAction<boolean>>;
  appliedPaletteRef: RefObject<string | null>;
  paletteStyleRequestRef: RefObject<number>;
  themeRevealOriginRef: RefObject<ThemeRevealOrigin | null>;
  revertPalettePreviewRef: RefObject<
    ((origin?: ThemeRevealOrigin) => void) | null
  >;
  appearanceControlsRef: RefObject<HTMLDivElement | null>;
  appearanceControlRectsRef: RefObject<DOMRect[]>;
  appearanceLayoutRef: RefObject<boolean | null>;
  appearanceAnimationsRef: RefObject<Animation[]>;
  toggleAppearanceRef: RefObject<(() => void) | null>;
  appearanceSwipeConsumedRef: RefObject<boolean>;
  dockLongPressConsumedUntilRef: RefObject<number>;
  appearanceControlsHorizontal: boolean;
}

export interface UseAppearanceControlsResult {
  changeAppearanceMode: (
    mode: "light" | "dark",
    origin?: ThemeRevealOrigin,
  ) => void;
  updateReadingMode: (preferences: Partial<ReadingModePreferences>) => void;
  showReadingModeMenu: (mobile?: boolean) => void;
  showSettingsQuickMenu: (mobile?: boolean) => void;
  openSettingsQuickMenu: (
    event: ReactMouseEvent<HTMLButtonElement>,
    mobile?: boolean,
  ) => void;
  openReadingModeMenu: (
    event: ReactMouseEvent<HTMLButtonElement>,
    mobile?: boolean,
  ) => void;
  fullscreenActionLabel: "Exit fullscreen" | "Fullscreen";
  toggleFullscreen: () => Promise<void>;
  emptyAreaDoubleTapHandlers: {
    onClick: (event: ReactMouseEvent<HTMLElement>) => void;
    onMouseDown: (event: ReactMouseEvent<HTMLElement>) => void;
  };
  consumeAppearanceGestureClick: (
    event: ReactMouseEvent<HTMLElement>,
  ) => boolean;
  commitPalette: (nextTheme: string) => void;
  changePalette: (nextTheme: string, origin?: ThemeRevealOrigin) => void;
}

export function useAppearanceControls({
  sidebarWidth,
  sidebarResizePreviewWidth,
  setTheme,
  resolvedTheme,
  setAcademyTheme,
  setAppliedAcademyTheme,
  setPalettePreviewTheme,
  displayedAcademyTheme,
  setReadingModePreferences,
  setProfileMenu,
  setPaletteMenu,
  readingModeMenu,
  setReadingModeMenu,
  setSettingsQuickMenu,
  settingsQuickMenu,
  setSettingsQuickMenuLoaded,
  setMobilePaletteMenu,
  setNotice,
  isFullscreen,
  setIsFullscreen,
  appliedPaletteRef,
  paletteStyleRequestRef,
  themeRevealOriginRef,
  revertPalettePreviewRef,
  appearanceControlsRef,
  appearanceControlRectsRef,
  appearanceLayoutRef,
  appearanceAnimationsRef,
  toggleAppearanceRef,
  appearanceSwipeConsumedRef,
  dockLongPressConsumedUntilRef,
  appearanceControlsHorizontal,
}: UseAppearanceControlsArgs): UseAppearanceControlsResult {
  useLayoutEffect(() => {
    const group = appearanceControlsRef.current;
    if (!group) return;

    // The prerendered document always carries the expanded (horizontal) dock
    // class, and hydration does not patch a mismatched className. The head
    // bootstrap script corrects it before first paint; this keeps the DOM in
    // step with React wherever that script did not run.
    group.classList.toggle(
      "sidebar-appearance--horizontal",
      appearanceControlsHorizontal,
    );
    group.classList.toggle(
      "sidebar-appearance--vertical",
      !appearanceControlsHorizontal,
    );

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
  }, [
    appearanceControlsHorizontal,
    sidebarResizePreviewWidth,
    sidebarWidth,
    appearanceAnimationsRef,
    appearanceControlRectsRef,
    appearanceControlsRef,
    appearanceLayoutRef,
  ]);

  useEffect(
    () => () => {
      appearanceAnimationsRef.current.forEach((animation) =>
        animation.cancel(),
      );
    },
    [appearanceAnimationsRef],
  );

  // Shift+D. It only switches between light and dark: an open colour menu
  // stays open (and keeps the theme it is previewing), so the switch is seen
  // happening behind it; only Escape or a click outside closes it.
  const toggleAppearance = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };
  toggleAppearanceRef.current = toggleAppearance;
  // The light/dark switch in the colour theme menu leaves the menu open.
  const changeAppearanceMode = (
    mode: "light" | "dark",
    origin?: ThemeRevealOrigin,
  ) => {
    themeRevealOriginRef.current = origin ?? null;
    // Against the mode last asked for rather than `resolvedTheme`, which
    // follows a moment after the reveal starts (useShellLayoutEffects): a
    // quick press back to the other side would have been ignored.
    setTheme((current) =>
      current === mode || (current === "device" && mode === resolvedTheme)
        ? current
        : mode,
    );
  };
  const updateReadingMode = (preferences: Partial<ReadingModePreferences>) => {
    const next = persistReadingModePreferences({
      ...readReadingModePreferences(),
      ...preferences,
    });
    setReadingModePreferences(next);
  };
  const showReadingModeMenu = (mobile = false) => {
    revertPalettePreviewRef.current?.();
    setProfileMenu(false);
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
  }, [setNotice, setIsFullscreen]);
  const emptyAreaDoubleTapHandlers = useEmptyAreaDoubleTap(
    () => void toggleFullscreen(),
  );

  useEffect(() => {
    // The app's own full screen (the root); a video put full screen does
    // not re-render the shell.
    const syncFullscreenState = () =>
      setIsFullscreen(
        getDocumentFullscreenElement(document) === document.documentElement,
      );
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
  }, [toggleFullscreen, setIsFullscreen]);
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
  return {
    changeAppearanceMode,
    updateReadingMode,
    showReadingModeMenu,
    showSettingsQuickMenu,
    openSettingsQuickMenu,
    openReadingModeMenu,
    fullscreenActionLabel,
    toggleFullscreen,
    emptyAreaDoubleTapHandlers,
    consumeAppearanceGestureClick,
    commitPalette,
    changePalette,
  };
}
