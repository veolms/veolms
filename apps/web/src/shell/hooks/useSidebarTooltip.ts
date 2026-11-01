import {
  useEffect,
  useLayoutEffect,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import type {
  FocusEvent as ReactFocusEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import type { SidebarMode } from "../../settings/settingsPreferences";
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_CONTENT_REVEAL_DISTANCE,
} from "../academyShellConstants";
import type { SidebarResize, SidebarTooltip } from "../academyShellTypes";
import { writeSidebarResizeWidth } from "../academyShellGeometry";

export interface UseSidebarTooltipArgs {
  sidebarMode: SidebarMode;
  sidebarResizing: boolean;
  sidebarResizePreviewWidth: number | null;
  sidebarOverlaySwipeOffset: number | null;
  compactNavigation: boolean;
  coarseNavigationInput: boolean;
  edgeSidebarOpen: boolean;
  setSidebarTooltip: Dispatch<SetStateAction<SidebarTooltip | null>>;
  isDashboardRoute: boolean;
  coursesAppRef: RefObject<HTMLDivElement | null>;
  activeNavigationSection: string | null;
  sidebarResizeRef: RefObject<SidebarResize | null>;
  sidebarTooltipTimerRef: RefObject<number | null>;
  showKeyboardShortcuts: boolean;
  renderedSidebarWidth: number;
  sidebarCollapsed: boolean;
  sidebarHidden: boolean;
  sidebarPresentedAsOverlay: boolean;
  sidebarVisuallyCollapsed: boolean;
}

export interface UseSidebarTooltipResult {
  sidebarDraggedToCollapsedWidth: boolean;
  sidebarClassName: string;
  dismissSidebarTooltipImmediately: () => void;
  showSidebarTooltip: (
    event:
      ReactMouseEvent<HTMLButtonElement> | ReactFocusEvent<HTMLButtonElement>,
    label: string,
    active: boolean,
    showWhenExpanded?: boolean,
    preferenceControlled?: boolean,
  ) => void;
  hideCollapsedNavigationTooltip: (
    event:
      ReactMouseEvent<HTMLButtonElement> | ReactFocusEvent<HTMLButtonElement>,
  ) => void;
}

export function useSidebarTooltip({
  sidebarMode,
  sidebarResizing,
  sidebarResizePreviewWidth,
  sidebarOverlaySwipeOffset,
  compactNavigation,
  coarseNavigationInput,
  edgeSidebarOpen,
  setSidebarTooltip,
  isDashboardRoute,
  coursesAppRef,
  activeNavigationSection,
  sidebarResizeRef,
  sidebarTooltipTimerRef,
  showKeyboardShortcuts,
  renderedSidebarWidth,
  sidebarCollapsed,
  sidebarHidden,
  sidebarPresentedAsOverlay,
  sidebarVisuallyCollapsed,
}: UseSidebarTooltipArgs): UseSidebarTooltipResult {
  const sidebarResizeContentVisible =
    sidebarResizing &&
    (sidebarResizePreviewWidth ?? SIDEBAR_COLLAPSED_WIDTH) >=
      SIDEBAR_COLLAPSED_WIDTH + SIDEBAR_CONTENT_REVEAL_DISTANCE;
  // The toggle's arrow flips as soon as a drag brings the sidebar down to the
  // collapsed width, without waiting for the pointer to be released.
  const sidebarDraggedToCollapsedWidth =
    sidebarResizing &&
    (sidebarResizePreviewWidth ?? renderedSidebarWidth) <=
      SIDEBAR_COLLAPSED_WIDTH;
  const sidebarClassName = [
    "courses-app",
    isDashboardRoute ? "courses-app--dashboard" : "",
    sidebarVisuallyCollapsed ? "courses-app--collapsed" : "",
    sidebarPresentedAsOverlay ? "courses-app--hidden" : "",
    sidebarPresentedAsOverlay && edgeSidebarOpen
      ? "courses-app--edge-open"
      : "",
    sidebarOverlaySwipeOffset !== null ? "courses-app--overlay-swiping" : "",
    sidebarResizing ? "courses-app--resizing" : "",
    sidebarResizeContentVisible ? "courses-app--resize-content-visible" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // The prerendered document carries the expanded shell classes, and hydration
  // does not patch a mismatched className. The head bootstrap script adds the
  // collapsed class before first paint (getSidebarCollapsedMarkupBootstrapScript);
  // this keeps the DOM in step with React wherever that script did not run.
  useLayoutEffect(() => {
    const app = coursesAppRef.current;
    if (app && app.className !== sidebarClassName) {
      app.className = sidebarClassName;
    }
  }, [sidebarClassName, coursesAppRef]);

  // While the sidebar is dragged its width goes straight onto the shell,
  // ahead of React's state (see previewSidebarResizeWidth). Whatever a render
  // has just written for it, the shell is put back on the width the pointer
  // has reached; out of a drag, on the state's own value.
  useLayoutEffect(() => {
    const width =
      (sidebarResizing ? sidebarResizeRef.current?.previewWidth : undefined) ??
      sidebarResizePreviewWidth ??
      SIDEBAR_COLLAPSED_WIDTH;
    writeSidebarResizeWidth(coursesAppRef.current, width);
  });

  useEffect(() => {
    if (sidebarTooltipTimerRef.current !== null) {
      window.clearTimeout(sidebarTooltipTimerRef.current);
      sidebarTooltipTimerRef.current = null;
    }
    setSidebarTooltip(null);
  }, [
    activeNavigationSection,
    coarseNavigationInput,
    compactNavigation,
    showKeyboardShortcuts,
    sidebarHidden,
    sidebarMode,
    setSidebarTooltip,
    sidebarTooltipTimerRef,
  ]);

  const dismissSidebarTooltipImmediately = () => {
    if (sidebarTooltipTimerRef.current !== null) {
      window.clearTimeout(sidebarTooltipTimerRef.current);
      sidebarTooltipTimerRef.current = null;
    }
    setSidebarTooltip(null);
  };

  const showSidebarTooltip = (
    event:
      ReactMouseEvent<HTMLButtonElement> | ReactFocusEvent<HTMLButtonElement>,
    label: string,
    active: boolean,
    showWhenExpanded = false,
    preferenceControlled = true,
  ) => {
    if (
      (!sidebarCollapsed && !showWhenExpanded) ||
      sidebarHidden ||
      compactNavigation ||
      coarseNavigationInput
    )
      return;
    const rect = event.currentTarget.getBoundingClientRect();
    const nextTooltip: SidebarTooltip = {
      label,
      active,
      top: rect.top + rect.height / 2,
      // The tooltip coordinate starts at the SVG tip; its flexible body
      // begins eight pixels later at the same visual offset as before.
      left: rect.right + 2,
      focusVisible:
        event.type === "focus" && event.currentTarget.matches(":focus-visible"),
      preferenceControlled,
    };

    if (sidebarTooltipTimerRef.current !== null) {
      window.clearTimeout(sidebarTooltipTimerRef.current);
      sidebarTooltipTimerRef.current = null;
    }
    if (event.type === "mouseenter") {
      sidebarTooltipTimerRef.current = window.setTimeout(() => {
        setSidebarTooltip(nextTooltip);
        sidebarTooltipTimerRef.current = null;
      }, 260);
      return;
    }
    setSidebarTooltip(nextTooltip);
  };

  const hideCollapsedNavigationTooltip = (
    event:
      ReactMouseEvent<HTMLButtonElement> | ReactFocusEvent<HTMLButtonElement>,
  ) => {
    if (sidebarTooltipTimerRef.current !== null) {
      window.clearTimeout(sidebarTooltipTimerRef.current);
      sidebarTooltipTimerRef.current = null;
    }
    if (
      event?.type === "mouseleave" &&
      document.activeElement === event.currentTarget
    )
      return;
    if (event?.type === "blur" && event.currentTarget.matches(":hover")) return;
    setSidebarTooltip(null);
  };
  return {
    sidebarDraggedToCollapsedWidth,
    sidebarClassName,
    dismissSidebarTooltipImmediately,
    showSidebarTooltip,
    hideCollapsedNavigationTooltip,
  };
}
