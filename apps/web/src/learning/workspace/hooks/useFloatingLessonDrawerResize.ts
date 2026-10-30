import {
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  clampLearningCurriculumWidth,
  CURRICULUM_WIDTH_STORAGE_KEY,
} from "../../learningShellPreferences";
import {
  LESSON_DRAWER_MAX_FLOATING_WIDTH,
  LESSON_DRAWER_MIN_FLOATING_WIDTH,
} from "../../useLessonDrawerHeroControl";
import type { LessonDrawerViewportBounds } from "../../useLessonDrawerHeroControl";
import {
  FLOATING_LESSON_DRAWER_SNAP_WIDTH,
  FLOATING_LESSON_DRAWER_WIDTH_KEY,
} from "../workspaceConstants";
import type {
  CurriculumPointerEvent,
  FloatingLessonDrawerResize,
} from "../workspaceGestureTypes";

export interface UseFloatingLessonDrawerResizeArgs {
  lessonDrawerViewportBounds: LessonDrawerViewportBounds | null;
  setLessonDrawerViewportBounds: Dispatch<
    SetStateAction<LessonDrawerViewportBounds | null>
  >;
  floatingLessonDrawerWidth: number;
  setFloatingLessonDrawerWidth: Dispatch<SetStateAction<number>>;
  floatingLessonDrawerResizing: boolean;
  setFloatingLessonDrawerResizing: Dispatch<SetStateAction<boolean>>;
  phoneLessonDrawer: boolean;
  setCurriculumWidth: Dispatch<SetStateAction<number>>;
  floatingLessonDrawerResizeRef: RefObject<FloatingLessonDrawerResize | null>;
  getLessonDrawerViewportBounds: (preferredWidth: number) => {
    top: number;
    bottom: number;
    borderRadius: string;
    left: number;
    width: number;
  } | null;
  closeLessonDrawer: () => void;
}

