import {
  useEffect,
  useState,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { suspendDragForAltTextSelect } from "../../courses/altDragTextSelect";

/** Marks a drag as a course on its way to being pinned to the home. */
const PIN_COURSE_DRAG_TYPE = "application/x-veolms-pin-course";
const PIN_COURSE_ATTRIBUTE = "data-pin-course-id";
const PIN_DROP_ZONE_SELECTOR = "[data-learner-hero-pin-drop]";

/**
 * A touch drag is the page's own, not the browser's: a touch screen either
 * has no drag and drop for a long press, or opens the long press's own menu
 * (the card is links and pictures) as well. These events carry it: one on
 * the window as it starts and ends (`detail.courseId`, null at the end),
 * and two on the drop zone, as the finger comes over it or leaves it
 * (`detail.over`) and as the card is let go on it (`detail.courseId`).
 */
const PIN_TOUCH_DRAG_EVENT = "veolms:pin-course-touch-drag";
export const PIN_DROP_OVER_EVENT = "veolms:pin-course-drop-over";
export const PIN_DROP_EVENT = "veolms:pin-course-drop";

/** How long a finger rests on a card before it picks the card up. */
const PIN_TOUCH_HOLD_MS = 400;
/** A finger that moves further before that is scrolling the page. */
const PIN_TOUCH_SLOP_PX = 8;

/**
 * Near the top or bottom edge of the screen, a carried card scrolls the page
 * under it, faster the closer it gets, so the hero can be reached from a
 * card far down the page without letting go first.
 */
const AUTO_SCROLL_EDGE_PX = 80;
/** The most it scrolls in one frame, right at the edge. */
const AUTO_SCROLL_MAX_STEP_PX = 18;

interface AutoScroll {
  scroller: HTMLElement;
  y: number;
  frame: number;
  /** After each step that moved the page (a touch drag re-aims its card). */
  onScroll?: () => void;
  stop: () => void;
}

let autoScroll: AutoScroll | null = null;

/** What the page scrolls in around `element`: a scrolling box, or the page. */
function scrollerOf(element: Element): HTMLElement {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (
      /(auto|scroll)/.test(overflowY) &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.body;
}

function stepAutoScroll() {
  const scroll = autoScroll;
  if (!scroll) return;
  const { scroller, y } = scroll;
  const page = scroller === document.scrollingElement;
  const box = scroller.getBoundingClientRect();
  const top = page ? 0 : Math.max(0, box.top);
  const bottom = page
    ? window.innerHeight
    : Math.min(window.innerHeight, box.bottom);
  let step = 0;
  if (y < top + AUTO_SCROLL_EDGE_PX) {
    step =
      -AUTO_SCROLL_MAX_STEP_PX *
      (1 - Math.max(0, y - top) / AUTO_SCROLL_EDGE_PX);
  } else if (y > bottom - AUTO_SCROLL_EDGE_PX) {
    step =
      AUTO_SCROLL_MAX_STEP_PX *
      (1 - Math.max(0, bottom - y) / AUTO_SCROLL_EDGE_PX);
  }
  if (step !== 0) {
    const before = scroller.scrollTop;
    scroller.scrollTop = before + step;
    if (scroller.scrollTop !== before) scroll.onScroll?.();
  }
  scroll.frame = window.requestAnimationFrame(stepAutoScroll);
}

function startAutoScroll(
  from: Element,
  y: number,
  options: { mouse?: boolean; onScroll?: () => void } = {},
) {
  stopAutoScroll();
  // A mouse drag tells where it is only through drag events, which keep
  // coming while it is held still.
  const follow = (event: globalThis.DragEvent) =>
    updateAutoScroll(event.clientY);
  if (options.mouse) {
    document.addEventListener("dragover", follow);
    document.addEventListener("dragend", stopAutoScroll);
    document.addEventListener("drop", stopAutoScroll);
  }
  autoScroll = {
    scroller: scrollerOf(from),
    y,
    frame: window.requestAnimationFrame(stepAutoScroll),
    onScroll: options.onScroll,
    stop: () => {
      document.removeEventListener("dragover", follow);
      document.removeEventListener("dragend", stopAutoScroll);
      document.removeEventListener("drop", stopAutoScroll);
    },
  };
}

function updateAutoScroll(y: number) {
  if (autoScroll) autoScroll.y = y;
}

function stopAutoScroll() {
  const scroll = autoScroll;
  if (!scroll) return;
  autoScroll = null;
  window.cancelAnimationFrame(scroll.frame);
  scroll.stop();
}

interface TouchPress {
  pointerId: number;
  card: HTMLElement;
  courseId: string;
  startX: number;
  startY: number;
  timer: number;
  dragging: boolean;
  ghost: HTMLElement | null;
  offsetX: number;
  offsetY: number;
  /** Where the finger is now. */
  x: number;
  y: number;
  zone: Element | null;
  stop: () => void;
}

let touchPress: TouchPress | null = null;
/** Until when the click that ends a touch drag, or a long press, is ignored. */
let swallowClickUntil = 0;

const preventTouchScroll = (event: TouchEvent) => {
  if (event.cancelable) event.preventDefault();
};

function setDropZoneOver(press: TouchPress, zone: Element | null) {
  if (zone === press.zone) return;
  press.zone?.dispatchEvent(
    new CustomEvent(PIN_DROP_OVER_EVENT, { detail: { over: false } }),
  );
  zone?.dispatchEvent(
    new CustomEvent(PIN_DROP_OVER_EVENT, { detail: { over: true } }),
  );
  press.zone = zone;
}

function moveGhost(press: TouchPress, x: number, y: number) {
  press.x = x;
  press.y = y;
  updateAutoScroll(y);
  if (!press.ghost) return;
  press.ghost.style.transform = `translate(${x - press.offsetX}px, ${
    y - press.offsetY
  }px) scale(1.03)`;
  setDropZoneOver(
    press,
    document.elementFromPoint(x, y)?.closest(PIN_DROP_ZONE_SELECTOR) ?? null,
  );
}

function pickUp(press: TouchPress) {
  press.dragging = true;
  swallowClickUntil = Number.POSITIVE_INFINITY;
  // From here the finger carries the card, so it no longer scrolls the page.
  // Scrolling has not begun (the finger has rested), so the moves can still
  // be held back.
  document.addEventListener("touchmove", preventTouchScroll, {
    passive: false,
  });
  const box = press.card.getBoundingClientRect();
  press.offsetX = press.startX - box.left;
  press.offsetY = press.startY - box.top;
  const ghost = press.card.cloneNode(true) as HTMLElement;
  ghost.removeAttribute(PIN_COURSE_ATTRIBUTE);
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: `${box.width}px`,
    height: `${box.height}px`,
    margin: "0",
    zIndex: "1000",
    pointerEvents: "none",
    opacity: "0.92",
    transition: "none",
    boxShadow: "0 18px 40px rgb(0 0 0 / 0.45)",
  });
  document.body.append(ghost);
  press.ghost = ghost;
  moveGhost(press, press.startX, press.startY);
  // The page under the card moves: what lies under the finger is found again.
  startAutoScroll(press.card, press.startY, {
    onScroll: () => moveGhost(press, press.x, press.y),
  });
  window.dispatchEvent(
    new CustomEvent(PIN_TOUCH_DRAG_EVENT, {
      detail: { courseId: press.courseId },
    }),
  );
}

