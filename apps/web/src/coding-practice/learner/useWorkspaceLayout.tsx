import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

/**
 * The practice workspace's layout, as in a code editor: the problem's width
 * and the results' height can be dragged, any pane can take the whole
 * workspace, and the code text can be made larger or smaller. Kept on the
 * device for the next exercise.
 */

export type WorkspacePane = "problem" | "editor" | "results";

interface Layout {
  /** The problem pane's share of the width, in percent. */
  problemWidth: number;
  /** The results pane's share of the right column's height, in percent. */
  resultsHeight: number;
  fontSize: number;
}

const STORAGE_KEY = "veolms:coding-layout";
const DEFAULTS: Layout = { problemWidth: 40, resultsHeight: 40, fontSize: 14 };
export const FONT_SIZES = { min: 11, max: 24 } as const;
const LIMITS = {
  problemWidth: [18, 75],
  resultsHeight: [12, 80],
} as const;

const clamp = (value: number, [min, max]: readonly [number, number]) =>
  Math.min(max, Math.max(min, value));

function readLayout(): Layout {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw) as Partial<Layout>;
    return {
      problemWidth: clamp(
        Number(saved.problemWidth) || DEFAULTS.problemWidth,
        LIMITS.problemWidth,
      ),
      resultsHeight: clamp(
        Number(saved.resultsHeight) || DEFAULTS.resultsHeight,
        LIMITS.resultsHeight,
      ),
      fontSize: clamp(Number(saved.fontSize) || DEFAULTS.fontSize, [
        FONT_SIZES.min,
        FONT_SIZES.max,
      ]),
    };
  } catch {
    return DEFAULTS;
  }
}

function writeLayout(layout: Layout) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* private mode or full: the layout is only for this visit */
  }
}

export function useWorkspaceLayout() {
  const [layout, setLayout] = useState<Layout>(() =>
    typeof window === "undefined" ? DEFAULTS : readLayout(),
  );
  const [maximized, setMaximized] = useState<WorkspacePane | null>(null);
  const [dragging, setDragging] = useState<"width" | "height" | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => writeLayout(layout), 250);
    return () => window.clearTimeout(timer);
  }, [layout]);

  const toggleMaximized = useCallback(
    (pane: WorkspacePane) =>
      setMaximized((current) => (current === pane ? null : pane)),
    [],
  );

  const restore = useCallback(() => setMaximized(null), []);
  const resetSize = useCallback(
    (axis: "width" | "height") =>
      setLayout((current) =>
        axis === "width"
          ? { ...current, problemWidth: DEFAULTS.problemWidth }
          : { ...current, resultsHeight: DEFAULTS.resultsHeight },
      ),
    [],
  );

  const changeFontSize = useCallback(
    (step: number) =>
      setLayout((current) => ({
        ...current,
        fontSize: clamp(current.fontSize + step, [
          FONT_SIZES.min,
          FONT_SIZES.max,
        ]),
      })),
    [],
  );
  const resetFontSize = useCallback(
    () => setLayout((current) => ({ ...current, fontSize: DEFAULTS.fontSize })),
    [],
  );

  // A drag follows the pointer over the whole page (an iframe preview
  // would otherwise swallow the moves; it is covered while dragging).
  const container = useRef<HTMLElement | null>(null);
  const setContainer = useCallback((node: HTMLElement | null) => {
    container.current = node;
  }, []);
  const startDrag = useCallback(
    (axis: "width" | "height") => (event: ReactPointerEvent<HTMLElement>) => {
      const area =
        axis === "width"
          ? container.current
          : (event.currentTarget.parentElement as HTMLElement | null);
      if (!area || event.button !== 0) return;
      event.preventDefault();
      const box = area.getBoundingClientRect();
      setDragging(axis);
      const move = (moveEvent: PointerEvent) => {
        const percent =
          axis === "width"
            ? ((moveEvent.clientX - box.left) / box.width) * 100
            : ((box.bottom - moveEvent.clientY) / box.height) * 100;
        setLayout((current) =>
          axis === "width"
            ? {
                ...current,
                problemWidth: clamp(percent, LIMITS.problemWidth),
              }
            : {
                ...current,
                resultsHeight: clamp(percent, LIMITS.resultsHeight),
              },
        );
      };
      const up = () => {
        setDragging(null);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [],
  );

  /** Arrow keys move a focused divider; Home puts it back. */
  const dividerKeys = useCallback(
    (axis: "width" | "height") => (event: ReactKeyboardEvent<HTMLElement>) => {
      const key = event.key;
      const grow =
        axis === "width"
          ? key === "ArrowRight"
            ? 4
            : key === "ArrowLeft"
              ? -4
              : 0
          : key === "ArrowUp"
            ? 4
            : key === "ArrowDown"
              ? -4
              : 0;
      if (key === "Home") {
        event.preventDefault();
        resetSize(axis);
        return;
      }
      if (!grow) return;
      event.preventDefault();
      setLayout((current) =>
        axis === "width"
          ? {
              ...current,
              problemWidth: clamp(
                current.problemWidth + grow,
                LIMITS.problemWidth,
              ),
            }
          : {
              ...current,
              resultsHeight: clamp(
                current.resultsHeight + grow,
                LIMITS.resultsHeight,
              ),
            },
      );
    },
    [resetSize],
  );

  return {
    layout,
    maximized,
    toggleMaximized,
    restore,
    resetSize,
    dragging,
    setContainer,
    startDrag,
    dividerKeys,
    changeFontSize,
    resetFontSize,
    limits: LIMITS,
  };
}
