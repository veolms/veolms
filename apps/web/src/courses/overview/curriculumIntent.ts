import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type FocusEvent,
  type PointerEvent,
} from "react";

/**
 * Fetches a course's whole curriculum ahead of a press that needs it, when
 * the course page was built with its first sections only. Provided by the
 * course page (see `useCoursePageData`); without it the handlers do nothing.
 */
export const CurriculumIntentContext = createContext<(() => void) | null>(null);

/**
 * How long the pointer rests before the curriculum is fetched: the delay a
 * lesson is preloaded on hover after (`LESSON_HOVER_PRELOAD_DELAY_MS`, not
 * imported so this page does not load the video player's preload code).
 */
const CURRICULUM_HOVER_DELAY_MS = 120;

type IntentHandlers = {
  onPointerEnter?: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave?: () => void;
  onPointerDown?: () => void;
  onFocus?: (event: FocusEvent<HTMLElement>) => void;
  onBlur?: () => void;
};

/**
 * Handlers for a control whose press shows or uses the whole curriculum
 * ("Show all sections", a section, the way into the course's lessons). The
 * curriculum is fetched once the pointer has rested on it a moment, as a
 * lesson is preloaded on hover, so passing over it costs nothing; on a
 * touch, at once, a little before the tap lands; on keyboard focus, after
 * the same moment.
 */
export function useCurriculumIntent(): IntentHandlers {
  const prefetch = useContext(CurriculumIntentContext);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return useMemo<IntentHandlers>(() => {
    if (!prefetch) return {};
    const later = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(prefetch, CURRICULUM_HOVER_DELAY_MS);
    };
    const cancel = () => window.clearTimeout(timer.current);
    return {
      onPointerEnter: (event) => {
        if (event.pointerType !== "touch") later();
      },
      onPointerLeave: cancel,
      onPointerDown: prefetch,
      onFocus: later,
      onBlur: cancel,
    };
  }, [prefetch]);
}
