import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { ToastMessage } from "../../ToastNotification";
import { MOBILE_NAVIGATION_REVEAL_EVENT } from "../../learning/player/mobileNavigationFollow";
import type { ShortcutPlatform } from "../../keyboardShortcuts";
import { useGlobalSearchShortcut } from "../../searchShortcut";
import { useShortcutPlatform } from "../../useShortcutPlatform";
import { getDocumentFullscreenElement } from "../../fullscreen";
import { MOBILE_DRAWER_INITIAL_SNAP_POINT } from "../academyShellConstants";
import type { SidebarTooltip } from "../academyShellTypes";

export interface UseShellMenusStateResult {
  courseMenu: string | null;
  setCourseMenu: Dispatch<SetStateAction<string | null>>;
  profileMenu: boolean;
  setProfileMenu: Dispatch<SetStateAction<boolean>>;
  logoutConfirmOpen: boolean;
  setLogoutConfirmOpen: Dispatch<SetStateAction<boolean>>;
  paletteMenu: boolean;
  setPaletteMenu: Dispatch<SetStateAction<boolean>>;
  paletteMenuSource: "appearance" | "theme";
  setPaletteMenuSource: Dispatch<SetStateAction<"appearance" | "theme">>;
  readingModeMenu: "desktop" | "mobile" | null;
  setReadingModeMenu: Dispatch<SetStateAction<"desktop" | "mobile" | null>>;
  settingsQuickMenu: "desktop" | "mobile" | null;
  setSettingsQuickMenu: Dispatch<SetStateAction<"desktop" | "mobile" | null>>;
  settingsQuickMenuLoaded: boolean;
  setSettingsQuickMenuLoaded: Dispatch<SetStateAction<boolean>>;
  sidebarTooltip: SidebarTooltip | null;
  setSidebarTooltip: Dispatch<SetStateAction<SidebarTooltip | null>>;
  navigationScrollFade: { top: boolean; bottom: boolean; overflow: boolean };
  setNavigationScrollFade: Dispatch<
    SetStateAction<{ top: boolean; bottom: boolean; overflow: boolean }>
  >;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: Dispatch<SetStateAction<boolean>>;
  mobileNavigationSheetMounted: boolean;
  setMobileNavigationSheetMounted: Dispatch<SetStateAction<boolean>>;
  pendingMobileMenuOpen: boolean;
  setPendingMobileMenuOpen: Dispatch<SetStateAction<boolean>>;
  profileMenuSurfaceMounted: boolean;
  setProfileMenuSurfaceMounted: Dispatch<SetStateAction<boolean>>;
  pendingProfileMenuOpen: boolean;
  setPendingProfileMenuOpen: Dispatch<SetStateAction<boolean>>;
  logoutModalMounted: boolean;
  setLogoutModalMounted: Dispatch<SetStateAction<boolean>>;
  mobilePaletteMenu: boolean;
  setMobilePaletteMenu: Dispatch<SetStateAction<boolean>>;
  mobileMenuCollapsedSnapPoint: number;
  setMobileMenuCollapsedSnapPoint: Dispatch<SetStateAction<number>>;
  mobileMenuSnapPoint: string | number | null;
  setMobileMenuSnapPoint: Dispatch<SetStateAction<string | number | null>>;
  mobileBottomNavHidden: boolean;
  setMobileBottomNavHidden: Dispatch<SetStateAction<boolean>>;
  notice: ToastMessage | null;
  setNotice: Dispatch<SetStateAction<ToastMessage | null>>;
  isFullscreen: boolean;
  setIsFullscreen: Dispatch<SetStateAction<boolean>>;
  shortcutPlatform: ShortcutPlatform;
}

