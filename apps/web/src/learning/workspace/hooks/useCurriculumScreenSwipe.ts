import {
  useEffect,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  getLearningPlayerSwipeSplitX,
  isFullLearningPlayerSwipeTarget,
  isVideoTimelineSwipeZone,
} from "../../../gestures/pointerGestureOwnership";
import {
  isEditingShortcutTarget,
  isLegacyCourseContentShortcut,
  isRightPanelShortcut,
} from "../../../keyboardShortcuts";
import { CURRICULUM_COLLAPSED_WIDTH } from "../../learningShellPreferences";
import {
  CURRICULUM_SWIPE_ACTIVATION_DISTANCE,
  CURRICULUM_SWIPE_DIRECTION_RATIO,
  CURRICULUM_SWIPE_COMMIT_DISTANCE,
  CURRICULUM_SWIPE_FLING_DISTANCE,
  CURRICULUM_SWIPE_FLING_VELOCITY,
  CURRICULUM_SWIPE_EXCLUSION_SELECTOR,
  LESSON_DRAWER_REVEAL_EXCLUSION_SELECTOR,
} from "../workspaceConstants";
import { isCurriculumSwipeExcludedTarget } from "../workspaceDom";
import type {
  CurriculumResize,
  CurriculumScreenSwipe,
  CurriculumScreenSwipeStartEvent,
} from "../workspaceGestureTypes";

export interface UseCurriculumScreenSwipeArgs {
  lessonDrawer: boolean;
  phoneLessonDrawer: boolean;
  curriculumWidth: number;
  curriculumCollapsed: boolean;
  setCurriculumCollapsed: Dispatch<SetStateAction<boolean>>;
  setCurriculumResizing: Dispatch<SetStateAction<boolean>>;
  setCurriculumResizePreviewWidth: Dispatch<SetStateAction<number | null>>;
  playerWrapRef: RefObject<HTMLDivElement | null>;
  workspaceRef: RefObject<HTMLDivElement | null>;
  curriculumResizeRef: RefObject<CurriculumResize | null>;
  curriculumScreenSwipeRef: RefObject<CurriculumScreenSwipe | null>;
  curriculumScreenSwipeStartRef: RefObject<
    ((event: CurriculumScreenSwipeStartEvent) => void) | null
  >;
  claimCurriculumPointerGesture: (pointerId: number) => void;
  beginCurriculumResizeRef: RefObject<
    ((pointerId: number, clientX: number, handle: HTMLElement) => void) | null
  >;
  curriculumScreenSwipeMoveRef: RefObject<
    ((event: PointerEvent) => void) | null
  >;
  curriculumScreenSwipeFinishRef: RefObject<
    ((event: PointerEvent, cancelled?: boolean) => void) | null
  >;
  curriculumScreenSwipeConsumedUntilRef: RefObject<number>;
  isCourseContentDrawerLayout: () => boolean;
  openLessonDrawer: () => void;
  closeLessonDrawer: () => void;
  /**
   * Whether the lessons open beside the video inside full screen (see
   * useLessonDrawerControls' `toggleLessonDrawerFromPlayer`); the shortcut
   * then works them as the player's Lessons button does.
   */
  fullscreenLessonsBeside: boolean;
  toggleLessonDrawerFromPlayer: (presentation: "drawer" | "side") => void;
}

export interface UseCurriculumScreenSwipeResult {
  startCurriculumScreenSwipe: (event: CurriculumScreenSwipeStartEvent) => void;
  suppressCurriculumSwipeClick: (
    event: ReactMouseEvent<HTMLDivElement>,
  ) => void;
}

