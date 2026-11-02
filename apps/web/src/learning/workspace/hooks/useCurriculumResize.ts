import {
  useCallback,
  useEffect,
  useLayoutEffect,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useSecondPressHold } from "../../../gestures/useSecondPressHold";
import { FLOATING_SCROLLBAR_HORIZONTAL_DRAG_EVENT } from "../../../shell/FloatingScrollbar";
import type { FloatingScrollbarHorizontalDragDetail } from "../../../shell/FloatingScrollbar";
import {
  moveSplitFrameDrag,
  settleSplitFrameDrag,
  splitFrameKeyStep,
  startSplitFrameDrag,
} from "../../../components/splitFrame";
import { applyCurriculumDragWidth } from "../../curriculumDragWidth";
import { CURRICULUM_COLLAPSED_WIDTH } from "../../learningShellPreferences";
import { CURRICULUM_RESIZE_STATE_SYNC_MS } from "../workspaceConstants";
import type {
  CurriculumResize,
  CurriculumPointerEvent,
} from "../workspaceGestureTypes";

export interface UseCurriculumResizeArgs {
  lessonStorageKey: string;
  selectedLesson: number;
  lessonDrawer: boolean;
  courseContentDrawerViewport: boolean;
  curriculumWidth: number;
  setCurriculumWidth: Dispatch<SetStateAction<number>>;
  curriculumCollapsed: boolean;
  setCurriculumCollapsed: Dispatch<SetStateAction<boolean>>;
  setCurriculumFocusRequest: Dispatch<SetStateAction<number>>;
  curriculumResizing: boolean;
  setCurriculumResizing: Dispatch<SetStateAction<boolean>>;
  setCurriculumResizePreviewWidth: Dispatch<SetStateAction<number | null>>;
  workspaceRef: RefObject<HTMLDivElement | null>;
  curriculumResizeRef: RefObject<CurriculumResize | null>;
  curriculumResizeSyncTimerRef: RefObject<number | undefined>;
  curriculumDragWidthAppliedRef: RefObject<boolean>;
  curriculumResizeMoveRef: RefObject<((event: PointerEvent) => void) | null>;
  curriculumResizeFinishRef: RefObject<
    ((event: PointerEvent, cancelled?: boolean) => void) | null
  >;
  beginCurriculumResizeRef: RefObject<
    ((pointerId: number, clientX: number, handle: HTMLElement) => void) | null
  >;
  curriculumScreenSwipeConsumedUntilRef: RefObject<number>;
  isCourseContentDrawerLayout: () => boolean;
  openLessonDrawer: () => void;
  closeLessonDrawer: () => void;
  openFloatingLessonDrawer: () => void;
  commitCurriculumWidth: (value: number) => void;
}

