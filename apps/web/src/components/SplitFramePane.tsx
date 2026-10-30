import {
  createElement,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  SPLIT_FRAME_ATTRIBUTE,
  SPLIT_FRAME_TARGET_WIDTH_PROPERTY,
  SPLIT_FRAME_DEFAULT_WIDTH,
  SPLIT_FRAME_MAX_WIDTH,
  SPLIT_FRAME_MIN_WIDTH,
  clampSplitFrameWidth,
  findSplitFrameBoxes,
  moveSplitFrameDrag,
  settleSplitFrameDrag,
  splitFrameKeyStep,
  splitFrameValueText,
  startSplitFrameDrag,
  writeSplitFrameDragWidth,
  type SplitFrameDrag,
} from "./splitFrame";
import "./split-frame-pane.css";

/** How long the frame takes to widen again once a sliding pane has closed. */
const CLOSE_DURATION_MS = 300;

// The panes that split their frame at the moment: open, and their `media`
// matching. A frame is marked for as long as one of them is inside it, so
// two panes on a page at once (a page and its stand-in during a motion)
// cannot leave the mark wrong when one of them goes.
const activePanes = new Set<HTMLElement>();

function syncSplitMark(shell: HTMLElement | null, frame: HTMLElement) {
  let split = false;
  for (const pane of activePanes) {
    if (frame.contains(pane)) {
      split = true;
      break;
    }
  }
  for (const element of [shell, frame]) {
    if (!element) continue;
    if (!split) element.removeAttribute(SPLIT_FRAME_ATTRIBUTE);
    else if (!element.hasAttribute(SPLIT_FRAME_ATTRIBUTE)) {
      element.setAttribute(SPLIT_FRAME_ATTRIBUTE, "");
    }
  }
  return split;
}

function writeTargetWidth(element: HTMLElement | null, value: string | null) {
  if (!element) return;
  if (value === null)
    element.style.removeProperty(SPLIT_FRAME_TARGET_WIDTH_PROPERTY);
  else if (
    element.style.getPropertyValue(SPLIT_FRAME_TARGET_WIDTH_PROPERTY) !== value
  ) {
    element.style.setProperty(SPLIT_FRAME_TARGET_WIDTH_PROPERTY, value);
  }
}

// A sliding pane that closes leaves the frame widening for a moment. A pane
// that opens in that moment (the next discussion, another page) takes over
// the boxes instead of having them reset under it.
let pendingRelease: number | null = null;

type SplitFramePaneProps = HTMLAttributes<HTMLElement> & {
  /** `aside` for a pane of its own; `div` where the pane sits in a layout. */
  element?: "aside" | "div";
  paneRef?: RefObject<HTMLElement | null>;
  /**
   * Whether the pane splits the frame now. When it does not, the element
   * stays where it is, as an ordinary box (the lesson page in theater mode).
   */
  split?: boolean;
  /** The windows the split is for; the page shows something else on others. */
  media?: string;
  /**
   * The pane's width at rest, in pixels. Without one the width is the page's
   * own `--split-frame-page-width`, which its stylesheet sets so that the
   * width is right at first paint (split-frame-pane.css explains).
   */
  width?: number;
  /**
   * Whether the pane is itself the card. Without, an element inside it that
   * moves on its own is the card, marked `data-split-frame-card`.
   */
  card?: boolean;
  /**
   * The frame slides to the split shape as the pane opens and back as it
   * closes. Off for a pane that arrives and leaves with its page.
   */
  slide?: boolean;
  children: ReactNode;
};

/**
 * The shell's frame split in two: the page stays in the frame, which narrows,
 * and this pane is a card of its own in the space it gives up, with a gutter
 * between them (SplitFrameGutter) that resizes the pane. The desktop lesson
 * page's course content and the Discussions page's open discussion.
 *
 * For wide screens in the framed layout (split-frame-pane.css).
 */
