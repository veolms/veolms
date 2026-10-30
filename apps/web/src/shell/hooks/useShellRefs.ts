import {
  useCallback,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import { useScrollingMark } from "../useScrollingMark";
import type { ThemeRevealOrigin } from "../themeViewTransition";
import { useBackDismiss } from "../../navigation/useBackDismiss";
import type { DrawerDismissThen } from "@/components/ui/drawer";
import type { AppearanceOption } from "../academyShellTypes";

export interface UseShellRefsArgs {
  profileMenu: boolean;
  setProfileMenu: Dispatch<SetStateAction<boolean>>;
  setLogoutConfirmOpen: Dispatch<SetStateAction<boolean>>;
  paletteMenu: boolean;
  setPaletteMenu: Dispatch<SetStateAction<boolean>>;
  readingModeMenu: "desktop" | "mobile" | null;
  setReadingModeMenu: Dispatch<SetStateAction<"desktop" | "mobile" | null>>;
  setSettingsQuickMenu: Dispatch<SetStateAction<"desktop" | "mobile" | null>>;
  settingsQuickMenu: "desktop" | "mobile" | null;
  mobilePaletteMenu: boolean;
  setMobilePaletteMenu: Dispatch<SetStateAction<boolean>>;
  mobileMenuCollapsedSnapPoint: number;
}

export interface UseShellRefsResult {
  profileRef: RefObject<HTMLDivElement | null>;
  coursesAppRef: RefObject<HTMLDivElement | null>;
  appliedThemeRef: RefObject<"light" | "dark" | null>;
  appliedPaletteRef: RefObject<string | null>;
  paletteStyleRequestRef: RefObject<number>;
  themeRevealOriginRef: RefObject<ThemeRevealOrigin | null>;
  revertPalettePreviewRef: RefObject<
    ((origin?: ThemeRevealOrigin) => void) | null
  >;
  activateAppearanceOptionRef: RefObject<
    | ((
        option: AppearanceOption,
        mobile?: boolean,
        source?: "appearance" | "theme",
      ) => void)
    | null
  >;
  acknowledgeLongPressRef: RefObject<(() => void) | null>;
  openLogoutConfirm: () => void;
  dismissProfileMenuThen: (afterDismiss: () => void) => void;
  appearanceControlsRef: RefObject<HTMLDivElement | null>;
  appearanceControlRectsRef: RefObject<DOMRect[]>;
  appearanceLayoutRef: RefObject<boolean | null>;
  appearanceAnimationsRef: RefObject<Animation[]>;
  appearanceModeTriggerRef: RefObject<HTMLButtonElement | null>;
  paletteTriggerRef: RefObject<HTMLButtonElement | null>;
  mobileAppearanceModeTriggerRef: RefObject<HTMLButtonElement | null>;
  mobilePaletteTriggerRef: RefObject<HTMLButtonElement | null>;
  navigationRef: RefObject<HTMLElement | null>;
  mainScrollportRef: RefObject<HTMLElement | null>;
  mobileBottomNavRef: RefObject<HTMLElement | null>;
  mobileMoreRef: RefObject<HTMLButtonElement | null>;
  mobileSheetRef: RefObject<HTMLDivElement | null>;
  mobileMenuDismissThenRef: RefObject<DrawerDismissThen | null>;
  dismissSettingsQuickMenuThen: (afterDismiss: () => void) => void;
  toggleSettingsNavigationRef: RefObject<(() => void) | null>;
  toggleAppearanceRef: RefObject<(() => void) | null>;
  mobileMenuSnapPoints: number[];
}

export function useShellRefs({
  profileMenu,
  setProfileMenu,
  setLogoutConfirmOpen,
  paletteMenu,
  setPaletteMenu,
  readingModeMenu,
  setReadingModeMenu,
  setSettingsQuickMenu,
  settingsQuickMenu,
  mobilePaletteMenu,
  setMobilePaletteMenu,
  mobileMenuCollapsedSnapPoint,
}: UseShellRefsArgs): UseShellRefsResult {
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
  // The same for the two handlers the long-press effect calls. They are
  // declared after that effect, further down, and it reached them by name
  // before they existed in the source.
  const activateAppearanceOptionRef = useRef<
    | ((
        option: AppearanceOption,
        mobile?: boolean,
        source?: "appearance" | "theme",
      ) => void)
    | null
  >(null);
  const acknowledgeLongPressRef = useRef<(() => void) | null>(null);
  const openLogoutConfirm = useCallback(() => {
    setProfileMenu(false);
    setLogoutConfirmOpen(true);
  }, [setLogoutConfirmOpen, setProfileMenu]);
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
  useScrollingMark(mainScrollportRef);
  const mobileBottomNavRef = useRef<HTMLElement>(null);
  const mobileMoreRef = useRef<HTMLButtonElement>(null);
  const mobileSheetRef = useRef<HTMLDivElement>(null);
  const mobileMenuDismissThenRef = useRef<DrawerDismissThen>(null);
  const dismissSettingsQuickMenuThen = useBackDismiss({
    open: settingsQuickMenu !== null,
    onDismiss: () => setSettingsQuickMenu(null),
  });
  const toggleSettingsNavigationRef = useRef<(() => void) | null>(null);
  const toggleAppearanceRef = useRef<(() => void) | null>(null);
  const mobileMenuSnapPoints = useMemo(
    () => [mobileMenuCollapsedSnapPoint, 1],
    [mobileMenuCollapsedSnapPoint],
  );
  return {
    profileRef,
    coursesAppRef,
    appliedThemeRef,
    appliedPaletteRef,
    paletteStyleRequestRef,
    themeRevealOriginRef,
    revertPalettePreviewRef,
    activateAppearanceOptionRef,
    acknowledgeLongPressRef,
    openLogoutConfirm,
    dismissProfileMenuThen,
    appearanceControlsRef,
    appearanceControlRectsRef,
    appearanceLayoutRef,
    appearanceAnimationsRef,
    appearanceModeTriggerRef,
    paletteTriggerRef,
    mobileAppearanceModeTriggerRef,
    mobilePaletteTriggerRef,
    navigationRef,
    mainScrollportRef,
    mobileBottomNavRef,
    mobileMoreRef,
    mobileSheetRef,
    mobileMenuDismissThenRef,
    dismissSettingsQuickMenuThen,
    toggleSettingsNavigationRef,
    toggleAppearanceRef,
    mobileMenuSnapPoints,
  };
}