function endTouchPress(drop: boolean) {
  const press = touchPress;
  if (!press) return;
  touchPress = null;
  window.clearTimeout(press.timer);
  press.stop();
  if (!press.dragging) return;
  stopAutoScroll();
  document.removeEventListener("touchmove", preventTouchScroll);
  const zone = press.zone;
  setDropZoneOver(press, null);
  press.ghost?.remove();
  if (drop && zone) {
    zone.dispatchEvent(
      new CustomEvent(PIN_DROP_EVENT, { detail: { courseId: press.courseId } }),
    );
  }
  window.dispatchEvent(
    new CustomEvent(PIN_TOUCH_DRAG_EVENT, { detail: { courseId: null } }),
  );
  // The click the browser sends after the finger comes up opens nothing.
  swallowClickUntil = performance.now() + 600;
}

function startTouchPress(event: PointerEvent<HTMLElement>, courseId: string) {
  if (event.pointerType === "mouse" || !event.isPrimary) return;
  endTouchPress(false);
  const pointerId = event.pointerId;
  const move = (moveEvent: globalThis.PointerEvent) => {
    const press = touchPress;
    if (!press || moveEvent.pointerId !== pointerId) return;
    if (press.dragging) {
      moveGhost(press, moveEvent.clientX, moveEvent.clientY);
    } else if (
      Math.hypot(
        moveEvent.clientX - press.startX,
        moveEvent.clientY - press.startY,
      ) > PIN_TOUCH_SLOP_PX
    ) {
      endTouchPress(false);
    }
  };
  const up = (upEvent: globalThis.PointerEvent) => {
    if (upEvent.pointerId === pointerId) endTouchPress(true);
  };
  const cancel = (cancelEvent: globalThis.PointerEvent) => {
    if (cancelEvent.pointerId === pointerId) endTouchPress(false);
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", cancel);
  touchPress = {
    pointerId,
    card: event.currentTarget,
    courseId,
    startX: event.clientX,
    startY: event.clientY,
    timer: window.setTimeout(() => {
      if (touchPress?.pointerId === pointerId) pickUp(touchPress);
    }, PIN_TOUCH_HOLD_MS),
    dragging: false,
    ghost: null,
    offsetX: 0,
    offsetY: 0,
    x: event.clientX,
    y: event.clientY,
    zone: null,
    stop: () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
    },
  };
}