export function SplitFramePane({
  element = "aside",
  paneRef,
  split = true,
  media = "(min-width: 64rem)",
  width,
  card = true,
  slide = false,
  children,
  ...props
}: SplitFramePaneProps) {
  const ownRef = useRef<HTMLElement | null>(null);
  const setRef = useCallback(
    (node: HTMLElement | null) => {
      ownRef.current = node;
      if (paneRef) paneRef.current = node;
    },
    [paneRef],
  );

  // The width itself is written by the effect after this one; only whether
  // there is one matters here.
  const hasOwnWidth = width !== undefined;

  // Opening: the shell and frame take the split shape (a sliding pane makes
  // them slide to it). Closing: they let go of it, or a sliding pane's frame
  // slides back to its full width first.
  useLayoutEffect(() => {
    const pane = ownRef.current;
    if (!pane || !split) return undefined;
    const { shell, frame } = findSplitFrameBoxes(pane);
    if (!frame) return undefined;
    const takingOver = pendingRelease !== null;
    if (pendingRelease !== null) {
      window.clearTimeout(pendingRelease);
      pendingRelease = null;
    }
    // A page without a width of its own takes the boxes from a sliding pane
    // that was closing.
    if (!hasOwnWidth) {
      writeTargetWidth(shell, null);
      writeTargetWidth(frame, null);
    }
    const query = window.matchMedia(media);
    const update = () => {
      if (query.matches) activePanes.add(pane);
      else activePanes.delete(pane);
      syncSplitMark(shell, frame);
    };
    if (
      slide &&
      !takingOver &&
      query.matches &&
      !frame.hasAttribute(SPLIT_FRAME_ATTRIBUTE)
    ) {
      // The width goes on below; the boxes take the shape at no width first,
      // so that they slide from it.
      writeTargetWidth(shell, "0px");
      writeTargetWidth(frame, "0px");
      update();
      getComputedStyle(frame).getPropertyValue("--split-frame-width");
    } else {
      update();
    }
    query.addEventListener("change", update);
    return () => {
      query.removeEventListener("change", update);
      activePanes.delete(pane);
      const wasSplit = frame.hasAttribute(SPLIT_FRAME_ATTRIBUTE);
      if (syncSplitMark(shell, frame) || !slide || !wasSplit) return;
      // Still split until the frame has slid back.
      shell?.setAttribute(SPLIT_FRAME_ATTRIBUTE, "");
      frame.setAttribute(SPLIT_FRAME_ATTRIBUTE, "");
      writeTargetWidth(shell, "0px");
      writeTargetWidth(frame, "0px");
      pendingRelease = window.setTimeout(() => {
        pendingRelease = null;
        if (syncSplitMark(shell, frame)) return;
        writeTargetWidth(shell, null);
        writeTargetWidth(frame, null);
      }, CLOSE_DURATION_MS);
    };
  }, [hasOwnWidth, media, slide, split]);

  useLayoutEffect(() => {
    const pane = ownRef.current;
    if (!pane || width === undefined) return;
    const { shell, frame } = findSplitFrameBoxes(pane);
    const value = `${width}px`;
    for (const element of [shell, frame, pane])
      writeTargetWidth(element, value);
  });

  return createElement(
    element,
    {
      ...props,
      ref: setRef,
      "data-split-frame-pane": split ? "" : undefined,
      "data-split-frame-card": split && card ? "" : undefined,
    },
    children,
  );
}

/**
 * The grip in the middle of the gutter. It only shows where to grab: the
 * gutter around it (`group/rail`) owns the pointer and keyboard handling, so
 * the whole gutter resizes.
 *
 * The gutter is empty at rest. The grip appears, muted, while the gutter is
 * hovered (or has keyboard focus), and grows and takes the accent colour
 * only once a drag is under way (`data-resizing` on the gutter).
 */
function SplitFrameGrip() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none block h-16 w-1 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--accent)_54%,var(--border))] opacity-0 transition-[height,opacity,background-color] duration-160 ease-out group-hover/rail:opacity-50 group-focus-visible/rail:opacity-50 group-data-resizing/rail:h-20 group-data-resizing/rail:bg-(--accent) group-data-resizing/rail:opacity-100 motion-reduce:transition-none"
    />
  );
}

/**
 * The 12px gutter before a SplitFramePane, as a separator the pointer and
 * keyboard resize the pane with; placed inside the pane's card. Its shape
 * is in split-frame-pane.css; the page wires up what resizing does.
 */
export function SplitFrameGutter({
  resizing = false,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  /** A drag of the gutter is under way. */
  resizing?: boolean;
  "aria-valuemin"?: number;
  "aria-valuemax"?: number;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      tabIndex={0}
      {...props}
      data-split-frame-gutter=""
      data-resizing={resizing ? "" : undefined}
      className={`group/rail outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) ${className}`}
    >
      <SplitFrameGrip />
    </div>
  );
}

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Storage can be unavailable; the defaults are used.
    return null;
  }
}

function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not remembered; the pane still has it for now.
  }
}

function readStoredWidth(key: string) {
  const stored = Number(readStored(key));
  return Number.isFinite(stored) && stored > 0
    ? clampSplitFrameWidth(stored)
    : SPLIT_FRAME_DEFAULT_WIDTH;
}

