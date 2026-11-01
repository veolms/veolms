import type { Dispatch, SetStateAction, RefObject } from "react";
import type { ReactNode } from "react";
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
} from "../sidebarPreferences";
import { canStartSidebarTouchGesture } from "../sidebarVisibility";
import type { SidebarMode } from "../../settings/settingsPreferences";
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_HIDDEN_OFFSET_EXTRA,
} from "../academyShellConstants";
import type {
  SidebarGestureSource,
  SidebarResize,
  SidebarScreenSwipeStartEvent,
  CoursesPageRenderContext,
} from "../academyShellTypes";
import {
  isSidebarSwipeExcludedTarget,
  isFocusedSidebarSwipeInput,
} from "../academyShellGeometry";
import { isVideoTimelineSwipeZone } from "../../gestures/pointerGestureOwnership";

export interface UseSidebarGesturesArgs {
  renderMain: ((context: CoursesPageRenderContext) => ReactNode) | null;
  sidebarMode: SidebarMode;
  setSidebarWidth: Dispatch<SetStateAction<number>>;
  sidebarWidth: number;
  setSidebarResizing: Dispatch<SetStateAction<boolean>>;
  setSidebarResizePreviewWidth: Dispatch<SetStateAction<number | null>>;
  setSidebarOverlaySwipeOffset: Dispatch<SetStateAction<number | null>>;
  compactNavigation: boolean;
  edgeSidebarOpen: boolean;
  setEdgeSidebarOpen: Dispatch<SetStateAction<boolean>>;
  mobileSidebarNavigationActive: boolean;
  sidebarMaxWidth: number;
  sidebarResizeRef: RefObject<SidebarResize | null>;
  sidebarOverlaySwipeConsumedRef: RefObject<boolean>;
  sidebarPresentedAsOverlay: boolean;
  sidebarVisuallyCollapsed: boolean;
  dismissSidebarTooltipImmediately: () => void;
}

export interface UseSidebarGesturesResult {
  commitSidebarWidth: (value: number) => void;
  resetSidebarWidth: () => void;
  createSidebarGesture: ({
    active,
    clientX,
    clientY,
    handle,
    pointerId,
    source,
    timeStamp,
  }: {
    active: boolean;
    clientX: number;
    clientY: number;
    handle: HTMLElement | null;
    pointerId: number;
    source: SidebarGestureSource;
    timeStamp: number;
  }) => SidebarResize;
  activateSidebarGesture: (resize: SidebarResize) => void;
  startSidebarScreenSwipe: (event: SidebarScreenSwipeStartEvent) => void;
}

