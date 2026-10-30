/**
 * The DOM side of SplitFramePane, kept apart from the component so that the
 * head bootstrap scripts and the pages that drive a pane's width can use it
 * without loading the component or its stylesheet (split-frame-pane.css,
 * which explains the properties and attributes below).
 */

/** On the shell and its frame while a pane splits the frame. */
export const SPLIT_FRAME_ATTRIBUTE = "data-split-frame";
/** On the shell and its frame while the gutter is dragged. */
const RESIZING_ATTRIBUTE = "data-split-frame-resizing";
/**
 * On the document while the window is wide enough for the pane a prerendered
 * page brings (the lesson page's course content), so that the stylesheet can
 * find that pane by itself before any script has marked the shell.
 */
const PRERENDERED_ATTRIBUTE = "data-split-frame-prerendered";
/** The width a drag has reached, on each element sized from it. */
const DRAG_WIDTH_PROPERTY = "--split-frame-drag-width";
/** The pane's width at rest, when the page gives it one of its own. */
export const SPLIT_FRAME_TARGET_WIDTH_PROPERTY = "--split-frame-target-width";

/** The shell and its frame: the two ancestors that change shape. */
export function findSplitFrameBoxes(element: HTMLElement) {
  return {
    shell: element.closest<HTMLElement>(".courses-app"),
    frame: element.closest<HTMLElement>(".courses-main-frame"),
  };
}

/**
 * Puts the width a drag of the gutter has reached on the shell, the frame
 * and the given elements (the pane, and anything of the page's own sized
 * from the width), or takes it off again with `null`. The property is not
 * inherited, so each write re-styles those elements and nothing under them.
 * The shell and frame are also marked as resizing for as long as the width
 * is on them, which holds their transitions.
 */
export function writeSplitFrameDragWidth(
  anchor: HTMLElement,
  width: number | null,
  elements: readonly (HTMLElement | null)[],
) {
  const { shell, frame } = findSplitFrameBoxes(anchor);
  const boxes = [shell, frame];
  if (width === null) {
    for (const element of [...boxes, ...elements]) {
      element?.style.removeProperty(DRAG_WIDTH_PROPERTY);
    }
    for (const element of boxes) element?.removeAttribute(RESIZING_ATTRIBUTE);
    return;
  }
  for (const element of boxes) {
    if (element && !element.hasAttribute(RESIZING_ATTRIBUTE)) {
      element.setAttribute(RESIZING_ATTRIBUTE, "");
    }
  }
  const value = `${width}px`;
  for (const element of [...boxes, ...elements]) {
    element?.style.setProperty(DRAG_WIDTH_PROPERTY, value);
  }
}

/**
 * For a head bootstrap script: keeps `data-split-frame-prerendered` on the
 * document while `media` matches. Expects the document element as `r`.
 */
export const getSplitFramePrerenderedScript = (media: string) =>
  `{const m=matchMedia(${JSON.stringify(media)}),p=()=>r.toggleAttribute(${JSON.stringify(PRERENDERED_ATTRIBUTE)},m.matches);p();m.addEventListener("change",p)}`;

/*
 * How a pane's width is resized: the lesson page's course content set the
 * rules and every pane follows them, so they live here, used by the lesson
 * page's own resizing (useCurriculumResize) and by useSplitFrameWidth.
 */
export const SPLIT_FRAME_MIN_WIDTH = 300;
export const SPLIT_FRAME_DEFAULT_WIDTH = 400;
export const SPLIT_FRAME_MAX_WIDTH = 560;
/** Let go narrower than this, the pane closes. */
export const SPLIT_FRAME_SNAP_WIDTH = SPLIT_FRAME_MIN_WIDTH / 2;
export const SPLIT_FRAME_KEYBOARD_STEP = 16;

export const clampSplitFrameWidth = (value: number) =>
  Math.min(SPLIT_FRAME_MAX_WIDTH, Math.max(SPLIT_FRAME_MIN_WIDTH, value));

