import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MouseEventHandler,
  PointerEvent,
  PointerEventHandler,
} from "react";

const HOLD_DURATION_MS = 500;
const MOVE_TOLERANCE_PX = 10;
const CLICK_SUPPRESSION_EXPIRY_MS = 700;

interface PressCandidate {
  pointerId: number;
  startX: number;
  startY: number;
  completed: boolean;
}

function isExcludedLongPressTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest("[data-discussion-long-press-exclude]")) return true;
  if (target.closest(".discussion-thread__selectable-text")) return true;

  const interactive = target.closest(
    'button, input, textarea, select, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], a',
  );
  return Boolean(
    interactive &&
      !interactive.classList.contains("discussion-thread__navigation-link"),
  );
}

interface UseDiscussionWorkspaceCardLongPressOptions {
  enabled: boolean;
  onLongPress: () => void;
}

export function useDiscussionWorkspaceCardLongPress<T extends HTMLElement>({
  enabled,
  onLongPress,
}: UseDiscussionWorkspaceCardLongPressOptions) {
  const [isPressed, setIsPressed] = useState(false);
  const callbackRef = useRef(onLongPress);
  const candidateRef = useRef<PressCandidate | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const suppressClickUntilRef = useRef(0);
  const suppressClickExpiryRef = useRef<number | null>(null);
  callbackRef.current = onLongPress;

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current === null) return;
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  }, []);

  const clearClickSuppression = useCallback(() => {
    suppressClickUntilRef.current = 0;
    if (suppressClickExpiryRef.current !== null) {
      window.clearTimeout(suppressClickExpiryRef.current);
      suppressClickExpiryRef.current = null;
    }
  }, []);

  const cancelCandidate = useCallback(() => {
    clearHoldTimer();
    candidateRef.current = null;
    setIsPressed(false);
  }, [clearHoldTimer]);

  useEffect(
    () => () => {
      clearHoldTimer();
      clearClickSuppression();
      candidateRef.current = null;
    },
    [clearClickSuppression, clearHoldTimer],
  );

  useEffect(() => {
    if (enabled) return;
    cancelCandidate();
    clearClickSuppression();
  }, [cancelCandidate, clearClickSuppression, enabled]);

  const onPointerDownCapture: PointerEventHandler<T> = useCallback(
    (event) => {
      if (
        !enabled ||
        !event.isPrimary ||
        event.button !== 0 ||
        isExcludedLongPressTarget(event.target)
      ) {
        return;
      }

      cancelCandidate();
      const candidate: PressCandidate = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        completed: false,
      };
      candidateRef.current = candidate;
      setIsPressed(true);
      holdTimerRef.current = window.setTimeout(() => {
        const activeCandidate = candidateRef.current;
        if (!activeCandidate || activeCandidate !== candidate) return;

        holdTimerRef.current = null;
        activeCandidate.completed = true;
        setIsPressed(false);
        callbackRef.current();
      }, HOLD_DURATION_MS);
    },
    [cancelCandidate, clearClickSuppression, enabled],
  );

  const onPointerMoveCapture: PointerEventHandler<T> = useCallback(
    (event) => {
      const candidate = candidateRef.current;
      if (
        !candidate ||
        candidate.pointerId !== event.pointerId ||
        candidate.completed
      ) {
        return;
      }

      if (
        Math.hypot(
          event.clientX - candidate.startX,
          event.clientY - candidate.startY,
        ) > MOVE_TOLERANCE_PX
      ) {
        cancelCandidate();
      }
    },
    [cancelCandidate],
  );

  const finishPointer = useCallback(
    (event: PointerEvent<T>, shouldSuppressClick = false) => {
      const candidate = candidateRef.current;
      if (!candidate || candidate.pointerId !== event.pointerId) return;
      clearHoldTimer();
      candidateRef.current = null;
      setIsPressed(false);

      if (!shouldSuppressClick || !candidate.completed) return;

      suppressClickUntilRef.current =
        performance.now() + CLICK_SUPPRESSION_EXPIRY_MS;
      if (suppressClickExpiryRef.current !== null) {
        window.clearTimeout(suppressClickExpiryRef.current);
      }
      suppressClickExpiryRef.current = window.setTimeout(
        clearClickSuppression,
        CLICK_SUPPRESSION_EXPIRY_MS,
      );
    },
    [clearClickSuppression, clearHoldTimer],
  );

  const onPointerUpCapture: PointerEventHandler<T> = useCallback(
    (event) => {
      finishPointer(event, true);
    },
    [finishPointer],
  );

  const onPointerCancelCapture: PointerEventHandler<T> = useCallback(
    (event) => {
      finishPointer(event);
    },
    [finishPointer],
  );

  const onClickCapture: MouseEventHandler<T> = useCallback(
    (event) => {
      if (suppressClickUntilRef.current <= performance.now()) {
        clearClickSuppression();
        return;
      }

      clearClickSuppression();
      event.preventDefault();
      event.stopPropagation();
    },
    [clearClickSuppression],
  );

  return useMemo(
    () =>
      enabled
        ? {
            isPressed,
            onClickCapture,
            onLostPointerCapture: onPointerCancelCapture,
            onPointerCancelCapture,
            onPointerDownCapture,
            onPointerMoveCapture,
            onPointerUpCapture,
          }
        : { isPressed: false },
    [
      enabled,
      isPressed,
      onClickCapture,
      onPointerCancelCapture,
      onPointerDownCapture,
      onPointerMoveCapture,
      onPointerUpCapture,
    ],
  );
}