export interface UseCurriculumResizeResult {
  startCurriculumResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
  moveCurriculumResize: (event: CurriculumPointerEvent) => void;
  endCurriculumResize: (
    event: CurriculumPointerEvent,
    cancelled?: boolean,
  ) => void;
  handleCurriculumResizeKeyDown: (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => void;
  toggleCurriculumFromResizeRail: () => void;
  curriculumToggleGesture: ReturnType<
    typeof useSecondPressHold<HTMLButtonElement>
  >;
}

export function useCurriculumResize({
  lessonStorageKey,
  selectedLesson,
  lessonDrawer,
  courseContentDrawerViewport,
  curriculumWidth,
  setCurriculumWidth,
  curriculumCollapsed,
  setCurriculumCollapsed,
  setCurriculumFocusRequest,
  curriculumResizing,
  setCurriculumResizing,
  setCurriculumResizePreviewWidth,
  workspaceRef,
  curriculumResizeRef,
  curriculumResizeSyncTimerRef,
  curriculumDragWidthAppliedRef,
  curriculumResizeMoveRef,
  curriculumResizeFinishRef,
  beginCurriculumResizeRef,
  curriculumScreenSwipeConsumedUntilRef,
  isCourseContentDrawerLayout,
  openLessonDrawer,
  closeLessonDrawer,
  openFloatingLessonDrawer,
  commitCurriculumWidth,
}: UseCurriculumResizeArgs): UseCurriculumResizeResult {
  const beginCurriculumResize = useCallback(
    (pointerId: number, clientX: number, handle: HTMLElement) => {
      if (isCourseContentDrawerLayout()) return;
      curriculumResizeRef.current = {
        ...startSplitFrameDrag(
          pointerId,
          clientX,
          curriculumWidth,
          curriculumCollapsed,
        ),
        handle,
      };
      setCurriculumResizePreviewWidth(
        curriculumCollapsed ? CURRICULUM_COLLAPSED_WIDTH : curriculumWidth,
      );
      setCurriculumResizing(true);
    },
    [
      curriculumCollapsed,
      curriculumWidth,
      isCourseContentDrawerLayout,
      curriculumResizeRef,
      setCurriculumResizePreviewWidth,
      setCurriculumResizing,
    ],
  );

  useLayoutEffect(() => {
    beginCurriculumResizeRef.current = beginCurriculumResize;
  }, [beginCurriculumResize, beginCurriculumResizeRef]);

  const startCurriculumResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isCourseContentDrawerLayout()) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    beginCurriculumResize(event.pointerId, event.clientX, event.currentTarget);
  };

  // While the gutter is held, the course content is exactly as wide as the
  // pointer makes it (the rules every SplitFramePane follows, splitFrame.ts).
  // Where it settles (closed, its minimum, or the width it was dragged to)
  // is decided when the pointer is released.
  //
  // The width is written directly onto the elements sized from it (see
  // curriculumDragWidth.ts), so the split is laid out for it in this same
  // frame. It used to travel through React state alone, which re-rendered
  // the whole workspace for every movement of the pointer; those renders
  // took several frames each, so the layout followed the pointer in jumps.
  // React still hears the width at once where it changes what is rendered
  // (closed or open, sliding closed or not), and otherwise when the pointer
  // comes to rest.
  const moveCurriculumResize = useCallback(
    (event: CurriculumPointerEvent) => {
      const resize = curriculumResizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;

      const { collapsedChanged, slidingChanged: rendersDifferently } =
        moveSplitFrameDrag(resize, event.clientX);
      if (collapsedChanged) setCurriculumCollapsed(resize.collapsed);
      const workspace = workspaceRef.current;
      if (workspace) {
        curriculumDragWidthAppliedRef.current = true;
        applyCurriculumDragWidth(workspace, resize);
      }

      const syncState = () => {
        const current = curriculumResizeRef.current;
        if (current !== resize) return;
        setCurriculumResizePreviewWidth(resize.previewWidth);
        setCurriculumWidth(resize.expandedWidth);
      };
      window.clearTimeout(curriculumResizeSyncTimerRef.current);
      if (rendersDifferently) {
        syncState();
      } else {
        curriculumResizeSyncTimerRef.current = window.setTimeout(
          syncState,
          CURRICULUM_RESIZE_STATE_SYNC_MS,
        );
      }
    },
    [
      curriculumDragWidthAppliedRef,
      curriculumResizeRef,
      curriculumResizeSyncTimerRef,
      setCurriculumCollapsed,
      setCurriculumResizePreviewWidth,
      setCurriculumWidth,
      workspaceRef,
    ],
  );
  const endCurriculumResize = useCallback(
    (event: CurriculumPointerEvent, cancelled = false) => {
      const resize = curriculumResizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;
      curriculumResizeRef.current = null;
      window.clearTimeout(curriculumResizeSyncTimerRef.current);
      setCurriculumResizing(false);
      setCurriculumResizePreviewWidth(null);
      resize.handle?.releasePointerCapture?.(resize.pointerId);
      // A drag handed over from a swipe on the panel swallows taps while it
      // lasts; from here they are swallowed only for a moment longer.
      if (curriculumScreenSwipeConsumedUntilRef.current > performance.now()) {
        curriculumScreenSwipeConsumedUntilRef.current = performance.now() + 450;
      }

      const settled = settleSplitFrameDrag(resize, cancelled);
      setCurriculumCollapsed(settled.collapsed);
      if (cancelled || settled.collapsed) setCurriculumWidth(settled.width);
      else commitCurriculumWidth(settled.width);
    },
    [
      commitCurriculumWidth,
      curriculumResizeRef,
      curriculumResizeSyncTimerRef,
      curriculumScreenSwipeConsumedUntilRef,
      setCurriculumCollapsed,
      setCurriculumResizePreviewWidth,
      setCurriculumResizing,
      setCurriculumWidth,
    ],
  );

  useEffect(() => {
    const handleScrollbarHorizontalDrag = (event: Event) => {
      const { detail } =
        event as CustomEvent<FloatingScrollbarHorizontalDragDetail>;
      if (detail.ariaControls !== "courses-main-scrollport") return;

      if (detail.phase === "start") {
        beginCurriculumResize(detail.pointerId, detail.clientX, detail.handle);
      } else if (detail.phase === "move") {
        moveCurriculumResize(detail);
      } else {
        endCurriculumResize(detail, detail.phase === "cancel");
      }
    };

    window.addEventListener(
      FLOATING_SCROLLBAR_HORIZONTAL_DRAG_EVENT,
      handleScrollbarHorizontalDrag,
    );
    return () =>
      window.removeEventListener(
        FLOATING_SCROLLBAR_HORIZONTAL_DRAG_EVENT,
        handleScrollbarHorizontalDrag,
      );
  }, [beginCurriculumResize, endCurriculumResize, moveCurriculumResize]);

  useLayoutEffect(() => {
    curriculumResizeMoveRef.current = moveCurriculumResize;
    curriculumResizeFinishRef.current = endCurriculumResize;

    return () => {
      if (curriculumResizeMoveRef.current === moveCurriculumResize) {
        curriculumResizeMoveRef.current = null;
      }
      if (curriculumResizeFinishRef.current === endCurriculumResize) {
        curriculumResizeFinishRef.current = null;
      }
    };
  }, [
    moveCurriculumResize,
    endCurriculumResize,
    curriculumResizeFinishRef,
    curriculumResizeMoveRef,
  ]);

  useEffect(() => {
    if (!curriculumResizing) return undefined;
    const continueResize = (event: PointerEvent) =>
      curriculumResizeMoveRef.current?.(event);
    const finishResize = (event: PointerEvent) =>
      curriculumResizeFinishRef.current?.(event);
    const cancelResize = (event: PointerEvent) =>
      curriculumResizeFinishRef.current?.(event, true);
    window.addEventListener("pointermove", continueResize);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", cancelResize);
    return () => {
      window.removeEventListener("pointermove", continueResize);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", cancelResize);
    };
  }, [curriculumResizing, curriculumResizeFinishRef, curriculumResizeMoveRef]);

  const handleCurriculumResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    const next = splitFrameKeyStep(
      event.key,
      curriculumWidth,
      curriculumCollapsed,
    );
    if (!next) return;
    event.preventDefault();
    setCurriculumCollapsed(next.collapsed);
    if (next.width !== curriculumWidth) commitCurriculumWidth(next.width);
  };

  const toggleCurriculumFromResizeRail = () => {
    if (isCourseContentDrawerLayout()) return;
    setCurriculumCollapsed((collapsed) => !collapsed);
  };

  const toggleCurriculumFromPlayer = () => {
    if (isCourseContentDrawerLayout()) {
      if (lessonDrawer) closeLessonDrawer();
      else openLessonDrawer();
      return;
    }
    // Opened again, the list comes back at the lesson being played, not
    // wherever it was scrolled to before it was closed.
    if (curriculumCollapsed) {
      setCurriculumFocusRequest((request) => request + 1);
    }
    setCurriculumCollapsed((collapsed) => !collapsed);
  };

  const curriculumToggleGesture = useSecondPressHold<HTMLButtonElement>({
    onPress: toggleCurriculumFromPlayer,
    onSecondPressHold: openFloatingLessonDrawer,
    secondPressWindow: courseContentDrawerViewport ? 700 : undefined,
  });

  useEffect(() => {
    try {
      localStorage.setItem(lessonStorageKey, String(selectedLesson));
    } catch {
      // Lesson selection remains usable when browser storage is unavailable.
    }
  }, [lessonStorageKey, selectedLesson]);

  useEffect(() => {
    try {
      sessionStorage.removeItem("veolms-course-autostart");
    } catch {
      // Retired preferences are cleaned up on a best-effort basis.
    }
  }, []);
  return {
    startCurriculumResize,
    moveCurriculumResize,
    endCurriculumResize,
    handleCurriculumResizeKeyDown,
    toggleCurriculumFromResizeRail,
    curriculumToggleGesture,
  };
}