export interface UseFloatingLessonDrawerResizeResult {
  commitCurriculumWidth: (value: number) => void;
  startFloatingLessonDrawerResize: (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  handleFloatingLessonDrawerResizeKeyDown: (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => void;
}

export function useFloatingLessonDrawerResize({
  lessonDrawerViewportBounds,
  setLessonDrawerViewportBounds,
  floatingLessonDrawerWidth,
  setFloatingLessonDrawerWidth,
  floatingLessonDrawerResizing,
  setFloatingLessonDrawerResizing,
  phoneLessonDrawer,
  setCurriculumWidth,
  floatingLessonDrawerResizeRef,
  getLessonDrawerViewportBounds,
  closeLessonDrawer,
}: UseFloatingLessonDrawerResizeArgs): UseFloatingLessonDrawerResizeResult {
  const commitCurriculumWidth = useCallback(
    (value: number) => {
      const nextWidth = clampLearningCurriculumWidth(value);
      setCurriculumWidth(nextWidth);
      try {
        localStorage.setItem(
          CURRICULUM_WIDTH_STORAGE_KEY,
          String(Math.round(nextWidth)),
        );
      } catch {
        // Resizing remains available when browser storage is unavailable.
      }
    },
    [setCurriculumWidth],
  );

  const previewFloatingLessonDrawerWidth = useCallback(
    (value: number, allowCollapsePreview = false) => {
      const bounds = getLessonDrawerViewportBounds(
        Math.max(LESSON_DRAWER_MIN_FLOATING_WIDTH, value),
      );
      if (!bounds) return null;
      const previewWidth = allowCollapsePreview
        ? Math.max(0, Math.min(bounds.width, value))
        : bounds.width;
      const previewBounds =
        previewWidth < bounds.width
          ? {
              ...bounds,
              left: bounds.left + bounds.width - previewWidth,
              width: previewWidth,
            }
          : bounds;
      if (!allowCollapsePreview) {
        setFloatingLessonDrawerWidth(previewBounds.width);
      }
      setLessonDrawerViewportBounds(previewBounds);
      return previewBounds.width;
    },
    [
      getLessonDrawerViewportBounds,
      setFloatingLessonDrawerWidth,
      setLessonDrawerViewportBounds,
    ],
  );

  const commitFloatingLessonDrawerWidth = useCallback(
    (value: number) => {
      const nextWidth = previewFloatingLessonDrawerWidth(value);
      if (nextWidth === null) return;
      try {
        window.localStorage.setItem(
          FLOATING_LESSON_DRAWER_WIDTH_KEY,
          String(Math.round(nextWidth)),
        );
      } catch {
        // Floating resizing remains available without browser storage.
      }
    },
    [previewFloatingLessonDrawerWidth],
  );

  const startFloatingLessonDrawerResize = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (phoneLessonDrawer) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startWidth =
      lessonDrawerViewportBounds?.width ?? floatingLessonDrawerWidth;
    floatingLessonDrawerResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth,
      originalWidth: startWidth,
      previewWidth: startWidth,
      dismissOnEnd: false,
      handle: event.currentTarget,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setFloatingLessonDrawerResizing(true);
  };

  const moveFloatingLessonDrawerResize = useCallback(
    (event: CurriculumPointerEvent) => {
      const resize = floatingLessonDrawerResizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;
      const requestedWidth = resize.startWidth + resize.startX - event.clientX;
      const nextWidth = previewFloatingLessonDrawerWidth(requestedWidth, true);
      if (nextWidth !== null) {
        resize.previewWidth = nextWidth;
        resize.dismissOnEnd =
          requestedWidth <= FLOATING_LESSON_DRAWER_SNAP_WIDTH;
      }
    },
    [previewFloatingLessonDrawerWidth, floatingLessonDrawerResizeRef],
  );

  const endFloatingLessonDrawerResize = useCallback(
    (event: CurriculumPointerEvent, cancelled = false) => {
      const resize = floatingLessonDrawerResizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;
      floatingLessonDrawerResizeRef.current = null;
      setFloatingLessonDrawerResizing(false);
      resize.handle.releasePointerCapture?.(resize.pointerId);
      if (cancelled) {
        previewFloatingLessonDrawerWidth(resize.originalWidth);
        return;
      }
      if (resize.dismissOnEnd) {
        closeLessonDrawer();
        return;
      }
      commitFloatingLessonDrawerWidth(resize.previewWidth);
    },
    [
      closeLessonDrawer,
      commitFloatingLessonDrawerWidth,
      previewFloatingLessonDrawerWidth,
      floatingLessonDrawerResizeRef,
      setFloatingLessonDrawerResizing,
    ],
  );

  useEffect(() => {
    if (!floatingLessonDrawerResizing) return undefined;
    const continueResize = (event: PointerEvent) =>
      moveFloatingLessonDrawerResize(event);
    const finishResize = (event: PointerEvent) =>
      endFloatingLessonDrawerResize(event);
    const cancelResize = (event: PointerEvent) =>
      endFloatingLessonDrawerResize(event, true);
    window.addEventListener("pointermove", continueResize);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", cancelResize);
    return () => {
      window.removeEventListener("pointermove", continueResize);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", cancelResize);
    };
  }, [
    endFloatingLessonDrawerResize,
    floatingLessonDrawerResizing,
    moveFloatingLessonDrawerResize,
  ]);

  const handleFloatingLessonDrawerResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? 20 : -20;
      commitFloatingLessonDrawerWidth(floatingLessonDrawerWidth + direction);
    } else if (event.key === "Home") {
      event.preventDefault();
      closeLessonDrawer();
    } else if (event.key === "End") {
      event.preventDefault();
      commitFloatingLessonDrawerWidth(LESSON_DRAWER_MAX_FLOATING_WIDTH);
    }
  };
  return {
    commitCurriculumWidth,
    startFloatingLessonDrawerResize,
    handleFloatingLessonDrawerResizeKeyDown,
  };
}
