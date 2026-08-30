import type { SidebarMode } from "../settings/settingsPreferences";

export const SIDEBAR_RESPONSIVE_COLLAPSE_QUERY = "(max-width: 1080px)";
export const COMPACT_NAVIGATION_QUERY = "(max-width: 820px)";

export interface SidebarPresentation {
  collapsed: boolean;
  hidden: boolean;
}

export const getSidebarPresentation = (
  mode: SidebarMode,
): SidebarPresentation => ({
  collapsed: mode === "collapsed",
  hidden: mode === "hidden",
});

export const getResponsiveSidebarMode = (
  currentMode: SidebarMode,
  compactSidebar: boolean,
): SidebarMode => {
  if (currentMode === "hidden") return currentMode;
  return compactSidebar ? "collapsed" : "expanded";
};

export const canStartSidebarTouchGesture = ({
  compactNavigation,
  enabled = true,
  hidden,
  isPrimary,
  pointerType,
}: {
  compactNavigation: boolean;
  enabled?: boolean;
  hidden: boolean;
  isPrimary: boolean;
  pointerType: string;
}) =>
  enabled &&
  pointerType === "touch" &&
  isPrimary &&
  (!compactNavigation || hidden);
