import { useEffect, useRef, useState } from "react";
import type { MouseEventHandler, PointerEventHandler } from "react";

const DEFAULT_SECOND_PRESS_WINDOW = 1200;
const DEFAULT_HOLD_DURATION = 480;
const DEFAULT_MOVE_TOLERANCE = 10;

interface UseSecondPressHoldOptions {
  onPress?: () => void;
  onSecondPressHold: () => void;
  deferFirstPress?: boolean;
  secondPressWindow?: number;
  holdDuration?: number;
  moveTolerance?: number;
}

interface SecondPressPointer {
  pointerId: number;
  startX: number;
  startY: number;
  cancelled: boolean;
  completed: boolean;
}

export function useSecondPressHold<T extends HTMLElement>({
  onPress,
  onSecondPressHold,
  deferFirstPress = false,
  secondPressWindow = DEFAULT_SECOND_PRESS_WINDOW,
  holdDuration = DEFAULT_HOLD_DURATION,
  moveTolerance = DEFAULT_MOVE_TOLERANCE,
}: UseSecondPressHoldOptions) {
  const callbacksRef = useRef({ onPress, onSecondPressHold });
  callbacksRef.current = { onPress, onSecondPressHold };
  const armedUntilRef = useRef(0);
  const deferredPressTimerRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const secondPointerRef = useRef<SecondPressPointer | null>(null);
  const secondClickPendingRef = useRef(false);
  const suppressNextClickRef = useRef(false);
  const [isSecondPressHolding, setIsSecondPressHolding] = useState(false);

  const clearDeferredPress = () => {
    if (deferredPressTimerRef.current === null) return;
    window.clearTimeout(deferredPressTimerRef.current);
    deferredPressTimerRef.current = null;
  };

  const clearHoldTimer = () => {
    if (holdTimerRef.current === null) return;
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  const disarm = () => {
    clearDeferredPress();
    clearHoldTimer();
    armedUntilRef.current = 0;
    secondPointerRef.current = null;
    secondClickPendingRef.current = false;
    setIsSecondPressHolding(false);
  };

  useEffect(
    () => () => {
      if (deferredPressTimerRef.current !== null) {
        window.clearTimeout(deferredPressTimerRef.current);
      }
      if (holdTimerRef.current !== null) {
        window.clearTimeout(holdTimerRef.current);
      }
    },
    [],
  );

  const onPointerDown: PointerEventHandler<T> = (event) => {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      armedUntilRef.current === 0 ||
      performance.now() > armedUntilRef.current
    ) {
      return;
    }

    clearDeferredPress();
    clearHoldTimer();
    secondClickPendingRef.current = true;
    secondPointerRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cancelled: false,
      completed: false,
    };
    setIsSecondPressHolding(true);
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Window-level pointer delivery remains sufficient when capture fails.
    }

    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      const pointer = secondPointerRef.current;
      if (!pointer || pointer.cancelled) return;
      pointer.completed = true;
      armedUntilRef.current = 0;
      setIsSecondPressHolding(false);
      callbacksRef.current.onSecondPressHold();
      if (event.pointerType === "touch") navigator.vibrate?.(10);
    }, holdDuration);
  };

  const onPointerMove: PointerEventHandler<T> = (event) => {
    const pointer = secondPointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId || pointer.completed)
      return;
    if (
      Math.hypot(
        event.clientX - pointer.startX,
        event.clientY - pointer.startY,
      ) <= moveTolerance
    ) {
      return;
    }
    pointer.cancelled = true;
    clearHoldTimer();
    setIsSecondPressHolding(false);
  };

  const finishSecondPress = (
    event: Parameters<PointerEventHandler<T>>[0],
    cancelled = false,
  ) => {
    const pointer = secondPointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    clearHoldTimer();
    setIsSecondPressHolding(false);
    secondPointerRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Capture may already have been released by the browser.
    }

    if (pointer.completed || pointer.cancelled || cancelled) {
      suppressNextClickRef.current = pointer.completed || pointer.cancelled;
      secondClickPendingRef.current = false;
      armedUntilRef.current = 0;
      if (pointer.completed || pointer.cancelled) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  };

  const onPointerUp: PointerEventHandler<T> = (event) =>
    finishSecondPress(event);
  const onPointerCancel: PointerEventHandler<T> = (event) =>
    finishSecondPress(event, true);
  const onLostPointerCapture: PointerEventHandler<T> = (event) =>
    finishSecondPress(event, true);

  const onClick: MouseEventHandler<T> = (event) => {
    if (event.detail === 0) {
      disarm();
      callbacksRef.current.onPress?.();
      return;
    }

    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (secondClickPendingRef.current) {
      disarm();
      callbacksRef.current.onPress?.();
      return;
    }

    armedUntilRef.current = performance.now() + secondPressWindow;
    if (!deferFirstPress) {
      callbacksRef.current.onPress?.();
      return;
    }

    clearDeferredPress();
    deferredPressTimerRef.current = window.setTimeout(() => {
      deferredPressTimerRef.current = null;
      armedUntilRef.current = 0;
      callbacksRef.current.onPress?.();
    }, secondPressWindow);
  };

  return {
    isSecondPressHolding,
    handlers: {
      onClick,
      onLostPointerCapture,
      onPointerCancel,
      onPointerDown,
      onPointerMove,
      onPointerUp,
    },
  } as const;
}
