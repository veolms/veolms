import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import {
  claimPointerGesture,
  subscribeToPointerGestureClaims,
} from "../../../gestures/pointerGestureOwnership";
import type { LessonPlayerMinimizeGestureState } from "../../player";
import { syncMobileNavigationWithMinimizeGesture } from "../../player/mobileNavigationFollow";
import { isDesktopLearningMinimizeViewport } from "../../player/learningPlayerMotion";
import {
  applyCurriculumDragWidth,
  clearCurriculumDragWidth,
} from "../../curriculumDragWidth";
import { IDLE_PLAYER_MINIMIZE_GESTURE } from "../workspaceConstants";
import type {
  CurriculumResize,
  FloatingLessonDrawerResize,
  CurriculumScreenSwipe,
  CurriculumScreenSwipeStartEvent,
} from "../workspaceGestureTypes";

export interface UseWorkspaceRefsArgs {
  onMinimizeGestureChange:
    ((state: LessonPlayerMinimizeGestureState) => void) | undefined;
  lessonDrawer: boolean;
}

export interface UseWorkspaceRefsResult {
  theaterMode: boolean;
  setTheaterMode: Dispatch<SetStateAction<boolean>>;
  chaptersPanelHost: HTMLDivElement | null;
  setChaptersPanelHost: Dispatch<SetStateAction<HTMLDivElement | null>>;
  mainRef: RefObject<HTMLElement | null>;
  splitPaneRef: RefObject<HTMLDivElement | null>;
  playerWrapRef: RefObject<HTMLDivElement | null>;
  workspaceRef: RefObject<HTMLDivElement | null>;
  lessonContentRef: RefObject<HTMLElement | null>;
  updatePlayerMinimizeGesture: (
    state: LessonPlayerMinimizeGestureState,
  ) => void;
  lessonTriggerRef: RefObject<HTMLButtonElement | null>;
  curriculumScrollportRef: RefObject<HTMLElement | null>;
  fullscreenCurriculumScrollportRef: RefObject<HTMLElement | null>;
  lessonDrawerSurfaceRef: RefObject<HTMLDivElement | null>;
  lessonDrawerScrollportRef: RefObject<HTMLElement | null>;
  previousFocusRef: RefObject<HTMLElement | null>;
  lessonDrawerSkipFinalFocusRef: RefObject<boolean>;
  curriculumResizeRef: RefObject<CurriculumResize | null>;
  curriculumResizeSyncTimerRef: RefObject<number | undefined>;
  curriculumDragWidthAppliedRef: RefObject<boolean>;
  floatingLessonDrawerResizeRef: RefObject<FloatingLessonDrawerResize | null>;
  curriculumResizeMoveRef: RefObject<((event: PointerEvent) => void) | null>;
  curriculumResizeFinishRef: RefObject<
    ((event: PointerEvent, cancelled?: boolean) => void) | null
  >;
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
}