/**
 * A pane's width and whether it is closed, resized by its gutter exactly as
 * the lesson page's course content is (the rules are in splitFrame.ts) and
 * remembered under `storageKey`: for a SplitFramePane (`paneRef`,
 * `paneWidth`), its SplitFrameGutter (`gutterProps`) and the element that
 * holds the pane's content (`contentRef`), which keeps its width while the
 * pane slides closed so that it slides out instead of being squeezed.
 *
 * A closed pane keeps its gutter at the frame's edge, where a drag or a
 * double-click opens it again.
 */
export function useSplitFrameWidth({
  storageKey,
  closedLabel,
  defaultCollapsed = false,
  onCollapsedChange,
}: {
  storageKey: string;
  /** What assistive technology hears while the pane is closed. */
  closedLabel: string;
  defaultCollapsed?: boolean;
  /** The user closed or opened the pane (by dragging, a key or a double-click). */
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const paneRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(() => readStoredWidth(storageKey));
  const [collapsed, setCollapsedState] = useState(defaultCollapsed);
  const [resizing, setResizing] = useState(false);
  const [slidingClosed, setSlidingClosed] = useState(false);
  const dragRef = useRef<SplitFrameDrag | null>(null);
  const dragWidthAppliedRef = useRef(false);

  const holdContentWidth = (held: number | null) => {
    const content = contentRef.current;
    if (!content) return;
    if (held === null) content.style.removeProperty("width");
    else content.style.width = `${held}px`;
  };

  const writeDragWidth = (next: number | null) => {
    const pane = paneRef.current;
    if (!pane) return;
    dragWidthAppliedRef.current = next !== null;
    writeSplitFrameDragWidth(pane, next, [pane]);
  };

  // The drag's width is taken off in the commit that gives the pane the
  // width it settles at (the pane writes that first, being a child), so the
  // boxes never show a width in between. A closed pane's content keeps its
  // width, so that it slid out at it.
  useLayoutEffect(() => {
    const drag = dragRef.current;
    if (drag) return;
    if (dragWidthAppliedRef.current) writeDragWidth(null);
    holdContentWidth(collapsed ? width : null);
  });
  useLayoutEffect(() => {
    const pane = paneRef.current;
    return () => {
      if (pane && dragWidthAppliedRef.current) {
        writeSplitFrameDragWidth(pane, null, [pane]);
      }
    };
  }, []);

  const setCollapsed = (next: boolean) => {
    setCollapsedState(next);
    if (next !== collapsed) onCollapsedChange?.(next);
  };

  const commitWidth = (next: number) => {
    setWidth(next);
    store(storageKey, String(Math.round(next)));
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const drag = startSplitFrameDrag(
      event.pointerId,
      event.clientX,
      width,
      collapsed,
    );
    dragRef.current = drag;
    setResizing(true);
    writeDragWidth(drag.previewWidth);
    holdContentWidth(drag.expandedWidth);
  };

  // Only the boxes' own width is written while the pointer moves; React
  // hears of it where it changes what is rendered, and when it is let go.
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const { collapsedChanged, slidingChanged } = moveSplitFrameDrag(
      drag,
      event.clientX,
    );
    writeDragWidth(drag.previewWidth);
    holdContentWidth(drag.expandedWidth);
    if (collapsedChanged) setCollapsedState(drag.collapsed);
    if (slidingChanged) {
      setSlidingClosed(drag.previewWidth < SPLIT_FRAME_MIN_WIDTH);
    }
  };

  const endDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled: boolean,
  ) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(drag.pointerId);
    setResizing(false);
    setSlidingClosed(false);
    const settled = settleSplitFrameDrag(drag, cancelled);
    setCollapsedState(settled.collapsed);
    if (settled.collapsed !== drag.collapsedAtStart) {
      onCollapsedChange?.(settled.collapsed);
    }
    if (cancelled || settled.collapsed) setWidth(settled.width);
    else commitWidth(settled.width);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const next = splitFrameKeyStep(event.key, width, collapsed);
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    setCollapsed(next.collapsed);
    if (next.width !== width) commitWidth(next.width);
  };

  return {
    paneRef,
    contentRef,
    /** The width the pane takes now: none while it is closed. */
    paneWidth: collapsed ? 0 : width,
    collapsed,
    setCollapsed,
    gutterProps: {
      resizing,
      "aria-valuemin": SPLIT_FRAME_MIN_WIDTH,
      "aria-valuemax": SPLIT_FRAME_MAX_WIDTH,
      "aria-valuenow": collapsed ? undefined : Math.round(width),
      "aria-valuetext": splitFrameValueText(
        width,
        collapsed,
        resizing && slidingClosed,
        closedLabel,
      ),
      onPointerDown,
      onPointerMove,
      onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) =>
        endDrag(event, false),
      onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) =>
        endDrag(event, true),
      onDoubleClick: () => setCollapsed(!collapsed),
      onKeyDown,
    },
  };
}