/**
 * What a course card needs to be dragged onto the hero. The drag may start
 * on anything in the card (its picture and its links start drags of their
 * own), so the card is what the pointer is shown carrying.
 *
 * A mouse uses the browser's drag and drop. A finger holds the card for a
 * moment to pick it up, and then the page carries a copy of it (see
 * `PIN_TOUCH_DRAG_EVENT`); the long press's own menu is not opened.
 */
export function getPinCourseDragProps(courseId: string) {
  return {
    draggable: true,
    [PIN_COURSE_ATTRIBUTE]: courseId,
    // Safari's long-press preview of a link or picture.
    style: { WebkitTouchCallout: "none" } as const,
    onPointerDownCapture(event: PointerEvent<HTMLElement>) {
      // Alt-drag selects the card's text instead of carrying the card.
      suspendDragForAltTextSelect(event);
    },
    onPointerDown(event: PointerEvent<HTMLElement>) {
      startTouchPress(event, courseId);
    },
    onContextMenu(event: MouseEvent<HTMLElement>) {
      if (touchPress || performance.now() < swallowClickUntil) {
        event.preventDefault();
      }
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (performance.now() < swallowClickUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    onDragStart(event: DragEvent<HTMLElement>) {
      // A finger's own drag and drop, where a browser has one, would race
      // the page's.
      if (touchPress) {
        event.preventDefault();
        return;
      }
      const card = event.currentTarget;
      const box = card.getBoundingClientRect();
      event.dataTransfer.setData(PIN_COURSE_DRAG_TYPE, courseId);
      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setDragImage(
        card,
        event.clientX - box.left,
        event.clientY - box.top,
      );
      startAutoScroll(card, event.clientY, { mouse: true });
    },
  };
}

/** The course a drop carries, when it is one of the learner's cards. */
export function readPinCourseDrop(event: DragEvent<HTMLElement>) {
  return event.dataTransfer.getData(PIN_COURSE_DRAG_TYPE) || null;
}

/** The id of the course card being dragged right now, if one is. */
export function useDraggedPinCourseId() {
  const [courseId, setCourseId] = useState<string | null>(null);

  useEffect(() => {
    const start = (event: globalThis.DragEvent) => {
      const card =
        event.target instanceof Element
          ? event.target.closest(`[${PIN_COURSE_ATTRIBUTE}]`)
          : null;
      setCourseId(card?.getAttribute(PIN_COURSE_ATTRIBUTE) ?? null);
    };
    const end = () => setCourseId(null);
    const touchDrag = (event: Event) => {
      setCourseId(
        (event as CustomEvent<{ courseId: string | null }>).detail.courseId,
      );
    };
    document.addEventListener("dragstart", start);
    document.addEventListener("dragend", end);
    document.addEventListener("drop", end);
    window.addEventListener(PIN_TOUCH_DRAG_EVENT, touchDrag);
    return () => {
      document.removeEventListener("dragstart", start);
      document.removeEventListener("dragend", end);
      document.removeEventListener("drop", end);
      window.removeEventListener(PIN_TOUCH_DRAG_EVENT, touchDrag);
    };
  }, []);

  return courseId;
}
