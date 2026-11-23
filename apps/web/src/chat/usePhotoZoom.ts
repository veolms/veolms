import { useEffect, useRef, useState, type RefObject } from "react";

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
/** One press of the bar's zoom in or zoom out. */
const BUTTON_STEP = 1.5;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;
/** A press that moves less than this is a tap or a click, not a pan. */
const TAP_SLOP_PX = 6;

interface View {
  scale: number;
  x: number;
  y: number;
}

/**
 * Zoom for the photo in the media viewer (WhatsApp's): pinch with two
 * fingers or on a trackpad, Ctrl + wheel, or double tap / double click to
 * 2.5x and back; drag to move around a zoomed photo. Only the photo grows:
 * the browser's own zoom (which enlarged the whole site, chat and sidebar
 * included) never sees the gesture.
 *
 * `stage` is the area that takes the gestures, `photo` the element moved
 * and scaled (by transform, so nothing re-renders while it moves).
 * The view resets whenever `resetKey` changes. Returns the bar's zoom in
 * and zoom out (about the middle of the stage), and whether each can go
 * further.
 */
export function usePhotoZoom(
  stage: RefObject<HTMLElement | null>,
  photo: RefObject<HTMLElement | null>,
  resetKey: string,
) {
  const stepRef = useRef<((factor: number) => void) | null>(null);
  const [limits, setLimits] = useState({ atMin: true, atMax: false });
  // Read by the viewer's swipe while fingers move (state would lag).
  const zoomedRef = useRef(false);

  useEffect(() => {
    const area = stage.current;
    const target = photo.current;
    if (!area || !target) return;

    let view: View = { scale: 1, x: 0, y: 0 };
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: {
      distance: number;
      view: View;
      mid: { x: number; y: number };
    } | null = null;
    let pan: {
      x: number;
      y: number;
      view: View;
      moved: boolean;
      /** Pressed on the photo itself (not beside it, nor on a button). */
      onPhoto: boolean;
    } | null = null;
    let lastTap: { at: number; x: number; y: number } | null = null;

    const prepare = (element: HTMLElement) => {
      element.style.transformOrigin = "0 0";
      element.style.willChange = "transform";
    };
    prepare(target);

    /**
     * Keeps the picture on screen. `target` fills the viewer and holds the
     * picture in its middle, so the picture's own box is what is kept in:
     * bigger than the screen along an axis, its edges never come inside the
     * screen's; smaller, it stays centred along it. (Keeping `target` in
     * bounds instead let a pinch and a drag move the picture out of sight.)
     */
    const clampAxis = (
      offset: number,
      scale: number,
      start: number,
      size: number,
      room: number,
    ) => {
      const scaled = size * scale;
      if (scaled <= room) return (room - scaled) / 2 - start * scale;
      return Math.min(
        -start * scale,
        Math.max(room - (start + size) * scale, offset),
      );
    };
    const clamp = (next: View): View => {
      const scale = Math.min(MAX_SCALE, Math.max(1, next.scale));
      if (scale === 1) return { scale: 1, x: 0, y: 0 };
      const picture = target.querySelector("img") ?? target;
      const inside = picture !== target;
      return {
        scale,
        x: clampAxis(
          next.x,
          scale,
          inside ? picture.offsetLeft : 0,
          picture.offsetWidth,
          target.offsetWidth,
        ),
        y: clampAxis(
          next.y,
          scale,
          inside ? picture.offsetTop : 0,
          picture.offsetHeight,
          target.offsetHeight,
        ),
      };
    };
    const apply = (next: View, animate = false) => {
      view = clamp(next);
      zoomedRef.current = view.scale > 1;
      // Only a change of either end re-renders (not every pinch frame).
      const atMin = view.scale <= 1;
      const atMax = view.scale >= MAX_SCALE - 0.01;
      setLimits((current) =>
        current.atMin === atMin && current.atMax === atMax
          ? current
          : { atMin, atMax },
      );
      target.style.transition = animate ? "transform 180ms ease-out" : "none";
      target.style.transform =
        view.scale === 1
          ? ""
          : `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;
      area.style.cursor = view.scale > 1 ? "grab" : "";
    };
    /** Zooms to `scale` keeping the point under (clientX, clientY) still. */
    const zoomAt = (
      scale: number,
      clientX: number,
      clientY: number,
      from = view,
    ) => {
      const box = target.getBoundingClientRect();
      // The point in the photo's own (unscaled) coordinates.
      const originLeft = box.left - from.x;
      const originTop = box.top - from.y;
      const px = (clientX - originLeft - from.x) / from.scale;
      const py = (clientY - originTop - from.y) / from.scale;
      return {
        scale,
        x: clientX - originLeft - px * scale,
        y: clientY - originTop - py * scale,
      };
    };

    const onWheel = (event: WheelEvent) => {
      // A trackpad pinch arrives as a wheel with ctrlKey; so does Ctrl +
      // wheel. Taken here, the page itself is never zoomed.
      if (event.ctrlKey) {
        event.preventDefault();
        const factor = Math.exp(-event.deltaY * 0.01);
        apply(zoomAt(view.scale * factor, event.clientX, event.clientY));
        return;
      }
      if (view.scale > 1) {
        // Scrolling a zoomed photo moves around it.
        event.preventDefault();
        apply({ ...view, x: view.x - event.deltaX, y: view.y - event.deltaY });
      }
    };

    const distanceOf = () => {
      const [a, b] = [...pointers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const midOf = () => {
      const [a, b] = [...pointers.values()];
      return a && b
        ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        : { x: 0, y: 0 };
    };

    const onPointerDown = (event: PointerEvent) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        pan = null;
        pinch = { distance: distanceOf(), view, mid: midOf() };
      } else if (pointers.size === 1) {
        pan = {
          x: event.clientX,
          y: event.clientY,
          view,
          moved: false,
          onPhoto:
            event.target instanceof HTMLImageElement &&
            target.contains(event.target),
        };
      }
    };
    // Held only once a drag or pinch is under way: held from the press, the
    // release and its click went to the area, not to what was pressed (a
    // Next button, the photo for a double tap).
    const hold = (pointerId: number) => {
      try {
        if (!area.hasPointerCapture(pointerId))
          area.setPointerCapture(pointerId);
      } catch {
        // The pointer is already gone.
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinch && pointers.size === 2) {
        hold(event.pointerId);
        const mid = midOf();
        const zoomed = zoomAt(
          pinch.view.scale * (distanceOf() / Math.max(1, pinch.distance)),
          pinch.mid.x,
          pinch.mid.y,
          pinch.view,
        );
        // The photo follows the fingers as they move together too.
        apply({
          ...zoomed,
          x: zoomed.x + (mid.x - pinch.mid.x),
          y: zoomed.y + (mid.y - pinch.mid.y),
        });
        return;
      }
      if (pan) {
        const dx = event.clientX - pan.x;
        const dy = event.clientY - pan.y;
        if (!pan.moved && Math.hypot(dx, dy) < TAP_SLOP_PX) return;
        pan.moved = true;
        if (view.scale > 1) {
          hold(event.pointerId);
          area.style.cursor = "grabbing";
          apply({ ...pan.view, x: pan.view.x + dx, y: pan.view.y + dy });
        }
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      const wasPan = pan;
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 1) {
        const [rest] = [...pointers.values()];
        pan = rest
          ? { x: rest.x, y: rest.y, view, moved: true, onPhoto: false }
          : null;
        return;
      }
      pan = null;
      if (view.scale > 1) area.style.cursor = "grab";
      // A double tap (or double click) on the photo: in to 2.5x where it
      // was tapped, or back out.
      if (!wasPan || wasPan.moved || !wasPan.onPhoto) {
        lastTap = null;
        return;
      }
      const now = performance.now();
      if (
        lastTap &&
        now - lastTap.at < DOUBLE_TAP_MS &&
        Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) <
          DOUBLE_TAP_PX
      ) {
        lastTap = null;
        apply(
          view.scale > 1
            ? { scale: 1, x: 0, y: 0 }
            : zoomAt(DOUBLE_TAP_SCALE, event.clientX, event.clientY),
          true,
        );
        return;
      }
      lastTap = { at: now, x: event.clientX, y: event.clientY };
    };

    const onPointerCancel = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) pan = null;
    };

    // A zoomed photo was dragged: the click that ends the drag must not
    // close the viewer (a click outside the photo does).
    const onClickCapture = (event: MouseEvent) => {
      if (
        view.scale > 1 &&
        !(event.target instanceof Element && event.target.closest("button, a"))
      ) {
        event.stopPropagation();
      }
    };

    // The bar's buttons zoom about the middle of the stage.
    stepRef.current = (factor) => {
      const box = area.getBoundingClientRect();
      apply(
        zoomAt(
          view.scale * factor,
          box.left + box.width / 2,
          box.top + box.height / 2,
        ),
        true,
      );
    };
    setLimits({ atMin: true, atMax: false });

    // Safari's own pinch events: kept from zooming the page.
    const stopGesture = (event: Event) => event.preventDefault();

    area.addEventListener("wheel", onWheel, { passive: false });
    area.addEventListener("pointerdown", onPointerDown);
    area.addEventListener("pointermove", onPointerMove);
    area.addEventListener("pointerup", onPointerUp);
    area.addEventListener("pointercancel", onPointerCancel);
    area.addEventListener("click", onClickCapture, true);
    area.addEventListener("gesturestart", stopGesture);
    area.addEventListener("gesturechange", stopGesture);
    return () => {
      stepRef.current = null;
      zoomedRef.current = false;
      area.removeEventListener("wheel", onWheel);
      area.removeEventListener("pointerdown", onPointerDown);
      area.removeEventListener("pointermove", onPointerMove);
      area.removeEventListener("pointerup", onPointerUp);
      area.removeEventListener("pointercancel", onPointerCancel);
      area.removeEventListener("click", onClickCapture, true);
      area.removeEventListener("gesturestart", stopGesture);
      area.removeEventListener("gesturechange", stopGesture);
      target.style.transform = "";
      target.style.transition = "";
      target.style.willChange = "";
      area.style.cursor = "";
    };
  }, [photo, resetKey, stage]);

  return {
    zoomIn: () => stepRef.current?.(BUTTON_STEP),
    zoomOut: () => stepRef.current?.(1 / BUTTON_STEP),
    canZoomIn: !limits.atMax,
    canZoomOut: !limits.atMin,
    /** A photo zoomed in: fingers pan it rather than swipe to the next. */
    isZoomed: () => zoomedRef.current,
  };
}
