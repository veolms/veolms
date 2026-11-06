import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
} from "react";
import { moveCourseTo, sameOrder } from "./courseOrder";
import {
  scrollParentOf,
  startAutoScroll,
  type AutoScroller,
} from "./dragAutoScroll";

const DRAG_TYPE = "application/x-veolms-course";

export interface CourseDragHandlers {
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

export interface CoursePointerDragHandlers {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
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
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
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

  const pointerHandlersFor = (id: string): CoursePointerDragHandlers => ({
    onPointerDown: (event) => {
      // The mouse has the browser's drag and drop.
      if (event.pointerType === "mouse" || event.button !== 0) return;
      event.preventDefault();
      const handle = event.currentTarget;
      try {
        // The finger keeps steering this handle wherever it goes.
        handle.setPointerCapture(event.pointerId);
      } catch {
        // Already lifted: the pointer events below still end the drag.
      }
      begin(id, handle);
      lastPoint.current = { x: event.clientX, y: event.clientY };
      scroller.current?.update(event.clientY);

      const move = (moveEvent: globalThis.PointerEvent) => {
        if (moveEvent.pointerId !== event.pointerId) return;
        lastPoint.current = { x: moveEvent.clientX, y: moveEvent.clientY };
        scroller.current?.update(moveEvent.clientY);
        moveOver(lastPoint.current);
      };
      const end = (endEvent: globalThis.PointerEvent) => {
        if (endEvent.pointerId !== event.pointerId) return;
        finish(endEvent.type === "pointerup");
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
      stopListening.current = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
      };
    },
  });

  return { order, draggedId, handlersFor, pointerHandlersFor };
}
