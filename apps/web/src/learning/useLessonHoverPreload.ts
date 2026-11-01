import { useCallback, useEffect, useMemo, useRef } from "react";
import type { FocusEvent, PointerEvent } from "react";
import { scheduleLessonHoverPreload } from "./earlyHlsPreload";

export interface LessonHoverPreloadHandlers {
  onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave: () => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: () => void;
  /** Call on click: the lesson opens on its own path from here. */
  cancel: () => void;
}

/**
 * Preloads a lesson's video while the pointer or keyboard focus rests on its
 * entry in the course content list (see `scheduleLessonHoverPreload`).
 * Touch is left out: a tap opens the lesson at once, so there is nothing to
 * get ahead of. Returns undefined when the lesson should not be preloaded.
 */
export function useLessonHoverPreload(
  courseKey: string | undefined,
  lessonNumber: number,
  enabled: boolean,
): LessonHoverPreloadHandlers | undefined {
  const cancelRef = useRef<(() => void) | null>(null);

  const cancel = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
  }, []);

  const schedule = useCallback(() => {
    if (!courseKey) return;
    cancelRef.current?.();
    cancelRef.current = scheduleLessonHoverPreload(courseKey, lessonNumber);
  }, [courseKey, lessonNumber]);

  useEffect(() => cancel, [cancel]);
  useEffect(() => {
    if (!enabled) cancel();
  }, [cancel, enabled]);

  return useMemo(
    () =>
      enabled && courseKey
        ? {
            onPointerEnter: (event: PointerEvent<HTMLElement>) => {
              if (event.pointerType === "touch") return;
              schedule();
            },
            onPointerLeave: cancel,
            onFocus: (event: FocusEvent<HTMLElement>) => {
              // Only keyboard focus: a mouse press focuses the button too.
              if (event.currentTarget.matches(":focus-visible")) schedule();
            },
            onBlur: cancel,
            cancel,
          }
        : undefined,
    [cancel, courseKey, enabled, schedule],
  );
}
