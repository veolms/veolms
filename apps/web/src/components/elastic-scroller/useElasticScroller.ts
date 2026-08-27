import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import type { ElasticScrollGestureSide } from "../../settings/settingsPreferences";
import {
  ELASTIC_SCROLL_CONTROL_DRAG_DEAD_ZONE,
  ELASTIC_SCROLL_CONTROL_DRAG_MAX_DISTANCE,
  ELASTIC_SCROLL_CONTROL_IDLE_DELAY_MS,
  ELASTIC_SCROLL_CONTROL_INLINE_MAX_DISTANCE,
  ELASTIC_SCROLL_CONTROL_LOCK_THRESHOLD,
  ELASTIC_SCROLL_CONTROL_LONG_PRESS_DELAY_MS,
  ELASTIC_SCROLL_CONTROL_PROGRESS_CIRCUMFERENCE,
  getElasticScrollDragIntensity,
  getElasticScrollSpeed,
  getScrollDirectionAtEdge,
  getScrollProgress,
} from "./elasticScrollerModel";
import type {
  ElasticScrollMode,
  ScrollDirection,
} from "./elasticScrollerModel";

interface UseElasticScrollerOptions {
  scrollportRef: RefObject<HTMLElement | null>;
  contentRevision: string | number;
  lockSide: ElasticScrollGestureSide;
  unlockSide: ElasticScrollGestureSide;
  disabled?: boolean;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const isSideArmed = (inlineOffset: number, side: ElasticScrollGestureSide) =>
  (side === "right" ? inlineOffset : -inlineOffset) >=
  ELASTIC_SCROLL_CONTROL_LOCK_THRESHOLD;

type DragAxis = "horizontal" | "vertical" | null;

const ELASTIC_SCROLL_CONTROL_AXIS_SWITCH_DISTANCE = 8;
const ELASTIC_SCROLL_CONTROL_AXIS_SWITCH_DOMINANCE = 1.25;

export function useElasticScroller({
  scrollportRef,
  contentRevision,
  lockSide,
  unlockSide,
  disabled = false,
}: UseElasticScrollerOptions) {
  const [visible, setVisible] = useState(false);
  const [direction, setDirection] = useState<ScrollDirection>("up");
  const [mode, setMode] = useState<ElasticScrollMode>("idle");
  const [dragOffset, setDragOffset] = useState(0);
  const [dragInlineOffset, setDragInlineOffset] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockArmed, setLockArmed] = useState(false);
  const [unlockArmed, setUnlockArmed] = useState(false);
  const lastScrollTopRef = useRef(0);
  const directionRef = useRef<ScrollDirection>("up");
  const idleTimerRef = useRef<number | null>(null);
  const edgeScrollFrameRef = useRef<number | null>(null);
  const dragScrollFrameRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragPointerLastXRef = useRef<number | null>(null);
  const dragPointerLastYRef = useRef<number | null>(null);
  const dragAxisProbeStartXRef = useRef<number | null>(null);
  const dragAxisProbeStartYRef = useRef<number | null>(null);
  const dragAxisRef = useRef<DragAxis>(null);
  const dragControlCenterXRef = useRef<number | null>(null);
  const dragPointerBaseOffsetRef = useRef(0);
  const dragPointerOffsetRef = useRef(0);
  const dragInlineOffsetRef = useRef(0);
  const pointerStartedLockedRef = useRef(false);
  const lockedRef = useRef(false);
  const lockedOffsetRef = useRef(0);
  const lockArmedRef = useRef(false);
  const unlockArmedRef = useRef(false);
  const progressRingRef = useRef<SVGCircleElement>(null);
  const progressValueRef = useRef<HTMLSpanElement>(null);
  const suppressClickRef = useRef(false);
  const pointerDownStoppedEdgeRef = useRef(false);
  const preserveDirectionRef = useRef(false);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current === null) return;
    window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
  }, []);

  const scheduleHide = useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null;
      if (
        edgeScrollFrameRef.current !== null ||
        dragScrollFrameRef.current !== null
      ) {
        return;
      }
      setVisible(false);
    }, ELASTIC_SCROLL_CONTROL_IDLE_DELAY_MS);
  }, [clearIdleTimer]);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current === null) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, []);

  const clearGestureFeedback = useCallback(() => {
    lockArmedRef.current = false;
    unlockArmedRef.current = false;
    dragInlineOffsetRef.current = 0;
    setLockArmed(false);
    setUnlockArmed(false);
    setDragOffset(0);
    setDragInlineOffset(0);
  }, []);

  const clearLockedState = useCallback(() => {
    lockedRef.current = false;
    lockedOffsetRef.current = 0;
    setIsLocked(false);
    setScrollOffset(0);
  }, []);

  const cancelEdgeScroll = useCallback(
    (hideAfterIdle = true) => {
      if (edgeScrollFrameRef.current === null) return false;
      window.cancelAnimationFrame(edgeScrollFrameRef.current);
      edgeScrollFrameRef.current = null;
      setMode("idle");
      if (hideAfterIdle) scheduleHide();
      return true;
    },
    [scheduleHide],
  );

  const cancelDragScroll = useCallback(
    (hideAfterIdle = true) => {
      const hadActiveScroll =
        dragScrollFrameRef.current !== null || lockedRef.current;
      if (!hadActiveScroll) return false;
      if (dragScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(dragScrollFrameRef.current);
        dragScrollFrameRef.current = null;
      }
      clearLockedState();
      clearGestureFeedback();
      dragPointerOffsetRef.current = 0;
      setMode("idle");
      if (hideAfterIdle) scheduleHide();
      return true;
    },
    [clearGestureFeedback, clearLockedState, scheduleHide],
  );

  const cancelAutomatedScroll = useCallback(() => {
    clearLongPressTimer();
    const stoppedEdge = cancelEdgeScroll(false);
    const stoppedDrag = cancelDragScroll(false);
    if (stoppedEdge || stoppedDrag) scheduleHide();
    return stoppedEdge || stoppedDrag;
  }, [cancelDragScroll, cancelEdgeScroll, clearLongPressTimer, scheduleHide]);

  const reveal = useCallback(
    (nextDirection: ScrollDirection) => {
      directionRef.current = nextDirection;
      setDirection(nextDirection);
      setVisible(true);
      if (
        edgeScrollFrameRef.current === null &&
        dragScrollFrameRef.current === null
      ) {
        scheduleHide();
      }
    },
    [scheduleHide],
  );

  const syncDirectionAtEdge = useCallback(
    (fallbackDirection: ScrollDirection) => {
      const scrollport = scrollportRef.current;
      if (!scrollport) return fallbackDirection;

      const nextDirection = getScrollDirectionAtEdge(
        scrollport.scrollTop,
        scrollport.scrollHeight,
        scrollport.clientHeight,
        fallbackDirection,
      );
      directionRef.current = nextDirection;
      setDirection(nextDirection);
      return nextDirection;
    },
    [scrollportRef],
  );

  const syncProgress = useCallback((scrollport: HTMLElement) => {
    const progress = getScrollProgress(
      scrollport.scrollTop,
      scrollport.scrollHeight,
      scrollport.clientHeight,
    );
    const percentage = Math.round(progress * 100);
    progressRingRef.current?.setAttribute(
      "stroke-dashoffset",
      String(ELASTIC_SCROLL_CONTROL_PROGRESS_CIRCUMFERENCE * (1 - progress)),
    );
    progressValueRef.current?.setAttribute("aria-valuenow", String(percentage));
    progressValueRef.current?.setAttribute(
      "aria-valuetext",
      `${percentage}% scrolled`,
    );
  }, []);

  useEffect(() => {
    if (disabled) return undefined;
    const scrollport = scrollportRef.current;
    if (!scrollport) return undefined;

    lastScrollTopRef.current = scrollport.scrollTop;
    syncProgress(scrollport);

    const updateControl = () => {
      const nextScrollTop = scrollport.scrollTop;
      const delta = nextScrollTop - lastScrollTopRef.current;
      lastScrollTopRef.current = nextScrollTop;
      syncProgress(scrollport);
      const fallbackDirection = delta > 0 ? "down" : "up";
      const edgeDirection = getScrollDirectionAtEdge(
        nextScrollTop,
        scrollport.scrollHeight,
        scrollport.clientHeight,
        fallbackDirection,
      );

      if (
        edgeDirection !== fallbackDirection &&
        dragPointerIdRef.current === null
      ) {
        directionRef.current = edgeDirection;
        setDirection(edgeDirection);
      }
      if (Math.abs(delta) < 0.5) return;
      if (
        edgeScrollFrameRef.current !== null ||
        dragScrollFrameRef.current !== null ||
        preserveDirectionRef.current
      ) {
        return;
      }
      reveal(edgeDirection);
    };
    const interruptAutomatedScroll = () => {
      if (dragPointerIdRef.current !== null) return;
      preserveDirectionRef.current = false;
      cancelAutomatedScroll();
    };
    const beginScrollbarScroll = (event: PointerEvent) => {
      if (event.target === scrollport) preserveDirectionRef.current = false;
    };
    const interruptFromKeyboard = (event: KeyboardEvent) => {
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "PageUp",
          "PageDown",
          "Home",
          "End",
          " ",
          "Escape",
        ].includes(event.key)
      ) {
        preserveDirectionRef.current = false;
        cancelAutomatedScroll();
      }
    };

    scrollport.addEventListener("scroll", updateControl, { passive: true });
    scrollport.addEventListener("wheel", interruptAutomatedScroll, {
      passive: true,
    });
    scrollport.addEventListener("touchmove", interruptAutomatedScroll, {
      passive: true,
    });
    scrollport.addEventListener("pointerdown", beginScrollbarScroll);
    scrollport.addEventListener("keydown", interruptFromKeyboard);
    return () => {
      scrollport.removeEventListener("scroll", updateControl);
      scrollport.removeEventListener("wheel", interruptAutomatedScroll);
      scrollport.removeEventListener("touchmove", interruptAutomatedScroll);
      scrollport.removeEventListener("pointerdown", beginScrollbarScroll);
      scrollport.removeEventListener("keydown", interruptFromKeyboard);
    };
  }, [cancelAutomatedScroll, disabled, reveal, scrollportRef, syncProgress]);

  useEffect(() => {
    if (disabled) return undefined;
    const scrollport = scrollportRef.current;
    if (!scrollport) return undefined;
    const frame = window.requestAnimationFrame(() => syncProgress(scrollport));
    return () => window.cancelAnimationFrame(frame);
  }, [contentRevision, disabled, scrollportRef, syncProgress]);

  useEffect(() => {
    if (!disabled) return;
    clearLongPressTimer();
    cancelEdgeScroll(false);
    cancelDragScroll(false);
    clearGestureFeedback();
    clearLockedState();
    setVisible(false);
  }, [
    cancelDragScroll,
    cancelEdgeScroll,
    clearGestureFeedback,
    clearLockedState,
    clearLongPressTimer,
    disabled,
  ]);

  useEffect(
    () => () => {
      clearIdleTimer();
      clearLongPressTimer();
      if (edgeScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(edgeScrollFrameRef.current);
      }
      if (dragScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(dragScrollFrameRef.current);
      }
    },
    [clearIdleTimer, clearLongPressTimer],
  );

  const scrollToEdge = useCallback(
    (nextDirection: ScrollDirection) => {
      const scrollport = scrollportRef.current;
      if (!scrollport) return;

      cancelEdgeScroll(false);
      cancelDragScroll(false);
      clearIdleTimer();
      preserveDirectionRef.current = true;
      const target =
        nextDirection === "down"
          ? Math.max(0, scrollport.scrollHeight - scrollport.clientHeight)
          : 0;
      const start = scrollport.scrollTop;
      const distance = target - start;
      if (Math.abs(distance) < 1) {
        syncDirectionAtEdge(nextDirection);
        scheduleHide();
        return;
      }

      setVisible(true);
      setMode("edge");
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        scrollport.scrollTop = target;
        syncDirectionAtEdge(nextDirection);
        setMode("idle");
        scheduleHide();
        return;
      }

      const duration = Math.min(
        850,
        Math.max(340, 300 + Math.abs(distance) * 0.28),
      );
      let startedAt: number | null = null;
      const advance = (timestamp: number) => {
        if (startedAt === null) startedAt = timestamp;
        const progress = Math.min(1, (timestamp - startedAt) / duration);
        const easedProgress = 1 - Math.pow(1 - progress, 4);
        scrollport.scrollTop = start + distance * easedProgress;

        if (progress < 1) {
          edgeScrollFrameRef.current = window.requestAnimationFrame(advance);
          return;
        }

        scrollport.scrollTop = target;
        edgeScrollFrameRef.current = null;
        syncDirectionAtEdge(nextDirection);
        setMode("idle");
        scheduleHide();
      };

      edgeScrollFrameRef.current = window.requestAnimationFrame(advance);
    },
    [
      cancelDragScroll,
      cancelEdgeScroll,
      clearIdleTimer,
      scheduleHide,
      scrollportRef,
      syncDirectionAtEdge,
    ],
  );

  const startDragScroll = useCallback(() => {
    const scrollport = scrollportRef.current;
    if (!scrollport) return;

    cancelEdgeScroll(false);
    cancelDragScroll(false);
    clearIdleTimer();
    clearLockedState();
    preserveDirectionRef.current = true;
    setVisible(true);
    setMode("drag");

    let previousTimestamp = performance.now();
    const advance = (timestamp: number) => {
      const frameSeconds = Math.min(
        0.05,
        Math.max(0, (timestamp - previousTimestamp) / 1000),
      );
      previousTimestamp = timestamp;
      const pointerOffset = dragPointerOffsetRef.current;
      const maximumScrollTop = Math.max(
        0,
        scrollport.scrollHeight - scrollport.clientHeight,
      );
      const requestedScrollTop =
        scrollport.scrollTop +
        (pointerOffset >= 0 ? 1 : -1) *
          getElasticScrollSpeed(Math.abs(pointerOffset)) *
          frameSeconds;
      const nextScrollTop = Math.min(
        maximumScrollTop,
        Math.max(0, requestedScrollTop),
      );
      scrollport.scrollTop = nextScrollTop;

      const reachedLockedEdge =
        lockedRef.current &&
        ((pointerOffset < -ELASTIC_SCROLL_CONTROL_DRAG_DEAD_ZONE &&
          nextScrollTop <= 0) ||
          (pointerOffset > ELASTIC_SCROLL_CONTROL_DRAG_DEAD_ZONE &&
            nextScrollTop >= maximumScrollTop));
      if (reachedLockedEdge) {
        dragScrollFrameRef.current = null;
        dragPointerOffsetRef.current = 0;
        preserveDirectionRef.current = false;
        clearLockedState();
        clearGestureFeedback();
        syncDirectionAtEdge(directionRef.current);
        setMode("idle");
        scheduleHide();
        return;
      }

      dragScrollFrameRef.current = window.requestAnimationFrame(advance);
    };

    dragScrollFrameRef.current = window.requestAnimationFrame(advance);
  }, [
    cancelDragScroll,
    cancelEdgeScroll,
    clearGestureFeedback,
    clearIdleTimer,
    clearLockedState,
    scheduleHide,
    scrollportRef,
    syncDirectionAtEdge,
  ]);

  const handleClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        pointerDownStoppedEdgeRef.current = false;
        return;
      }
      if (pointerDownStoppedEdgeRef.current) {
        pointerDownStoppedEdgeRef.current = false;
        scheduleHide();
        return;
      }
      if (cancelAutomatedScroll()) return;
      scrollToEdge(directionRef.current);
    },
    [cancelAutomatedScroll, scheduleHide, scrollToEdge],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      clearLongPressTimer();
      clearGestureFeedback();

      const startedLocked = lockedRef.current;
      pointerStartedLockedRef.current = startedLocked;
      pointerDownStoppedEdgeRef.current = startedLocked
        ? false
        : cancelEdgeScroll(false);
      dragPointerIdRef.current = event.pointerId;
      dragPointerLastXRef.current = event.clientX;
      dragPointerLastYRef.current = event.clientY;
      dragAxisProbeStartXRef.current = event.clientX;
      dragAxisProbeStartYRef.current = event.clientY;
      dragAxisRef.current = null;
      const controlBounds = event.currentTarget.getBoundingClientRect();
      dragControlCenterXRef.current =
        controlBounds.left + controlBounds.width / 2;
      dragPointerBaseOffsetRef.current = startedLocked
        ? lockedOffsetRef.current
        : 0;
      dragPointerOffsetRef.current = dragPointerBaseOffsetRef.current;
      setScrollOffset(dragPointerBaseOffsetRef.current);

      event.currentTarget.setPointerCapture(event.pointerId);
      if (startedLocked) {
        clearIdleTimer();
        setDragOffset(lockedOffsetRef.current);
        setVisible(true);
        setMode("drag");
      } else {
        startDragScroll();
      }
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        suppressClickRef.current = true;
      }, ELASTIC_SCROLL_CONTROL_LONG_PRESS_DELAY_MS);
    },
    [
      cancelEdgeScroll,
      clearGestureFeedback,
      clearIdleTimer,
      clearLongPressTimer,
      startDragScroll,
    ],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (dragPointerIdRef.current !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const pointerLastX = dragPointerLastXRef.current;
      const pointerLastY = dragPointerLastYRef.current;
      const probeStartX = dragAxisProbeStartXRef.current;
      const probeStartY = dragAxisProbeStartYRef.current;
      const controlCenterX = dragControlCenterXRef.current;
      if (
        pointerLastX === null ||
        pointerLastY === null ||
        probeStartX === null ||
        probeStartY === null ||
        controlCenterX === null
      ) {
        return;
      }

      const pointerStepX = event.clientX - pointerLastX;
      const pointerStepY = event.clientY - pointerLastY;
      const probeDeltaX = event.clientX - probeStartX;
      const probeDeltaY = event.clientY - probeStartY;
      const resetAxisProbe = () => {
        dragAxisProbeStartXRef.current = event.clientX;
        dragAxisProbeStartYRef.current = event.clientY;
      };

      dragPointerLastXRef.current = event.clientX;
      dragPointerLastYRef.current = event.clientY;

      let nextAxis = dragAxisRef.current;
      let nextScrollOffset = dragPointerOffsetRef.current;
      let nextInlineOffset = dragInlineOffsetRef.current;
      let appliedMotion = false;

      const applyVerticalMotion = (delta: number) => {
        nextScrollOffset = clamp(
          nextScrollOffset + delta,
          -ELASTIC_SCROLL_CONTROL_DRAG_MAX_DISTANCE,
          ELASTIC_SCROLL_CONTROL_DRAG_MAX_DISTANCE,
        );
        nextInlineOffset = 0;
        appliedMotion = true;
      };
      const applyHorizontalMotion = () => {
        nextInlineOffset = clamp(
          event.clientX - controlCenterX,
          -ELASTIC_SCROLL_CONTROL_INLINE_MAX_DISTANCE,
          ELASTIC_SCROLL_CONTROL_INLINE_MAX_DISTANCE,
        );
        appliedMotion = true;
      };

      if (nextAxis === null) {
        if (
          Math.max(Math.abs(probeDeltaX), Math.abs(probeDeltaY)) <=
          ELASTIC_SCROLL_CONTROL_DRAG_DEAD_ZONE
        ) {
          return;
        }
        if (Math.abs(probeDeltaX) > Math.abs(probeDeltaY)) {
          nextAxis = "horizontal";
          applyHorizontalMotion();
        } else {
          nextAxis = "vertical";
          applyVerticalMotion(probeDeltaY);
        }
        resetAxisProbe();
      } else if (nextAxis === "vertical") {
        if (Math.abs(pointerStepY) >= Math.abs(pointerStepX)) {
          applyVerticalMotion(pointerStepY);
          resetAxisProbe();
        } else if (
          Math.abs(probeDeltaX) >=
            ELASTIC_SCROLL_CONTROL_AXIS_SWITCH_DISTANCE &&
          Math.abs(probeDeltaX) >=
            Math.abs(probeDeltaY) * ELASTIC_SCROLL_CONTROL_AXIS_SWITCH_DOMINANCE
        ) {
          nextAxis = "horizontal";
          nextInlineOffset = 0;
          applyHorizontalMotion();
          resetAxisProbe();
        }
      } else if (Math.abs(pointerStepX) >= Math.abs(pointerStepY)) {
        applyHorizontalMotion();
        resetAxisProbe();
      } else if (
        Math.abs(probeDeltaY) >= ELASTIC_SCROLL_CONTROL_AXIS_SWITCH_DISTANCE &&
        Math.abs(probeDeltaY) >=
          Math.abs(probeDeltaX) * ELASTIC_SCROLL_CONTROL_AXIS_SWITCH_DOMINANCE
      ) {
        nextAxis = "vertical";
        applyVerticalMotion(probeDeltaY);
        resetAxisProbe();
      }

      if (!appliedMotion) return;

      dragAxisRef.current = nextAxis;
      dragPointerOffsetRef.current = nextScrollOffset;
      dragInlineOffsetRef.current = nextInlineOffset;
      setScrollOffset(nextScrollOffset);
      setDragOffset(nextScrollOffset);
      setDragInlineOffset(nextInlineOffset);

      if (
        Math.abs(nextScrollOffset) > ELASTIC_SCROLL_CONTROL_DRAG_DEAD_ZONE ||
        Math.abs(nextInlineOffset) > ELASTIC_SCROLL_CONTROL_DRAG_DEAD_ZONE
      ) {
        suppressClickRef.current = true;
      }

      if (pointerStartedLockedRef.current) {
        const nextUnlockArmed =
          nextAxis === "horizontal" &&
          isSideArmed(nextInlineOffset, unlockSide);
        unlockArmedRef.current = nextUnlockArmed;
        setUnlockArmed(nextUnlockArmed);
      } else {
        const nextLockArmed =
          Math.abs(nextScrollOffset) > ELASTIC_SCROLL_CONTROL_DRAG_DEAD_ZONE &&
          nextAxis === "horizontal" &&
          isSideArmed(nextInlineOffset, lockSide);
        lockArmedRef.current = nextLockArmed;
        setLockArmed(nextLockArmed);
      }

      if (
        nextAxis !== "vertical" ||
        Math.abs(nextScrollOffset) <= ELASTIC_SCROLL_CONTROL_DRAG_DEAD_ZONE
      ) {
        return;
      }
      const nextDirection = nextScrollOffset > 0 ? "down" : "up";
      directionRef.current = nextDirection;
      setDirection(nextDirection);
    },
    [lockSide, unlockSide],
  );

  const releasePointerCapture = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const clearPointerGesture = useCallback(() => {
    dragPointerIdRef.current = null;
    dragPointerLastXRef.current = null;
    dragPointerLastYRef.current = null;
    dragAxisProbeStartXRef.current = null;
    dragAxisProbeStartYRef.current = null;
    dragAxisRef.current = null;
    dragControlCenterXRef.current = null;
    dragPointerBaseOffsetRef.current = 0;
    pointerStartedLockedRef.current = false;
    clearLongPressTimer();
    clearGestureFeedback();
  }, [clearGestureFeedback, clearLongPressTimer]);

  const handlePointerFinish = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (dragPointerIdRef.current !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();

      const startedLocked = pointerStartedLockedRef.current;
      const shouldUnlock = startedLocked && unlockArmedRef.current;
      const shouldLock = !startedLocked && lockArmedRef.current;
      const nextLockedOffset = dragPointerOffsetRef.current;
      const hasScrollSpeed =
        Math.abs(nextLockedOffset) > ELASTIC_SCROLL_CONTROL_DRAG_DEAD_ZONE;

      clearPointerGesture();
      releasePointerCapture(event);

      if (shouldUnlock || (startedLocked && !hasScrollSpeed)) {
        preserveDirectionRef.current = false;
        cancelDragScroll();
        syncDirectionAtEdge(directionRef.current);
        return;
      }

      if (shouldLock || (startedLocked && hasScrollSpeed)) {
        lockedRef.current = true;
        lockedOffsetRef.current = nextLockedOffset;
        dragPointerOffsetRef.current = nextLockedOffset;
        preserveDirectionRef.current = true;
        clearIdleTimer();
        setIsLocked(true);
        setDragOffset(nextLockedOffset);
        setScrollOffset(nextLockedOffset);
        setVisible(true);
        setMode("locked");
        return;
      }

      preserveDirectionRef.current = false;
      cancelDragScroll();
      syncDirectionAtEdge(directionRef.current);
    },
    [
      cancelDragScroll,
      clearIdleTimer,
      clearPointerGesture,
      syncDirectionAtEdge,
    ],
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (dragPointerIdRef.current !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const startedLocked = pointerStartedLockedRef.current;
      clearPointerGesture();
      releasePointerCapture(event);

      if (startedLocked) {
        dragPointerOffsetRef.current = lockedOffsetRef.current;
        preserveDirectionRef.current = true;
        setIsLocked(true);
        setDragOffset(lockedOffsetRef.current);
        setScrollOffset(lockedOffsetRef.current);
        setMode("locked");
      } else {
        preserveDirectionRef.current = false;
        cancelDragScroll();
        syncDirectionAtEdge(directionRef.current);
      }
      pointerDownStoppedEdgeRef.current = false;
      suppressClickRef.current = false;
    },
    [cancelDragScroll, clearPointerGesture, syncDirectionAtEdge],
  );

  const scrollToStart = useCallback(() => {
    const scrollport = scrollportRef.current;
    if (!scrollport) return;
    cancelAutomatedScroll();
    lastScrollTopRef.current = 0;
    scrollport.scrollTop = 0;
  }, [cancelAutomatedScroll, scrollportRef]);

  let lockFeedback: "closed" | null = null;
  if (mode === "locked") {
    lockFeedback = "closed";
  } else if (mode === "drag") {
    lockFeedback = isLocked
      ? unlockArmed
        ? null
        : "closed"
      : lockArmed
        ? "closed"
        : null;
  }

  return {
    visible,
    direction,
    mode,
    dragOffset,
    dragInlineOffset,
    dragIntensity: getElasticScrollDragIntensity(scrollOffset),
    isLocked,
    lockArmed,
    unlockArmed,
    lockFeedback,
    progressRingRef,
    progressValueRef,
    handleClick,
    handlePointerDown,
    handlePointerMove,
    handlePointerFinish,
    handlePointerCancel,
    stop: cancelAutomatedScroll,
    scrollToStart,
  };
}
