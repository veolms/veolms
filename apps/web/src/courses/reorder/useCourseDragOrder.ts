import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { moveCourseTo, sameOrder } from "./courseOrder";
import {
  scrollParentOf,
  startAutoScroll,
  type AutoScroller,
} from "./dragAutoScroll";

const DRAG_TYPE = "application/x-veolms-course";
/** How long a finger holds a card before it is picked up. */
const HOLD_MS = 280;
/** How far a finger may drift while holding before it counts as a scroll. */
const HOLD_SLOP_PX = 10;

export interface CourseDragHandlers {
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

export interface CoursePointerDragHandlers {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void;
}

/**
 * Courses reordered by dragging one onto another's place. While a course is
 * dragged the list shows where it would land, and the list scrolls when the
 * pointer nears its top or bottom edge; dropping hands the new order to
 * `onCommit`, and letting go anywhere else puts everything back.
 *
 * A mouse drags with the browser's own drag and drop (`handlersFor`, on the
 * dragged element). A finger drags from a handle (`pointerHandlersFor`):
 * the browser's drag starts only after a long press there, and fights the
 * page's scrolling. Each element that can be dropped on carries
 * `data-course-drop-id` with its course id.
 */
export function useCourseDragOrder(
  ids: readonly string[],
  onCommit: (ids: string[]) => void,
) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
  const dragged = useRef<string | null>(null);
  const previewRef = useRef<string[] | null>(null);
  const scroller = useRef<AutoScroller | null>(null);
  const stopListening = useRef<(() => void) | null>(null);
  /** Where the pointer last was, in viewport coordinates. */
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  /** What last pressed a course; a touch never starts the browser's drag. */
  const lastPointerType = useRef<string>("mouse");
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const order = preview ?? ids;

  function setOrder(next: string[]) {
    previewRef.current = next;
    setPreview(next);
  }

  function begin(id: string, source: Element) {
    dragged.current = id;
    setDraggedId(id);
    setOrder([...idsRef.current]);
    scroller.current?.stop();
    scroller.current = startAutoScroll(scrollParentOf(source), () =>
      lastPoint.current ? moveOver(lastPoint.current) : undefined,
    );
  }

  /** Moves the dragged course to where the course under (x, y) stands. */
  function moveOver(point: { x: number; y: number }) {
    const target = document
      .elementFromPoint(point.x, point.y)
      ?.closest<HTMLElement>("[data-course-drop-id]")?.dataset["courseDropId"];
    if (target) moveTo(target);
  }

  function moveTo(targetId: string) {
    const id = dragged.current;
    if (!id || targetId === id) return;
    const current = previewRef.current ?? [...idsRef.current];
    const next = moveCourseTo(current, id, targetId);
    if (!sameOrder(current, next)) setOrder(next);
  }

  function finish(commit: boolean) {
    const next = previewRef.current;
    scroller.current?.stop();
    scroller.current = null;
    stopListening.current?.();
    stopListening.current = null;
    lastPoint.current = null;
    dragged.current = null;
    previewRef.current = null;
    setDraggedId(null);
    setPreview(null);
    if (commit && next && !sameOrder(next, idsRef.current)) {
      commitRef.current([...next]);
    }
  }

  // A drag cut short by leaving the page stops scrolling with it.
  // Runs once, on unmount.
  useEffect(() => () => finish(false), []);

  const handlersFor = (id: string, label: string): CourseDragHandlers => ({
    onDragStart: (event) => {
      // A long press starts the browser's own drag on some touch screens;
      // a finger drags with the pointer events instead.
      if (lastPointerType.current !== "mouse" || dragged.current) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = "move";
      // A link inside the card would carry its address; the course is what
      // moves.
      event.dataTransfer.clearData();
      event.dataTransfer.setData(DRAG_TYPE, id);
      event.dataTransfer.setData("text/plain", label);
      const card = event.currentTarget;
      const box = card.getBoundingClientRect();
      event.dataTransfer.setDragImage(
        card,
        event.clientX - box.left,
        event.clientY - box.top,
      );
      begin(id, card);
      // The pointer's height, wherever it is on the page, steers the scroll.
      const track = (dragEvent: globalThis.DragEvent) => {
        if (dragEvent.clientY === 0 && dragEvent.clientX === 0) return;
        lastPoint.current = { x: dragEvent.clientX, y: dragEvent.clientY };
        scroller.current?.update(dragEvent.clientY);
      };
      document.addEventListener("dragover", track);
      stopListening.current = () =>
        document.removeEventListener("dragover", track);
    },
    onDragOver: (event) => {
      if (!dragged.current) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      moveTo(id);
    },
    onDrop: (event) => {
      if (!dragged.current) return;
      event.preventDefault();
      finish(true);
    },
    onDragEnd: () => finish(false),
  });

