import { getSidebarPresentation } from "../sidebarVisibility";
import type { SidebarMode } from "../../settings/settingsPreferences";
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_DOCK_VERTICAL_MAX_WIDTH,
} from "../academyShellConstants";

export interface UseSidebarPresentationArgs {
  sidebarMode: SidebarMode;
  sidebarWidth: number;
  sidebarResizing: boolean;
  sidebarResizePreviewWidth: number | null;
  compactNavigation: boolean;
  coarseNavigationInput: boolean;
  sidebarShortcutTitle: "⌘+B" | "Ctrl+B";
  showKeyboardShortcuts: boolean;
}

export interface UseSidebarPresentationResult {
  navigationUsesCompactInteraction: boolean;
  renderedSidebarMode: SidebarMode;
  renderedSidebarWidth: number;
  sidebarCollapsed: boolean;
  sidebarHidden: boolean;
  sidebarPresentedAsOverlay: boolean;
  sidebarVisuallyCollapsed: boolean;
  sidebarControlAction:
    | "Close navigation"
    | "Pin navigation"
    | "Expand navigation"
    | "Collapse navigation";
  sidebarControlTitle: string;
  sidebarBrandTitle:
    | "Navigation"
    | "Double-click to pin sidebar"
    | "Double-click to float sidebar";
  appearanceControlsHorizontal: boolean;
}

export function useSidebarPresentation({
  sidebarMode,
  sidebarWidth,
  sidebarResizing,
  sidebarResizePreviewWidth,
  compactNavigation,
  coarseNavigationInput,
  sidebarShortcutTitle,
  showKeyboardShortcuts,
}: UseSidebarPresentationArgs): UseSidebarPresentationResult {
  const navigationUsesCompactInteraction =
    compactNavigation || coarseNavigationInput;
  // The first client render of a prerendered document stays deterministic so
  // hydration can match. SPA fallback and auth-gated remounts run this
  // initializer in the browser and adopt the head bootstrap before paint.
  const renderedSidebarMode = sidebarMode;
  const renderedSidebarWidth = sidebarWidth;
  const { collapsed: sidebarCollapsed, hidden: sidebarHidden } =
    getSidebarPresentation(renderedSidebarMode);
  const sidebarPresentedAsOverlay = sidebarHidden || compactNavigation;
  const sidebarVisuallyCollapsed =
    sidebarCollapsed && !sidebarPresentedAsOverlay;

  const sidebarControlAction = compactNavigation
    ? "Close navigation"
    : sidebarHidden
      ? "Pin navigation"
      : sidebarCollapsed
        ? "Expand navigation"
        : "Collapse navigation";
  const sidebarControlTooltipAction = compactNavigation
    ? "Close"
    : sidebarHidden
      ? "Pin"
      : sidebarCollapsed
        ? "Expand"
        : "Collapse";
  const sidebarControlTitle = showKeyboardShortcuts
    ? `${sidebarControlTooltipAction} (${sidebarShortcutTitle})`
    : sidebarControlTooltipAction;
  const sidebarBrandTitle = compactNavigation
    ? "Navigation"
    : sidebarHidden
      ? "Double-click to pin sidebar"
      : "Double-click to float sidebar";
  // At rest the dock is a row when expanded and a column on the rail. During
  // a drag, in either direction, it switches at one fixed sidebar width.
  const appearanceControlsHorizontal = sidebarResizing
    ? (sidebarResizePreviewWidth ??
        (sidebarVisuallyCollapsed
          ? SIDEBAR_COLLAPSED_WIDTH
          : renderedSidebarWidth)) > SIDEBAR_DOCK_VERTICAL_MAX_WIDTH
    : !sidebarVisuallyCollapsed;
  return {
    navigationUsesCompactInteraction,
    renderedSidebarMode,
    renderedSidebarWidth,
    sidebarCollapsed,
    sidebarHidden,
    sidebarPresentedAsOverlay,
    sidebarVisuallyCollapsed,
    sidebarControlAction,
    sidebarControlTitle,
    sidebarBrandTitle,
    appearanceControlsHorizontal,
  };
}