export function useSidebarGestures({
  renderMain,
  sidebarMode,
  setSidebarWidth,
  sidebarWidth,
  setSidebarResizing,
  setSidebarResizePreviewWidth,
  setSidebarOverlaySwipeOffset,
  compactNavigation,
  edgeSidebarOpen,
  setEdgeSidebarOpen,
  mobileSidebarNavigationActive,
  sidebarMaxWidth,
  sidebarResizeRef,
  sidebarOverlaySwipeConsumedRef,
  sidebarPresentedAsOverlay,
  sidebarVisuallyCollapsed,
  dismissSidebarTooltipImmediately,
}: UseSidebarGesturesArgs): UseSidebarGesturesResult {
  const commitSidebarWidth = (value: number) => {
    const nextWidth = clampSidebarWidth(value, sidebarMaxWidth);
    setSidebarWidth(nextWidth);
    localStorage.setItem("veolms-sidebar-width", String(Math.round(nextWidth)));
  };

  // Removing the saved width, rather than saving the default, lets a later
  // change of the default reach this browser.
  const resetSidebarWidth = () => {
    setSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
    localStorage.removeItem("veolms-sidebar-width");
  };

  const createSidebarGesture = ({
    active,
    clientX,
    clientY,
    handle,
    pointerId,
    source,
    timeStamp,
  }: {
    active: boolean;
    clientX: number;
    clientY: number;
    handle: HTMLElement | null;
    pointerId: number;
    source: SidebarGestureSource;
    timeStamp: number;
  }): SidebarResize => {
    const overlayGesture = source === "overlay" || source === "overlay-rail";
    const screenOverlayAtStart =
      source === "screen" && sidebarPresentedAsOverlay;
    const collapsedAtStart =
      sidebarVisuallyCollapsed ||
      (sidebarPresentedAsOverlay && !overlayGesture);
    const expandedWidthAtStart = clampSidebarWidth(
      Math.max(SIDEBAR_MIN_WIDTH, sidebarWidth),
      sidebarMaxWidth,
    );
    const startWidth = collapsedAtStart
      ? SIDEBAR_COLLAPSED_WIDTH
      : expandedWidthAtStart;

    return {
      pointerId,
      source,
      screenOverlayAtStart,
      active,
      startedAt: timeStamp,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastTimestamp: timeStamp,
      velocityX: 0,
      startWidth,
      expandedWidthAtStart,
      modeAtStart: sidebarMode,
      collapsedAtStart,
      previewWidth: startWidth,
      handle,
    };
  };

  const activateSidebarGesture = (resize: SidebarResize) => {
    if (resize.active) return;
    resize.active = true;
    dismissSidebarTooltipImmediately();
    if (resize.screenOverlayAtStart) {
      sidebarOverlaySwipeConsumedRef.current = true;
      setEdgeSidebarOpen(true);
      setSidebarOverlaySwipeOffset(
        -resize.expandedWidthAtStart - SIDEBAR_HIDDEN_OFFSET_EXTRA,
      );
      try {
        resize.handle?.setPointerCapture?.(resize.pointerId);
      } catch {
        // Window-level pointer listeners keep the reveal gesture active.
      }
      return;
    }
    if (resize.source === "overlay") {
      sidebarOverlaySwipeConsumedRef.current = true;
      setSidebarOverlaySwipeOffset(0);
      try {
        resize.handle?.setPointerCapture?.(resize.pointerId);
      } catch {
        // Window-level pointer listeners keep the overlay gesture active.
      }
      return;
    }
    // A swipe may begin on a menu item. Once it has become a drag, the
    // sidebar swallows the click that could follow the finger lifting.
    // (Only swipes arrive here not yet active: a press on the resize line
    // itself starts its drag at once.)
    sidebarOverlaySwipeConsumedRef.current = true;
    setSidebarResizePreviewWidth(resize.previewWidth);
    setSidebarResizing(true);
    try {
      resize.handle?.setPointerCapture?.(resize.pointerId);
    } catch {
      // Window-level pointer listeners keep the gesture alive without capture.
    }
  };

  const startSidebarScreenSwipe = (event: SidebarScreenSwipeStartEvent) => {
    const startsOnSidebar =
      event.target instanceof Element &&
      Boolean(event.target.closest(".courses-sidebar"));
    const startsInOpenOverlay =
      sidebarPresentedAsOverlay && edgeSidebarOpen && startsOnSidebar;
    // A sideways swipe that begins on the pinned sidebar is a drag of its
    // resize line, wherever on the sidebar the finger is: any width between
    // the rail and the maximum, settling as that line settles.
    const dragsResizeLine =
      startsOnSidebar && !sidebarPresentedAsOverlay && !compactNavigation;
    if (
      !canStartSidebarTouchGesture({
        compactNavigation,
        enabled: !compactNavigation || mobileSidebarNavigationActive,
        hidden: sidebarPresentedAsOverlay,
        isPrimary: event.isPrimary,
        pointerType: event.pointerType,
      }) ||
      (!compactNavigation &&
        !startsInOpenOverlay &&
        renderMain &&
        event.clientX >= (event.splitX ?? window.innerWidth / 2)) ||
      sidebarResizeRef.current ||
      isSidebarSwipeExcludedTarget(event.target) ||
      isVideoTimelineSwipeZone(event.target, event) ||
      isFocusedSidebarSwipeInput(event.target)
    )
      return;

    sidebarResizeRef.current = createSidebarGesture({
      active: false,
      clientX: event.clientX,
      clientY: event.clientY,
      handle: event.handle,
      pointerId: event.pointerId,
      source: startsInOpenOverlay
        ? "overlay"
        : dragsResizeLine
          ? "rail"
          : "screen",
      timeStamp: event.timeStamp,
    });
  };
  return {
    commitSidebarWidth,
    resetSidebarWidth,
    createSidebarGesture,
    activateSidebarGesture,
    startSidebarScreenSwipe,
  };
}