export function useShellMenusState(): UseShellMenusStateResult {
  const [courseMenu, setCourseMenu] = useState<string | null>(null);
  const [profileMenu, setProfileMenu] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [paletteMenu, setPaletteMenu] = useState(false);
  const [paletteMenuSource, setPaletteMenuSource] = useState<
    "appearance" | "theme"
  >("theme");
  const [readingModeMenu, setReadingModeMenu] = useState<
    "desktop" | "mobile" | null
  >(null);
  const [settingsQuickMenu, setSettingsQuickMenu] = useState<
    "desktop" | "mobile" | null
  >(null);
  const [settingsQuickMenuLoaded, setSettingsQuickMenuLoaded] = useState(false);
  const [sidebarTooltip, setSidebarTooltip] = useState<SidebarTooltip | null>(
    null,
  );
  const [navigationScrollFade, setNavigationScrollFade] = useState({
    top: false,
    bottom: false,
    overflow: false,
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // The sheet (and the drawer stack it lazy-loads) mounts on the first open
  // request, or ahead of time on idle for compact viewports. Starting false
  // also keeps the first client render identical to the prerender.
  const [mobileNavigationSheetMounted, setMobileNavigationSheetMounted] =
    useState(false);
  const [pendingMobileMenuOpen, setPendingMobileMenuOpen] = useState(false);
  const [profileMenuSurfaceMounted, setProfileMenuSurfaceMounted] =
    useState(false);
  const [pendingProfileMenuOpen, setPendingProfileMenuOpen] = useState(false);
  const [logoutModalMounted, setLogoutModalMounted] = useState(false);
  const [mobilePaletteMenu, setMobilePaletteMenu] = useState(false);
  const [mobileMenuCollapsedSnapPoint, setMobileMenuCollapsedSnapPoint] =
    useState(MOBILE_DRAWER_INITIAL_SNAP_POINT);
  const [mobileMenuSnapPoint, setMobileMenuSnapPoint] = useState<
    number | string | null
  >(MOBILE_DRAWER_INITIAL_SNAP_POINT);
  const [mobileBottomNavHidden, setMobileBottomNavHidden] = useState(false);
  // The lesson player asks for the bottom menu when it is minimized: its
  // mini window rests on the menu.
  useEffect(() => {
    const reveal = () => setMobileBottomNavHidden(false);
    window.addEventListener(MOBILE_NAVIGATION_REVEAL_EVENT, reveal);
    return () =>
      window.removeEventListener(MOBILE_NAVIGATION_REVEAL_EVENT, reveal);
  }, []);
  const [notice, setNotice] = useState<ToastMessage | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(() =>
    typeof document === "undefined"
      ? false
      : Boolean(getDocumentFullscreenElement(document)),
  );
  const shortcutPlatform = useShortcutPlatform();
  useGlobalSearchShortcut(shortcutPlatform);
  return {
    courseMenu,
    setCourseMenu,
    profileMenu,
    setProfileMenu,
    logoutConfirmOpen,
    setLogoutConfirmOpen,
    paletteMenu,
    setPaletteMenu,
    paletteMenuSource,
    setPaletteMenuSource,
    readingModeMenu,
    setReadingModeMenu,
    settingsQuickMenu,
    setSettingsQuickMenu,
    settingsQuickMenuLoaded,
    setSettingsQuickMenuLoaded,
    sidebarTooltip,
    setSidebarTooltip,
    navigationScrollFade,
    setNavigationScrollFade,
    mobileMenuOpen,
    setMobileMenuOpen,
    mobileNavigationSheetMounted,
    setMobileNavigationSheetMounted,
    pendingMobileMenuOpen,
    setPendingMobileMenuOpen,
    profileMenuSurfaceMounted,
    setProfileMenuSurfaceMounted,
    pendingProfileMenuOpen,
    setPendingProfileMenuOpen,
    logoutModalMounted,
    setLogoutModalMounted,
    mobilePaletteMenu,
    setMobilePaletteMenu,
    mobileMenuCollapsedSnapPoint,
    setMobileMenuCollapsedSnapPoint,
    mobileMenuSnapPoint,
    setMobileMenuSnapPoint,
    mobileBottomNavHidden,
    setMobileBottomNavHidden,
    notice,
    setNotice,
    isFullscreen,
    setIsFullscreen,
    shortcutPlatform,
  };
}
