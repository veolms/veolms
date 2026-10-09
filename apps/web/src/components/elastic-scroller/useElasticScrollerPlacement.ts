import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

/** How long the control is held still before it can be moved. */
const HOLD_TO_MOVE_MS = 450;
/**
 * A press that travels further than this before then is a scroll drag. A
 * thumb is given more room than a mouse: it rolls a little as it settles on
 * the glass, and with a mouse's allowance most holds were taken for a
 * (barely moving) scroll drag instead, and the control could not be moved.
 */
const HOLD_STILL_DISTANCE = 6;
const HOLD_STILL_DISTANCE_TOUCH = 14;
/**
 * Within this distance of the middle of the page (across), or of where the
 * control normally sits (up and down), it snaps to exactly there.
 */
const SNAP_DISTANCE = 18;
/** The closest its centre may come to an edge of the scrolling area. */
const EDGE_INSET = 30;
const STORAGE_PREFIX = "veolms-elastic-scroller-offset:";

interface Offset {
  x: number;
  y: number;
}

const HOME: Offset = { x: 0, y: 0 };

/**
 * The scrolling area as it lies around the control's usual place: its left
 * and top edges from the centre the control has there, and its size.
 */
export interface ElasticScrollerMoveArea {
  left: number;
  top: number;
  width: number;
  height: number;
  /** The area's own rounding, so what is drawn over it is cut to match. */
  radius: string;
}

function readOffset(placementKey: string): Offset {
  try {
    const stored = JSON.parse(
      localStorage.getItem(STORAGE_PREFIX + placementKey) ?? "null",
    ) as Partial<Offset> | null;
    if (
      stored &&
      Number.isFinite(stored.x) &&
      Number.isFinite(stored.y) &&
      (stored.x !== 0 || stored.y !== 0)
    ) {
      return { x: Number(stored.x), y: Number(stored.y) };
    }
  } catch {
    // Unreadable storage: the control sits where it normally does.
  }
  return HOME;
}

interface ScrollGestureHandlers {
  handlePointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handlePointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handlePointerFinish: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handlePointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  /** Ends the scroll drag a press began, keeping the pointer. */
  abandonPointerGesture: () => void;
  /** Shows the control and starts its wait before hiding afresh. */
  stayVisible: () => void;
  mode: string;
}

/**
 * Lets the learner put the elastic scroller where they want it.
 *
 * Dragging the control already means "scroll", so moving it is a separate
 * gesture: press it while it is at rest and hold still for a moment, then
 * drag. It follows the pointer anywhere inside the scrolling area, and
 * snaps into line as it nears the middle of the page from side to side, or
 * the height it normally sits at. Where it is left is remembered for that
 * scrolling area.
 *
 * It wraps the scroll gesture's own handlers: until the hold completes,
 * every event goes to them as before, and a press that moves early is the
 * scroll drag it always was.
 */
