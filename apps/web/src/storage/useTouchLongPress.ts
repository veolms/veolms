import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";

/** Held this long without moving: a long press (as chat's messages). */
const HOLD_MS = 450;
const MOVE_SLOP_PX = 10;

/**
 * A finger held on a file (WhatsApp's long press): `onLongPress` runs once
 * the hold is long enough, the phone gives a short buzz, and the tap that
 * would follow the lift does not also open the file. Its own menu (save
 * image, open in new tab) does not show. Touch only: a mouse has the
 * "Select" button.
 */
export function useTouchLongPress(onLongPress: () => void) {
  const press = useRef<{
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const fired = useRef(false);
  const latest = useRef(onLongPress);
  latest.current = onLongPress;

  const cancel = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  useEffect(() => cancel, []);

  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== "touch" || !event.isPrimary) return;
      fired.current = false;
      cancel();
      press.current = {
        x: event.clientX,
        y: event.clientY,
        timer: setTimeout(() => {
          press.current = null;
          fired.current = true;
          navigator.vibrate?.(12);
          latest.current();
        }, HOLD_MS),
      };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const start = press.current;
      if (!start) return;
      if (
        Math.abs(event.clientX - start.x) > MOVE_SLOP_PX ||
        Math.abs(event.clientY - start.y) > MOVE_SLOP_PX
      )
        cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    // The phone's own long-press menu (image or link callout).
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      if (press.current || fired.current) event.preventDefault();
    },
    // The lift after a long press is not also a tap.
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      if (!fired.current) return;
      fired.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