export function useCurriculumScreenSwipe({
  lessonDrawer,
  phoneLessonDrawer,
  curriculumWidth,
  curriculumCollapsed,
  setCurriculumCollapsed,
  setCurriculumResizing,
  setCurriculumResizePreviewWidth,
  playerWrapRef,
  workspaceRef,
  curriculumResizeRef,
  curriculumScreenSwipeRef,
  curriculumScreenSwipeStartRef,
  claimCurriculumPointerGesture,
  beginCurriculumResizeRef,
  curriculumScreenSwipeMoveRef,
  curriculumScreenSwipeFinishRef,
  curriculumScreenSwipeConsumedUntilRef,
  isCourseContentDrawerLayout,
  openLessonDrawer,
  closeLessonDrawer,
  fullscreenLessonsBeside,
  toggleLessonDrawerFromPlayer,
}: UseCurriculumScreenSwipeArgs): UseCurriculumScreenSwipeResult {
  const startCurriculumScreenSwipe = (
    event: CurriculumScreenSwipeStartEvent,
  ) => {
    const drawerLayout = isCourseContentDrawerLayout();
    const revealsTabletDrawer = drawerLayout && !phoneLessonDrawer;
    const target = revealsTabletDrawer ? "lesson-drawer" : "curriculum";
    if (
      (drawerLayout && !revealsTabletDrawer) ||
      event.pointerType !== "touch" ||
      !event.isPrimary ||
      event.clientX < (event.splitX ?? window.innerWidth / 2) ||
      curriculumResizeRef.current ||
      curriculumScreenSwipeRef.current ||
      isVideoTimelineSwipeZone(event.target, event) ||
      isCurriculumSwipeExcludedTarget(
        event.target,
        revealsTabletDrawer
          ? LESSON_DRAWER_REVEAL_EXCLUSION_SELECTOR
          : CURRICULUM_SWIPE_EXCLUSION_SELECTOR,
      )
    )
      return;

    curriculumScreenSwipeRef.current = {
      pointerId: event.pointerId,
      active: false,
      startedAt: event.timeStamp,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastTimestamp: event.timeStamp,
      velocityX: 0,
      closedAtStart:
        target === "lesson-drawer" ? !lessonDrawer : curriculumCollapsed,
      expandedWidthAtStart: curriculumWidth,
      target,
      startedOnPanel:
        target === "curriculum" &&
        event.target instanceof Element &&
        Boolean(event.target.closest(".learning-curriculum")),
      handle: event.handle,
    };
  };

  const moveCurriculumScreenSwipe = (event: PointerEvent) => {
    const swipe = curriculumScreenSwipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;
    if (!swipe.active) {
      const horizontalDistance = Math.abs(deltaX);
      const verticalDistance = Math.abs(deltaY);
      if (
        verticalDistance >= CURRICULUM_SWIPE_ACTIVATION_DISTANCE &&
        verticalDistance > horizontalDistance * CURRICULUM_SWIPE_DIRECTION_RATIO
      ) {
        curriculumScreenSwipeRef.current = null;
        return;
      }
      if (horizontalDistance < CURRICULUM_SWIPE_ACTIVATION_DISTANCE) return;
      if (
        horizontalDistance <=
        verticalDistance * CURRICULUM_SWIPE_DIRECTION_RATIO
      )
        return;

      // A sideways swipe that begins on the open panel is a drag of its
      // resize rail, wherever on the panel the finger is: it widens and
      // narrows the panel with the finger, and closes it when let go
      // narrow enough. The rail's own drag takes the touch from here.
      if (swipe.startedOnPanel && !swipe.closedAtStart) {
        curriculumScreenSwipeRef.current = null;
        claimCurriculumPointerGesture(swipe.pointerId);
        try {
          swipe.handle.setPointerCapture?.(swipe.pointerId);
        } catch {
          // Window-level listeners keep the drag going without capture.
        }
        // A tap that follows the drag ending is not a tap on a lesson.
        curriculumScreenSwipeConsumedUntilRef.current =
          performance.now() + 60_000;
        beginCurriculumResizeRef.current?.(
          swipe.pointerId,
          event.clientX,
          swipe.handle,
        );
        event.preventDefault();
        return;
      }

      const opensClosedCurriculum = swipe.closedAtStart && deltaX < 0;
      const closesOpenCurriculum = !swipe.closedAtStart && deltaX > 0;
      if (!opensClosedCurriculum && !closesOpenCurriculum) {
        curriculumScreenSwipeRef.current = null;
        return;
      }

      swipe.active = true;
      claimCurriculumPointerGesture(swipe.pointerId);
      if (swipe.target === "curriculum") {
        setCurriculumResizePreviewWidth(
          swipe.closedAtStart ? CURRICULUM_COLLAPSED_WIDTH : curriculumWidth,
        );
        setCurriculumResizing(true);
      }
      try {
        swipe.handle.setPointerCapture?.(swipe.pointerId);
      } catch {
        // Window-level listeners keep the swipe active without pointer capture.
      }
    }

    event.preventDefault();
    if (swipe.target === "lesson-drawer") event.stopPropagation();
    const eventTimestamp = event.timeStamp || performance.now();
    const timestamp = Math.max(eventTimestamp, swipe.lastTimestamp + 1);
    const elapsed = timestamp - swipe.lastTimestamp;
    const instantaneousVelocity = (event.clientX - swipe.lastX) / elapsed;
    swipe.velocityX =
      swipe.velocityX === 0 || elapsed > 80
        ? instantaneousVelocity
        : swipe.velocityX * 0.35 + instantaneousVelocity * 0.65;
    swipe.lastX = event.clientX;
    swipe.lastTimestamp = timestamp;

    if (swipe.target === "lesson-drawer") return;

    const startWidth = swipe.closedAtStart
      ? CURRICULUM_COLLAPSED_WIDTH
      : swipe.expandedWidthAtStart;
    setCurriculumResizePreviewWidth(
      Math.min(
        swipe.expandedWidthAtStart,
        Math.max(CURRICULUM_COLLAPSED_WIDTH, startWidth - deltaX),
      ),
    );
  };

  const endCurriculumScreenSwipe = (event: PointerEvent, cancelled = false) => {
    const swipe = curriculumScreenSwipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    curriculumScreenSwipeRef.current = null;
    try {
      swipe.handle.releasePointerCapture?.(swipe.pointerId);
    } catch {
      // Capture may already have been released when the swipe ends.
    }
    if (!swipe.active) return;

    event.preventDefault();
    curriculumScreenSwipeConsumedUntilRef.current = performance.now() + 450;
    if (swipe.target === "curriculum") {
      setCurriculumResizing(false);
      setCurriculumResizePreviewWidth(null);
    }
    if (cancelled && swipe.target !== "lesson-drawer") return;

    const totalDistance = swipe.lastX - swipe.startX;
    const finishedAt = event.timeStamp || performance.now();
    const averageVelocity =
      totalDistance / Math.max(1, finishedAt - swipe.startedAt);
    const fastFling =
      Math.abs(totalDistance) >= CURRICULUM_SWIPE_FLING_DISTANCE &&
      Math.max(Math.abs(swipe.velocityX), Math.abs(averageVelocity)) >=
        CURRICULUM_SWIPE_FLING_VELOCITY;
    const shouldCommit =
      fastFling || Math.abs(totalDistance) >= CURRICULUM_SWIPE_COMMIT_DISTANCE;
    if (!shouldCommit) return;

    if (swipe.target === "lesson-drawer") {
      if (swipe.closedAtStart) openLessonDrawer();
      else closeLessonDrawer();
      return;
    }

    setCurriculumCollapsed(!swipe.closedAtStart);
  };

  curriculumScreenSwipeStartRef.current = startCurriculumScreenSwipe;
  curriculumScreenSwipeMoveRef.current = moveCurriculumScreenSwipe;
  curriculumScreenSwipeFinishRef.current = endCurriculumScreenSwipe;

  useEffect(() => {
    const startSwipeFromHostedPlayer = (event: PointerEvent) => {
      const workspace = workspaceRef.current;
      const playerAnchor = playerWrapRef.current;
      if (
        !workspace ||
        !playerAnchor ||
        !isFullLearningPlayerSwipeTarget(event.target, event, playerAnchor)
      )
        return;

      curriculumScreenSwipeStartRef.current?.({
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        isPrimary: event.isPrimary,
        clientX: event.clientX,
        clientY: event.clientY,
        timeStamp: event.timeStamp,
        target: event.target,
        handle: workspace,
        splitX: getLearningPlayerSwipeSplitX(playerAnchor),
      });
    };
    const continueSwipe = (event: PointerEvent) =>
      curriculumScreenSwipeMoveRef.current?.(event);
    const finishSwipe = (event: PointerEvent) =>
      curriculumScreenSwipeFinishRef.current?.(event);
    const cancelSwipe = (event: PointerEvent) =>
      curriculumScreenSwipeFinishRef.current?.(event, true);
    window.addEventListener("pointerdown", startSwipeFromHostedPlayer, true);
    window.addEventListener("pointermove", continueSwipe, {
      capture: true,
      passive: false,
    });
    window.addEventListener("pointerup", finishSwipe, true);
    window.addEventListener("pointercancel", cancelSwipe, true);
    return () => {
      window.removeEventListener(
        "pointerdown",
        startSwipeFromHostedPlayer,
        true,
      );
      window.removeEventListener("pointermove", continueSwipe, true);
      window.removeEventListener("pointerup", finishSwipe, true);
      window.removeEventListener("pointercancel", cancelSwipe, true);
    };
  }, [
    curriculumScreenSwipeFinishRef,
    curriculumScreenSwipeMoveRef,
    curriculumScreenSwipeStartRef,
    playerWrapRef,
    workspaceRef,
  ]);

  const suppressCurriculumSwipeClick = (
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    if (performance.now() > curriculumScreenSwipeConsumedUntilRef.current)
      return;
    curriculumScreenSwipeConsumedUntilRef.current = 0;
    event.preventDefault();
    event.stopPropagation();
  };

  useEffect(() => {
    const handleCurriculumShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        !(
          isRightPanelShortcut(event) || isLegacyCourseContentShortcut(event)
        ) ||
        isEditingShortcutTarget(event.target)
      )
        return;

      event.preventDefault();
      if (fullscreenLessonsBeside) {
        toggleLessonDrawerFromPlayer("side");
        return;
      }
      if (isCourseContentDrawerLayout()) {
        if (lessonDrawer) closeLessonDrawer();
        else openLessonDrawer();
        return;
      }

      setCurriculumCollapsed((collapsed) => !collapsed);
    };

    window.addEventListener("keydown", handleCurriculumShortcut, true);
    return () =>
      window.removeEventListener("keydown", handleCurriculumShortcut, true);
  }, [
    closeLessonDrawer,
    fullscreenLessonsBeside,
    isCourseContentDrawerLayout,
    lessonDrawer,
    openLessonDrawer,
    setCurriculumCollapsed,
    toggleLessonDrawerFromPlayer,
  ]);
  return {
    startCurriculumScreenSwipe,
    suppressCurriculumSwipeClick,
  };
}