export function useElasticScrollerPlacement({
  control,
  placementKey,
  scrollportRef,
}: {
  control: ScrollGestureHandlers;
  placementKey: string;
  scrollportRef: RefObject<HTMLElement | null>;
}) {
  const [offset, setOffset] = useState<Offset>(HOME);
  const [moving, setMoving] = useState(false);
  // The area it is being moved in, for the guides drawn over it.
  const [moveArea, setMoveArea] = useState<ElasticScrollerMoveArea | null>(
    null,
  );
  // Whether the press that is moving it is a mouse's. A mouse pointer
  // covers nothing, so the wide ring shown around a thumb is left out.
  const [movingByMouse, setMovingByMouse] = useState(false);
  // A finger or the mouse is down on the control, whatever it goes on to
  // do there (hold it, move it, drag it to scroll, or hardly move at all).
  // The control is never hidden for being idle while it is being touched.
  const [held, setHeld] = useState(false);
  const offsetRef = useRef(offset);
  const pressRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    startOffset: Offset;
    /** How far it may go each way from where it normally sits. */
    limits: { minX: number; maxX: number; minY: number; maxY: number };
    area: ElasticScrollerMoveArea;
    moving: boolean;
  } | null>(null);
  const holdTimerRef = useRef<number | undefined>(undefined);
  const controlRef = useRef(control);
  useEffect(() => {
    controlRef.current = control;
  });

  // Read after mounting, so the server's markup and the first render agree.
  useEffect(() => {
    const stored = readOffset(placementKey);
    offsetRef.current = stored;
    setOffset(stored);
  }, [placementKey]);
  useEffect(() => () => window.clearTimeout(holdTimerRef.current), []);

  const place = useCallback((next: Offset) => {
    offsetRef.current = next;
    setOffset(next);
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const atRest = controlRef.current.mode === "idle";
      controlRef.current.handlePointerDown(event);
      window.clearTimeout(holdTimerRef.current);
      pressRef.current = null;
      if (event.button === 0) setHeld(true);
      setMovingByMouse(event.pointerType === "mouse");
      if (event.button !== 0 || !atRest) return;

      const scrollportElement = scrollportRef.current;
      const scrollport = scrollportElement?.getBoundingClientRect();
      const button = event.currentTarget.getBoundingClientRect();
      if (!scrollportElement || !scrollport) return;
      const start = offsetRef.current;
      // Where its centre is when it sits where it normally does.
      const homeX = button.left + button.width / 2 - start.x;
      const homeY = button.top + button.height / 2 - start.y;
      pressRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        startOffset: start,
        limits: {
          minX: scrollport.left + EDGE_INSET - homeX,
          maxX: scrollport.right - EDGE_INSET - homeX,
          minY: scrollport.top + EDGE_INSET - homeY,
          maxY: scrollport.bottom - EDGE_INSET - homeY,
        },
        area: {
          left: scrollport.left - homeX,
          top: scrollport.top - homeY,
          width: scrollport.width,
          height: scrollport.height,
          radius: getComputedStyle(scrollportElement).borderRadius,
        },
        moving: false,
      };
      holdTimerRef.current = window.setTimeout(() => {
        const press = pressRef.current;
        if (!press) return;
        press.moving = true;
        controlRef.current.abandonPointerGesture();
        setMoveArea(press.area);
        setMoving(true);
        navigator.vibrate?.(8);
      }, HOLD_TO_MOVE_MS);
    },
    [scrollportRef],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const press = pressRef.current;
      if (!press || press.pointerId !== event.pointerId) {
        controlRef.current.handlePointerMove(event);
        return;
      }
      const deltaX = event.clientX - press.x;
      const deltaY = event.clientY - press.y;
      if (!press.moving) {
        if (
          Math.hypot(deltaX, deltaY) >
          (event.pointerType === "mouse"
            ? HOLD_STILL_DISTANCE
            : HOLD_STILL_DISTANCE_TOUCH)
        ) {
          // It moved before the hold was up: this is a scroll drag.
          window.clearTimeout(holdTimerRef.current);
          pressRef.current = null;
        }
        controlRef.current.handlePointerMove(event);
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const { limits, startOffset } = press;
      let x = startOffset.x + deltaX;
      let y = startOffset.y + deltaY;
      if (Math.abs(x) <= SNAP_DISTANCE) x = 0;
      if (Math.abs(y) <= SNAP_DISTANCE) y = 0;
      place({
        x: Math.round(Math.min(limits.maxX, Math.max(limits.minX, x))),
        y: Math.round(Math.min(limits.maxY, Math.max(limits.minY, y))),
      });
    },
    [place],
  );

  const finish = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, cancelled: boolean) => {
      window.clearTimeout(holdTimerRef.current);
      const press = pressRef.current;
      pressRef.current = null;
      setHeld(false);
      if (!press?.moving || press.pointerId !== event.pointerId) {
        if (cancelled) controlRef.current.handlePointerCancel(event);
        else controlRef.current.handlePointerFinish(event);
        // Let go: it stays a while longer, as after any other use.
        controlRef.current.stayVisible();
        return;
      }
      controlRef.current.stayVisible();

      event.preventDefault();
      event.stopPropagation();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setMoving(false);
      // A move the browser cut short (it took the finger for something of
      // its own) is kept where it had got to, the same as one let go: put
      // back where it started, the control seemed to vanish from under the
      // finger.
      try {
        const settled = offsetRef.current;
        if (settled.x === 0 && settled.y === 0) {
          localStorage.removeItem(STORAGE_PREFIX + placementKey);
        } else {
          localStorage.setItem(
            STORAGE_PREFIX + placementKey,
            JSON.stringify(settled),
          );
        }
      } catch {
        // It stays where it was put until the page is left.
      }
    },
    [placementKey],
  );

  const handlePointerFinish = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => finish(event, false),
    [finish],
  );
  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => finish(event, true),
    [finish],
  );
  /** The pointer is gone, however that came about: nothing holds it now. */
  const handleLostPointerCapture = useCallback(() => {
    if (!pressRef.current?.moving) setHeld(false);
  }, []);

  /**
   * On a touch screen, holding a finger still is also how the browser is
   * asked for its menu (of the page, or of the link or image under the
   * finger). Left alone, that menu opened over the control just as the hold
   * completed, and took the finger away from it, so it could never be
   * moved. A press on the control keeps the menu shut; a right click with a
   * mouse is no such press and opens it as always.
   */
  const handleContextMenu = useCallback((event: { preventDefault(): void }) => {
    if (pressRef.current) event.preventDefault();
  }, []);

  return {
    offset,
    moving,
    /** While it is being moved: the scrolling area it is moved in. */
    moveArea: moving ? moveArea : null,
    /** Being moved under a finger or a pen, which hides it from view. */
    movingUnderFinger: moving && !movingByMouse,
    held,
    handleContextMenu,
    /** In line with the middle of the page, or with its usual height. */
    snappedX: moving && offset.x === 0,
    snappedY: moving && offset.y === 0,
    handlePointerDown,
    handlePointerMove,
    handlePointerFinish,
    handlePointerCancel,
    handleLostPointerCapture,
  };
}
