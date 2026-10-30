import type { Dispatch, SetStateAction, RefObject } from "react";
import {
  rememberSettingsTab,
  type SettingsTab,
} from "../../routing/tabSessionState";
import { getNavigationDestination } from "../navigation";
import type { NavigationItemWithMetadata } from "../navigation";
import type { NavigateTo } from "../../routing/navigation";
import type { DrawerDismissThen } from "@/components/ui/drawer";
import { getLearningMobileMenuSnapPoint } from "../academyShellGeometry";

export interface UseMobileMenuActionsArgs {
  onExitSettings: (() => void) | undefined;
  onNavigatePage: NavigateTo;
  page: string;
  setEdgeSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setProfileMenu: Dispatch<SetStateAction<boolean>>;
  setReadingModeMenu: Dispatch<SetStateAction<"desktop" | "mobile" | null>>;
  setSettingsQuickMenu: Dispatch<SetStateAction<"desktop" | "mobile" | null>>;
  settingsQuickMenu: "desktop" | "mobile" | null;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: Dispatch<SetStateAction<boolean>>;
  mobileNavigationSheetMounted: boolean;
  setMobileNavigationSheetMounted: Dispatch<SetStateAction<boolean>>;
  setPendingMobileMenuOpen: Dispatch<SetStateAction<boolean>>;
  setMobilePaletteMenu: Dispatch<SetStateAction<boolean>>;
  setMobileMenuCollapsedSnapPoint: Dispatch<SetStateAction<number>>;
  setMobileMenuSnapPoint: Dispatch<SetStateAction<string | number | null>>;
  mobileMenuDismissThenRef: RefObject<DrawerDismissThen | null>;
  dismissSettingsQuickMenuThen: (afterDismiss: () => void) => void;
  toggleSettingsNavigationRef: RefObject<(() => void) | null>;
  isLearningSurface: boolean;
  mobileMenuContentSnapPoint: number;
}

export interface UseMobileMenuActionsResult {
  closeMobileMenu: () => void;
  openMobileNavigationMenu: () => void;
  dismissMobileMenuThen: (action: () => void) => void;
  selectNavigation: (label: string, item?: NavigationItemWithMetadata) => void;
  toggleSettingsNavigation: () => void;
  navigateSettingsQuickMenu: (tab: SettingsTab) => void;
}

export function useMobileMenuActions({
  onExitSettings,
  onNavigatePage,
  page,
  setEdgeSidebarOpen,
  setProfileMenu,
  setReadingModeMenu,
  setSettingsQuickMenu,
  settingsQuickMenu,
  mobileMenuOpen,
  setMobileMenuOpen,
  mobileNavigationSheetMounted,
  setMobileNavigationSheetMounted,
  setPendingMobileMenuOpen,
  setMobilePaletteMenu,
  setMobileMenuCollapsedSnapPoint,
  setMobileMenuSnapPoint,
  mobileMenuDismissThenRef,
  dismissSettingsQuickMenuThen,
  toggleSettingsNavigationRef,
  isLearningSurface,
  mobileMenuContentSnapPoint,
}: UseMobileMenuActionsArgs): UseMobileMenuActionsResult {
  const closeMobileMenu = () => {
    setPendingMobileMenuOpen(false);
    setMobileMenuOpen(false);
    setProfileMenu(false);
    setMobilePaletteMenu(false);
    setSettingsQuickMenu((current) => (current === "mobile" ? null : current));
    setReadingModeMenu((current) => (current === "mobile" ? null : current));
  };

  const openMobileNavigationMenu = () => {
    const nextSnapPoint = isLearningSurface
      ? Math.max(getLearningMobileMenuSnapPoint(), mobileMenuContentSnapPoint)
      : mobileMenuContentSnapPoint;
    setMobilePaletteMenu(false);
    setMobileMenuCollapsedSnapPoint(nextSnapPoint);
    setMobileMenuSnapPoint(nextSnapPoint);
    if (!mobileNavigationSheetMounted) {
      // The drawer must commit once in its closed state before it can run an
      // open transition; mounting it directly with open=true makes Base UI
      // dismiss itself. Mount first, then the pending-open effect opens it.
      setMobileNavigationSheetMounted(true);
      setPendingMobileMenuOpen(true);
      return;
    }
    setMobileMenuOpen(true);
  };
  const dismissMobileMenuThen = (action: () => void) => {
    if (mobileMenuOpen && mobileMenuDismissThenRef.current) {
      mobileMenuDismissThenRef.current(action);
      return;
    }
    closeMobileMenu();
    action();
  };

  const selectNavigation = (
    label: string,
    item?: NavigationItemWithMetadata,
  ) => {
    setEdgeSidebarOpen(false);
    dismissMobileMenuThen(() => {
      onNavigatePage?.(getNavigationDestination(item ?? label));
    });
  };

  const toggleSettingsNavigation = () => {
    setSettingsQuickMenu(null);
    if (page !== "settings") {
      selectNavigation("Settings");
      return;
    }

    setEdgeSidebarOpen(false);
    dismissMobileMenuThen(() => onExitSettings?.());
  };
  toggleSettingsNavigationRef.current = toggleSettingsNavigation;

  const navigateSettingsQuickMenu = (tab: SettingsTab) => {
    const surface = settingsQuickMenu;
    rememberSettingsTab(tab);
    const navigate = () =>
      onNavigatePage?.(`/settings/${tab}`, { resetScroll: true });
    dismissSettingsQuickMenuThen(() => {
      if (surface === "mobile") {
        setEdgeSidebarOpen(false);
        dismissMobileMenuThen(navigate);
      } else {
        navigate();
      }
    });
  };
  return {
    closeMobileMenu,
    openMobileNavigationMenu,
    dismissMobileMenuThen,
    selectNavigation,
    toggleSettingsNavigation,
    navigateSettingsQuickMenu,
  };
}