  /**
   * Follows one finger on the whole page until it lifts. The listeners are
   * on the document, not the element touched: reordering moves that
   * element in the page, and a moved element stops receiving the finger's
   * events. While the drag lasts the page does not scroll under the finger
   * (the auto-scroll does that).
   */
  function followFinger(pointerId: number) {
    const move = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      lastPoint.current = { x: event.clientX, y: event.clientY };
      scroller.current?.update(event.clientY);
      moveOver(lastPoint.current);
    };
    const end = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      finish(event.type === "pointerup");
      swallowNextClick();
    };
    const holdStill = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    document.addEventListener("touchmove", holdStill, { passive: false });
    stopListening.current = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      document.removeEventListener("touchmove", holdStill);
    };
  }

  /** A drop is not a tap: the card it ends on does not open. */
  function swallowNextClick() {
    const swallow = (event: globalThis.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("click", swallow, { capture: true, once: true });
    window.setTimeout(
      () => window.removeEventListener("click", swallow, { capture: true }),
      400,
    );
  }

  function startFingerDrag(
    id: string,
    source: HTMLElement,
    event: { pointerId: number; clientX: number; clientY: number },
  ) {
    begin(id, source);
    lastPoint.current = { x: event.clientX, y: event.clientY };
    scroller.current?.update(event.clientY);
    followFinger(event.pointerId);
    navigator.vibrate?.(12);
  }

  /** A handle that drags at once when a finger presses it. */
  const pointerHandlersFor = (id: string): CoursePointerDragHandlers => ({
    onPointerDown: (event) => {
      lastPointerType.current = event.pointerType;
      // The mouse has the browser's drag and drop.
      if (event.pointerType === "mouse" || event.button !== 0) return;
      event.preventDefault();
      startFingerDrag(id, event.currentTarget, event);
    },
  });

  /**
   * A whole card that a finger picks up by pressing and holding it; a
   * finger that moves first is scrolling the page, and a quick tap still
   * opens the card.
   */
  const holdHandlersFor = (id: string): CoursePointerDragHandlers => ({
    onPointerDown: (event) => {
      lastPointerType.current = event.pointerType;
      if (event.pointerType === "mouse" || event.button !== 0) return;
      if (dragged.current) return;
      const card = event.currentTarget;
      const pointerId = event.pointerId;
      const origin = { x: event.clientX, y: event.clientY };
      let latest = { pointerId, clientX: origin.x, clientY: origin.y };

      const cancel = () => {
        window.clearTimeout(timer);
        document.removeEventListener("pointermove", watch);
        document.removeEventListener("pointerup", cancel);
        document.removeEventListener("pointercancel", cancel);
      };
      const watch = (moveEvent: globalThis.PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        latest = {
          pointerId,
          clientX: moveEvent.clientX,
          clientY: moveEvent.clientY,
        };
        if (
          Math.hypot(
            moveEvent.clientX - origin.x,
            moveEvent.clientY - origin.y,
          ) > HOLD_SLOP_PX
        ) {
          cancel();
        }
      };
      const timer = window.setTimeout(() => {
        cancel();
        startFingerDrag(id, card, latest);
      }, HOLD_MS);
      document.addEventListener("pointermove", watch);
      document.addEventListener("pointerup", cancel);
      document.addEventListener("pointercancel", cancel);
    },
    // A held finger would open the browser's menu for the card's link.
    onContextMenu: (event) => {
      if (lastPointerType.current !== "mouse") event.preventDefault();
    },
  });

  return { order, draggedId, handlersFor, pointerHandlersFor, holdHandlersFor };
}