export function useWorkspaceRefs({
  onMinimizeGestureChange,
  lessonDrawer,
}: UseWorkspaceRefsArgs): UseWorkspaceRefsResult {
  const [theaterMode, setTheaterMode] = useState(false);
  const [chaptersPanelHost, setChaptersPanelHost] =
    useState<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const splitPaneRef = useRef<HTMLDivElement>(null);
  const playerWrapRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const lessonContentRef = useRef<HTMLElement>(null);
  const playerMinimizeActiveRef = useRef(false);
  const updatePlayerMinimizeGesture = useCallback(
    (state: LessonPlayerMinimizeGestureState) => {
      // A hidden bottom menu comes up with the minimize (a phone only).
      syncMobileNavigationWithMinimizeGesture(state);
      const active = state.phase !== "idle";
      if (playerMinimizeActiveRef.current !== active) {
        playerMinimizeActiveRef.current = active;
        const workspace = workspaceRef.current;
        const main = mainRef.current;
        const playerWrap = playerWrapRef.current;
        const lessonContent = lessonContentRef.current;
        const desktopUnifiedMotion = isDesktopLearningMinimizeViewport();
        if (active) {
          workspace?.style.setProperty("background", "transparent");
          playerWrap?.style.setProperty("background", "transparent");
          playerWrap?.style.setProperty("box-shadow", "none");
          playerWrap?.style.setProperty("z-index", "190");
          if (desktopUnifiedMotion && main) {
            main.inert = true;
            main.style.pointerEvents = "none";
          } else if (lessonContent) {
            lessonContent.inert = true;
            lessonContent.style.pointerEvents = "none";
            lessonContent.style.willChange = "transform, opacity";
          }
        } else {
          workspace?.style.removeProperty("background");
          playerWrap?.style.removeProperty("background");
          playerWrap?.style.removeProperty("box-shadow");
          playerWrap?.style.removeProperty("z-index");
          if (main) {
            main.inert = lessonDrawer ? true : false;
            main.style.removeProperty("pointer-events");
            main.style.removeProperty("will-change");
          }
          if (lessonContent) {
            lessonContent.inert = false;
            lessonContent.style.removeProperty("pointer-events");
            lessonContent.style.removeProperty("will-change");
          }
        }
      }
      onMinimizeGestureChange?.(state);
    },
    [lessonDrawer, onMinimizeGestureChange],
  );
  useEffect(
    () => () => updatePlayerMinimizeGesture(IDLE_PLAYER_MINIMIZE_GESTURE),
    [updatePlayerMinimizeGesture],
  );
  const lessonTriggerRef = useRef<HTMLButtonElement>(null);
  const curriculumScrollportRef = useRef<HTMLElement>(null);
  const fullscreenCurriculumScrollportRef = useRef<HTMLElement>(null);
  const lessonDrawerSurfaceRef = useRef<HTMLDivElement>(null);
  const lessonDrawerScrollportRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const lessonDrawerSkipFinalFocusRef = useRef(false);
  const curriculumResizeRef = useRef<CurriculumResize | null>(null);
  const curriculumResizeSyncTimerRef = useRef<number | undefined>(undefined);
  useEffect(
    () => () => window.clearTimeout(curriculumResizeSyncTimerRef.current),
    [],
  );
  // While the course content is dragged, the width the pointer has reached is
  // written onto the elements sized from it, ahead of React's state (see
  // moveCurriculumResize). It is put back after every render of a drag, in
  // case the render replaced one of those elements, and taken off by the
  // render that ends the drag: the same commit that gives the document the
  // width the content settles at, so the page never shows a width in between.
  const curriculumDragWidthAppliedRef = useRef(false);
  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const resize = curriculumResizeRef.current;
    if (resize) {
      curriculumDragWidthAppliedRef.current = true;
      applyCurriculumDragWidth(workspace, resize);
    } else if (curriculumDragWidthAppliedRef.current) {
      curriculumDragWidthAppliedRef.current = false;
      clearCurriculumDragWidth(workspace);
    }
  });
  // Two of those elements belong to the shell and outlive this page.
  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    return () => {
      if (workspace) clearCurriculumDragWidth(workspace);
    };
  }, []);
  const floatingLessonDrawerResizeRef =
    useRef<FloatingLessonDrawerResize | null>(null);
  const curriculumResizeMoveRef = useRef<
    ((event: PointerEvent) => void) | null
  >(null);
  const curriculumResizeFinishRef = useRef<
    ((event: PointerEvent, cancelled?: boolean) => void) | null
  >(null);
  const curriculumScreenSwipeRef = useRef<CurriculumScreenSwipe | null>(null);
  const curriculumScreenSwipeStartRef = useRef<
    ((event: CurriculumScreenSwipeStartEvent) => void) | null
  >(null);

  // True only while this page is announcing a claim of its own. The claim
  // is heard by everything that listens for one, this page included, and
  // the listener below used to cancel the very swipe that had just claimed
  // the pointer: the course content moved once, froze, and stayed in its
  // resizing state for good. Only somebody else's claim cancels the swipe.
  const claimingOwnPointerGestureRef = useRef(false);
  const claimCurriculumPointerGesture = (pointerId: number) => {
    claimingOwnPointerGestureRef.current = true;
    try {
      claimPointerGesture({ owner: "curriculum", pointerId });
    } finally {
      claimingOwnPointerGestureRef.current = false;
    }
  };
  useEffect(
    () =>
      subscribeToPointerGestureClaims(({ owner, pointerId }) => {
        if (owner !== "curriculum") return;
        if (claimingOwnPointerGestureRef.current) return;
        if (curriculumScreenSwipeRef.current?.pointerId === pointerId) {
          curriculumScreenSwipeRef.current = null;
        }
      }),
    [],
  );
  // Lets the screen swipe hand a touch over to the resize rail's own drag
  // (defined further down).
  const beginCurriculumResizeRef = useRef<
    ((pointerId: number, clientX: number, handle: HTMLElement) => void) | null
  >(null);
  const curriculumScreenSwipeMoveRef = useRef<
    ((event: PointerEvent) => void) | null
  >(null);
  const curriculumScreenSwipeFinishRef = useRef<
    ((event: PointerEvent, cancelled?: boolean) => void) | null
  >(null);
  const curriculumScreenSwipeConsumedUntilRef = useRef(0);
  return {
    theaterMode,
    setTheaterMode,
    chaptersPanelHost,
    setChaptersPanelHost,
    mainRef,
    splitPaneRef,
    playerWrapRef,
    workspaceRef,
    lessonContentRef,
    updatePlayerMinimizeGesture,
    lessonTriggerRef,
    curriculumScrollportRef,
    fullscreenCurriculumScrollportRef,
    lessonDrawerSurfaceRef,
    lessonDrawerScrollportRef,
    previousFocusRef,
    lessonDrawerSkipFinalFocusRef,
    curriculumResizeRef,
    curriculumResizeSyncTimerRef,
    curriculumDragWidthAppliedRef,
    floatingLessonDrawerResizeRef,
    curriculumResizeMoveRef,
    curriculumResizeFinishRef,
    curriculumScreenSwipeRef,
    curriculumScreenSwipeStartRef,
    claimCurriculumPointerGesture,
    beginCurriculumResizeRef,
    curriculumScreenSwipeMoveRef,
    curriculumScreenSwipeFinishRef,
    curriculumScreenSwipeConsumedUntilRef,
  };
}
