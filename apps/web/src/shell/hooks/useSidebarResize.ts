import {
  startTransition,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { SIDEBAR_MIN_WIDTH } from "../sidebarPreferences";
import type {
  SidebarMode,
  SidebarPreferences,
} from "../../settings/settingsPreferences";
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_GESTURE_ACTIVATION_DISTANCE,
  SIDEBAR_GESTURE_DIRECTION_RATIO,
  SIDEBAR_FLING_MIN_DISTANCE,
  SIDEBAR_FLING_VELOCITY,
  SIDEBAR_HIDDEN_OFFSET_EXTRA,
  SIDEBAR_REVEAL_COMMIT_THRESHOLD,
  SIDEBAR_RESIZE_STATE_SYNC_MS,
} from "../academyShellConstants";
import type {
  SidebarGestureSource,
  SidebarResize,
  PointerPositionEvent,
  SidebarScreenSwipeStartEvent,
} from "../academyShellTypes";
import {
  getSidebarResizeRenderKey,
  writeSidebarResizeWidth,
} from "../academyShellGeometry";

export interface UseSidebarResizeArgs {
  setSidebarMode: Dispatch<SetStateAction<SidebarMode>>;
  setSidebarWidth: Dispatch<SetStateAction<number>>;
  setSidebarResizing: Dispatch<SetStateAction<boolean>>;
  setSidebarResizePreviewWidth: Dispatch<SetStateAction<number | null>>;
  setSidebarOverlaySwipeOffset: Dispatch<SetStateAction<number | null>>;
  compactNavigation: boolean;
  edgeSidebarOpen: boolean;
  setEdgeSidebarOpen: Dispatch<SetStateAction<boolean>>;
  sidebarPreferences: SidebarPreferences;
  sidebarMaxWidth: number;
  setPaletteMenu: Dispatch<SetStateAction<boolean>>;
  coursesAppRef: RefObject<HTMLDivElement | null>;
  appearanceControlsRef: RefObject<HTMLDivElement | null>;
  appearanceControlRectsRef: RefObject<DOMRect[]>;
  sidebarResizeRef: RefObject<SidebarResize | null>;
  sidebarResizeSyncTimerRef: RefObject<number | undefined>;
  sidebarScreenSwipeStartRef: RefObject<
    ((event: SidebarScreenSwipeStartEvent) => void) | null
  >;
  sidebarOverlaySwipeConsumedRef: RefObject<boolean>;
  sidebarPresentedAsOverlay: boolean;
  dismissSidebarTooltipImmediately: () => void;
  commitSidebarWidth: (value: number) => void;
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

export interface UseSidebarResizeResult {
  startSidebarResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
  moveSidebarResize: (event: PointerPositionEvent) => void;
  endSidebarResize: (event: PointerPositionEvent, cancelled?: boolean) => void;
}

export function useSidebarResize({
  setSidebarMode,
  setSidebarWidth,
  setSidebarResizing,
  setSidebarResizePreviewWidth,
  setSidebarOverlaySwipeOffset,
  compactNavigation,
  edgeSidebarOpen,
  setEdgeSidebarOpen,
  sidebarPreferences,
  sidebarMaxWidth,
  setPaletteMenu,
  coursesAppRef,
  appearanceControlsRef,
  appearanceControlRectsRef,
  sidebarResizeRef,
  sidebarResizeSyncTimerRef,
  sidebarScreenSwipeStartRef,
  sidebarOverlaySwipeConsumedRef,
  sidebarPresentedAsOverlay,
  dismissSidebarTooltipImmediately,
  commitSidebarWidth,
  createSidebarGesture,
  activateSidebarGesture,
  startSidebarScreenSwipe,
}: UseSidebarResizeArgs): UseSidebarResizeResult {
  /**
   * Takes a dragged sidebar to a new width.
   *
   * The width is written onto the shell directly, so the sidebar and the
   * page beside it are laid out for it in this same frame. It used to travel
   * through React state alone, which re-rendered the whole shell for every
   * movement of the pointer: each of those renders took several frames, so
   * the layout followed the pointer in jumps and the text on the page
   * shuddered as it was dragged.
   *
   * React still hears the width where it changes what is rendered, at once,
   * and otherwise when the pointer comes to rest (the handle's reported
   * value). With the live size readout on, it hears every width as before.
   */
  const previewSidebarResizeWidth = (previousWidth: number, width: number) => {
    window.clearTimeout(sidebarResizeSyncTimerRef.current);
    const rendersDifferently =
      getSidebarResizeRenderKey(previousWidth) !==
      getSidebarResizeRenderKey(width);

    if (rendersDifferently) {
      // The appearance dock may be about to turn. Its controls glide from
      // where they are now, which React last measured when it last rendered.
      const dock = appearanceControlsRef.current;
      if (dock) {
        appearanceControlRectsRef.current = [
          ...dock.querySelectorAll<HTMLElement>(
            ":scope > button, :scope > .sidebar-palette-wrap",
          ),
        ].map((control) => control.getBoundingClientRect());
      }
    }

    writeSidebarResizeWidth(coursesAppRef.current, width);

    if (sidebarPreferences.showResizeDimensions === true) {
      setSidebarResizePreviewWidth(width);
      return;
    }
    if (rendersDifferently) {
      // The shell has to be rendered again, and that is the whole page with
      // it: long enough, done at once, to hold the drag still while the
      // pointer went on (the page was seen to fall behind the pointer each
      // time a fast drag passed one of these widths). The width itself is
      // already on the shell, so nothing waits for this render: it is done
      // in pieces between frames, and the sidebar takes its new arrangement
      // a few frames after the width that calls for it.
      startTransition(() => setSidebarResizePreviewWidth(width));
      return;
    }
    sidebarResizeSyncTimerRef.current = window.setTimeout(() => {
      const resize = sidebarResizeRef.current;
      // Likewise in pieces: the pointer has only paused, and a drag that
      // carries on must not find the page busy rendering.
      if (resize?.active) {
        startTransition(() =>
          setSidebarResizePreviewWidth(resize.previewWidth),
        );
      }
    }, SIDEBAR_RESIZE_STATE_SYNC_MS);
  };

  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      (compactNavigation && !sidebarPresentedAsOverlay) ||
      (sidebarPresentedAsOverlay && !edgeSidebarOpen)
    )
      return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dismissSidebarTooltipImmediately();
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    sidebarResizeRef.current = createSidebarGesture({
      active: true,
      clientX: event.clientX,
      clientY: event.clientY,
      handle: event.currentTarget,
      pointerId: event.pointerId,
      source: sidebarPresentedAsOverlay ? "overlay-rail" : "rail",
      timeStamp: event.timeStamp,
    });
    setSidebarResizePreviewWidth(sidebarResizeRef.current.previewWidth);
    setSidebarResizing(true);
  };

  const moveSidebarResize = (event: PointerPositionEvent) => {
    const resize = sidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    if (
      (resize.source === "rail" || resize.source === "overlay-rail") &&
      event.pointerType !== "touch" &&
      event.buttons === 0
    ) {
      endSidebarResize(event, true);
      return;
    }

    const deltaX = event.clientX - resize.startX;
    const deltaY = event.clientY - resize.startY;
    if (!resize.active) {
      const horizontalDistance = Math.abs(deltaX);
      const verticalDistance = Math.abs(deltaY);
      if (
        verticalDistance >= SIDEBAR_GESTURE_ACTIVATION_DISTANCE &&
        verticalDistance > horizontalDistance * SIDEBAR_GESTURE_DIRECTION_RATIO
      ) {
        sidebarResizeRef.current = null;
        return;
      }
      if (horizontalDistance < SIDEBAR_GESTURE_ACTIVATION_DISTANCE) return;
      if (
        horizontalDistance <=
        verticalDistance * SIDEBAR_GESTURE_DIRECTION_RATIO
      )
        return;
      const opensCollapsedSidebar = resize.collapsedAtStart && deltaX > 0;
      const hidesCollapsedSidebar =
        resize.modeAtStart === "collapsed" && deltaX < 0;
      const closesExpandedSidebar = !resize.collapsedAtStart && deltaX < 0;
      const movesOverlay = resize.source === "overlay";
      // The resize line goes either way from any width.
      const dragsResizeLine = resize.source === "rail";
      if (
        !movesOverlay &&
        !dragsResizeLine &&
        !opensCollapsedSidebar &&
        !hidesCollapsedSidebar &&
        !closesExpandedSidebar
      ) {
        sidebarResizeRef.current = null;
        return;
      }
      activateSidebarGesture(resize);
    }

    event.preventDefault?.();
    const eventTimestamp = event.timeStamp || performance.now();
    const timestamp = Math.max(eventTimestamp, resize.lastTimestamp + 1);
    const elapsed = timestamp - resize.lastTimestamp;
    const instantaneousVelocity = (event.clientX - resize.lastX) / elapsed;
    resize.velocityX =
      resize.velocityX === 0 || elapsed > 80
        ? instantaneousVelocity
        : resize.velocityX * 0.35 + instantaneousVelocity * 0.65;
    resize.lastX = event.clientX;
    resize.lastTimestamp = timestamp;

    if (resize.screenOverlayAtStart) {
      const hiddenOffset =
        -resize.expandedWidthAtStart - SIDEBAR_HIDDEN_OFFSET_EXTRA;
      const revealOffset = Math.max(
        hiddenOffset,
        Math.min(0, hiddenOffset + Math.max(0, deltaX)),
      );
      setSidebarOverlaySwipeOffset(revealOffset);
      return;
    }
    if (resize.source === "overlay") {
      const offset =
        deltaX < 0
          ? Math.max(-resize.expandedWidthAtStart, deltaX)
          : Math.min(28, deltaX * 0.22);
      setSidebarOverlaySwipeOffset(offset);
      return;
    }

    const maximumWidth =
      resize.source === "screen"
        ? resize.expandedWidthAtStart
        : sidebarMaxWidth;
    const minimumWidth =
      resize.source === "overlay-rail"
        ? SIDEBAR_MIN_WIDTH
        : SIDEBAR_COLLAPSED_WIDTH;
    const previewWidth = Math.min(
      maximumWidth,
      Math.max(minimumWidth, resize.startWidth + deltaX),
    );
    const previousPreviewWidth = resize.previewWidth;
    resize.previewWidth = previewWidth;
    previewSidebarResizeWidth(previousPreviewWidth, previewWidth);
  };

  const endSidebarResize = (event: PointerPositionEvent, cancelled = false) => {
    const resize = sidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    sidebarResizeRef.current = null;
    window.clearTimeout(sidebarResizeSyncTimerRef.current);
    try {
      resize.handle?.releasePointerCapture?.(resize.pointerId);
    } catch {
      // Capture may already have been released when the gesture ends.
    }

    if (!resize.active) return;

    if (resize.source === "screen" || resize.source === "rail") {
      window.setTimeout(() => {
        sidebarOverlaySwipeConsumedRef.current = false;
      }, 0);
    }

    if (resize.screenOverlayAtStart) {
      const revealDistance = resize.lastX - resize.startX;
      const revealThreshold =
        (resize.expandedWidthAtStart + SIDEBAR_HIDDEN_OFFSET_EXTRA) *
        SIDEBAR_REVEAL_COMMIT_THRESHOLD;
      const intentionalReveal = !cancelled && revealDistance >= revealThreshold;
      setSidebarOverlaySwipeOffset(null);
      setEdgeSidebarOpen(intentionalReveal);
      window.setTimeout(() => {
        sidebarOverlaySwipeConsumedRef.current = false;
      }, 0);
      return;
    }

    if (resize.source === "overlay") {
      setSidebarOverlaySwipeOffset(null);
      const totalDistance = resize.lastX - resize.startX;
      const finishedAt = event.timeStamp || performance.now();
      const averageVelocity =
        totalDistance / Math.max(1, finishedAt - resize.startedAt);
      const intentionalSwipe =
        !cancelled &&
        (Math.abs(totalDistance) >= SIDEBAR_FLING_MIN_DISTANCE ||
          Math.max(Math.abs(resize.velocityX), Math.abs(averageVelocity)) >=
            SIDEBAR_FLING_VELOCITY);

      if (intentionalSwipe && totalDistance < 0) {
        setEdgeSidebarOpen(false);
      } else if (intentionalSwipe && totalDistance > 0) {
        setSidebarWidth(resize.expandedWidthAtStart);
        setSidebarMode("expanded");
        setEdgeSidebarOpen(false);
      }
      window.setTimeout(() => {
        sidebarOverlaySwipeConsumedRef.current = false;
      }, 0);
      return;
    }

    setSidebarResizePreviewWidth(null);
    setSidebarResizing(false);

    if (resize.source === "overlay-rail") {
      if (!cancelled) {
        commitSidebarWidth(Math.max(SIDEBAR_MIN_WIDTH, resize.previewWidth));
      }
      return;
    }

    if (cancelled) {
      setSidebarWidth(resize.expandedWidthAtStart);
      setSidebarMode(resize.modeAtStart);
      return;
    }

    const totalDistance = resize.lastX - resize.startX;
    const finishedAt = event.timeStamp || performance.now();
    const averageVelocity =
      totalDistance / Math.max(1, finishedAt - resize.startedAt);
    const leftwardVelocity = Math.min(resize.velocityX, averageVelocity);
    const shouldHideCollapsedSidebar =
      resize.modeAtStart === "collapsed" &&
      totalDistance < 0 &&
      (Math.abs(totalDistance) >= SIDEBAR_FLING_MIN_DISTANCE ||
        leftwardVelocity <= -SIDEBAR_FLING_VELOCITY);

    if (shouldHideCollapsedSidebar) {
      setSidebarWidth(resize.expandedWidthAtStart);
      setSidebarMode("hidden");
      setPaletteMenu(false);
      setEdgeSidebarOpen(false);
      return;
    }

    const fastFling =
      Math.abs(totalDistance) >= SIDEBAR_FLING_MIN_DISTANCE &&
      Math.max(Math.abs(resize.velocityX), Math.abs(averageVelocity)) >=
        SIDEBAR_FLING_VELOCITY;
    const halfwayWidth =
      SIDEBAR_COLLAPSED_WIDTH +
      (resize.expandedWidthAtStart - SIDEBAR_COLLAPSED_WIDTH) / 2;
    const shouldExpand = resize.collapsedAtStart
      ? (fastFling && totalDistance > 0) || resize.previewWidth >= halfwayWidth
      : !(
          (fastFling && totalDistance < 0) ||
          resize.previewWidth <= halfwayWidth
        );

    if (!shouldExpand) {
      setSidebarWidth(resize.expandedWidthAtStart);
      setSidebarMode(resize.modeAtStart === "hidden" ? "hidden" : "collapsed");
      setPaletteMenu(false);
      setEdgeSidebarOpen(false);
      return;
    }

    setSidebarMode("expanded");
    if (resize.source === "screen") {
      setSidebarWidth(resize.expandedWidthAtStart);
      return;
    }
    commitSidebarWidth(Math.max(SIDEBAR_MIN_WIDTH, resize.previewWidth));
  };

  // Keep the resize alive even when the pointer leaves the narrow handle. The
  // pointer-capture path handles normal interaction; these document listeners
  // make quick drags and releases outside the handle finish predictably too.
  sidebarScreenSwipeStartRef.current = startSidebarScreenSwipe;
  return {
    startSidebarResize,
    moveSidebarResize,
    endSidebarResize,
  };
}
