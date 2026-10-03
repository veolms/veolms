import { useEffect, useRef } from "react";

const MAX_TAP_DURATION_MS = 280;
const MAX_TAP_GAP_MS = 520;
const MAX_TAP_MOVEMENT_PX = 24;

interface ActiveTap {
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  startedAt: number;
}

export function useTripleTap(onTripleTap: () => void) {
  const onTripleTapRef = useRef(onTripleTap);
  onTripleTapRef.current = onTripleTap;

  useEffect(() => {
    let activeTap: ActiveTap | null = null;
    let recentTaps: number[] = [];
    let suppressedClickTarget: Node | null = null;
    let suppressedClickTimer: number | null = null;
    let activePointerType = "";

    const clearSuppressedClick = () => {
      if (suppressedClickTimer !== null) {
        window.clearTimeout(suppressedClickTimer);
        suppressedClickTimer = null;
      }
      suppressedClickTarget = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      activeTap = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        startX: event.clientX,
        startY: event.clientY,
        startedAt: performance.now(),
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (activeTap?.pointerId !== event.pointerId) return;
      if (
        Math.hypot(event.clientX - activeTap.startX, event.clientY - activeTap.startY) >
        MAX_TAP_MOVEMENT_PX
      ) {
        activeTap = null;
        recentTaps = [];
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      const tap = activeTap;
      if (!tap || tap.pointerId !== event.pointerId) return;
      activeTap = null;

      const now = performance.now();
      const duration = now - tap.startedAt;
      const movement = Math.hypot(event.clientX - tap.startX, event.clientY - tap.startY);
      if (duration > MAX_TAP_DURATION_MS || movement > MAX_TAP_MOVEMENT_PX) {
        recentTaps = [];
        return;
      }

      if (
        recentTaps.length > 0 &&
        (now - recentTaps[recentTaps.length - 1]! > MAX_TAP_GAP_MS ||
          tap.pointerType !== activePointerType)
      ) {
        recentTaps = [];
      }
      activePointerType = tap.pointerType;
      recentTaps.push(now);
      if (recentTaps.length < 3) return;

      recentTaps = [];
      onTripleTapRef.current();
      suppressedClickTarget = event.target instanceof Node ? event.target : null;
      suppressedClickTimer = window.setTimeout(clearSuppressedClick, 350);
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (activeTap?.pointerId !== event.pointerId) return;
      activeTap = null;
      recentTaps = [];
    };

    const onClick = (event: MouseEvent) => {
      const target = suppressedClickTarget;
      if (!target || !(event.target instanceof Node)) return;
      if (
        target !== event.target &&
        !target.contains(event.target) &&
        !event.target.contains(target)
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      clearSuppressedClick();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerCancel, true);
    document.addEventListener("click", onClick, true);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
      document.removeEventListener("click", onClick, true);
      clearSuppressedClick();
    };
  }, []);
}