export interface SplitFrameDrag {
  pointerId: number;
  startX: number;
  startWidth: number;
  expandedWidthAtStart: number;
  collapsedAtStart: boolean;
  collapsed: boolean;
  previewWidth: number;
  /** The width its content is laid out at: the last one at or over the minimum. */
  expandedWidth: number;
}

export function startSplitFrameDrag(
  pointerId: number,
  clientX: number,
  width: number,
  collapsed: boolean,
): SplitFrameDrag {
  const startWidth = collapsed ? 0 : width;
  return {
    pointerId,
    startX: clientX,
    startWidth,
    expandedWidthAtStart: width,
    collapsedAtStart: collapsed,
    collapsed,
    previewWidth: startWidth,
    expandedWidth: width,
  };
}

/**
 * While the gutter is held, the pane is exactly as wide as the pointer makes
 * it, from nothing to the maximum: it never jumps to a width of its own. Its
 * content shows for as long as there is any width to show it in, so it
 * slides out from the edge instead of appearing at a threshold, and under
 * the minimum it keeps the last width it had at or over it. Says what
 * changed that renders differently: closed or open, sliding closed or not.
 */
export function moveSplitFrameDrag(drag: SplitFrameDrag, clientX: number) {
  const previewWidth = Math.min(
    SPLIT_FRAME_MAX_WIDTH,
    Math.max(0, drag.startWidth + drag.startX - clientX),
  );
  const hidden = previewWidth <= 0;
  const collapsedChanged = drag.collapsed !== hidden;
  drag.collapsed = hidden;
  const slidingClosed = previewWidth < SPLIT_FRAME_MIN_WIDTH;
  const slidingChanged =
    drag.previewWidth < SPLIT_FRAME_MIN_WIDTH !== slidingClosed;
  drag.previewWidth = previewWidth;
  if (!slidingClosed) drag.expandedWidth = previewWidth;
  return { collapsedChanged, slidingChanged };
}

/**
 * Where a drag settles. Cancelled, it goes back to where it started. Let go
 * less than half-way to the minimum width, the pane closes (and keeps the
 * width it had for next time). Anything wider stays open, at the minimum
 * width if it was let go narrower than that.
 */
export function settleSplitFrameDrag(drag: SplitFrameDrag, cancelled: boolean) {
  if (cancelled) {
    return {
      collapsed: drag.collapsedAtStart,
      width: drag.expandedWidthAtStart,
    };
  }
  if (drag.previewWidth < SPLIT_FRAME_SNAP_WIDTH) {
    return { collapsed: true, width: drag.expandedWidthAtStart };
  }
  return { collapsed: false, width: clampSplitFrameWidth(drag.previewWidth) };
}

/**
 * The gutter's keys: the arrows step the width (a closed pane opens at the
 * minimum with the left arrow), Home closes, End opens at the maximum.
 * `null` for any other key.
 */
export function splitFrameKeyStep(
  key: string,
  width: number,
  collapsed: boolean,
): { collapsed: boolean; width: number } | null {
  if (key === "ArrowRight" || key === "ArrowLeft") {
    if (collapsed) {
      return key === "ArrowLeft"
        ? { collapsed: false, width: SPLIT_FRAME_MIN_WIDTH }
        : { collapsed, width };
    }
    const step =
      key === "ArrowRight"
        ? -SPLIT_FRAME_KEYBOARD_STEP
        : SPLIT_FRAME_KEYBOARD_STEP;
    return { collapsed: false, width: clampSplitFrameWidth(width + step) };
  }
  if (key === "Home") return { collapsed: true, width };
  if (key === "End") return { collapsed: false, width: SPLIT_FRAME_MAX_WIDTH };
  return null;
}

/** What assistive technology hears the gutter's value as. */
export const splitFrameValueText = (
  width: number,
  collapsed: boolean,
  slidingClosed: boolean,
  closedLabel: string,
) =>
  collapsed
    ? closedLabel
    : `${Math.round(width)} pixels wide${slidingClosed ? ", sliding closed" : ""}`;
