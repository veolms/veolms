import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import {
  ELASTIC_SCROLL_CONTROL_DRAG_DEAD_ZONE,
  ELASTIC_SCROLL_CONTROL_DRAG_MAX_DISTANCE,
  ELASTIC_SCROLL_CONTROL_IDLE_DELAY_MS,
  ELASTIC_SCROLL_CONTROL_LONG_PRESS_DELAY_MS,
  ELASTIC_SCROLL_CONTROL_PROGRESS_CIRCUMFERENCE,
  getElasticScrollDragIntensity,
  getElasticScrollSpeed,
  getScrollDirectionAtEdge,
  getScrollProgress,
} from "./elasticScrollControlModel";
import type {
  ElasticScrollMode,
  ScrollDirection,
} from "./elasticScrollControlModel";

interface UseElasticScrollControlOptions {
  scrollportRef: RefObject<HTMLElement | null>;
  contentRevision: string | number;
  disabled?: boolean;
}

export function useElasticScrollControl({
  scrollportRef,
  contentRevision,
  disabled = false,
}: UseElasticScrollControlOptions) {
  const [visible, setVisible] = useState(false);
  const [direction, setDirection] = useState<ScrollDirection>("up");
  const [mode, setMode] = useState<ElasticScrollMode>("idle");
  const [dragOffset, setDragOffset] = useState(0);
  const lastScrollTopRef = useRef(0);
  const directionRef = useRef<ScrollDirection>("up");
  const idleTimerRef = useRef<number | null>(null);
  const edgeScrollFrameRef = useRef<number | null>(null);
  const dragScrollFrameRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragPointerStartYRef = useRef<number | null>(null);
  const dragPointerOffsetRef = useRef(0);
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
      if (dragScrollFrameRef.current === null) return false;
      window.cancelAnimationFrame(dragScrollFrameRef.current);
      dragScrollFrameRef.current = null;
      setMode("idle");
      if (hideAfterIdle) scheduleHide();
      return true;
    },
    [scheduleHide],
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
    setVisible(false);
    setDragOffset(0);
  }, [cancelDragScroll, cancelEdgeScroll, clearLongPressTimer, disabled]);

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
    preserveDirectionRef.current = true;
    setVisible(true);
    setMode("drag");

    let previousTimestamp = performance.now();
    const advance = (timestamp: number) => {
      const frameSeconds = Math.min(
        0.05,
        (timestamp - previousTimestamp) / 1000,
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
      scrollport.scrollTop = Math.min(
        maximumScrollTop,
        Math.max(0, requestedScrollTop),
      );

      dragScrollFrameRef.current = window.requestAnimationFrame(advance);
    };

    dragScrollFrameRef.current = window.requestAnimationFrame(advance);
  }, [cancelDragScroll, cancelEdgeScroll, clearIdleTimer, scrollportRef]);

  const handleClick = useCallback(() => {
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
  }, [cancelAutomatedScroll, scheduleHide, scrollToEdge]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      clearLongPressTimer();
      pointerDownStoppedEdgeRef.current = cancelEdgeScroll(false);
      dragPointerIdRef.current = event.pointerId;
      dragPointerStartYRef.current = event.clientY;
      dragPointerOffsetRef.current = 0;
      setDragOffset(0);
      event.currentTarget.setPointerCapture(event.pointerId);
      startDragScroll();
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        suppressClickRef.current = true;
      }, ELASTIC_SCROLL_CONTROL_LONG_PRESS_DELAY_MS);
    },
    [cancelEdgeScroll, clearLongPressTimer, startDragScroll],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (dragPointerIdRef.current !== event.pointerId) return;
      const pointerStartY = dragPointerStartYRef.current;
      if (pointerStartY === null) return;

      const nextOffset = Math.max(
        -ELASTIC_SCROLL_CONTROL_DRAG_MAX_DISTANCE,
        Math.min(
          ELASTIC_SCROLL_CONTROL_DRAG_MAX_DISTANCE,
          event.clientY - pointerStartY,
        ),
      );
      dragPointerOffsetRef.current = nextOffset;
      setDragOffset(nextOffset);

      if (Math.abs(nextOffset) <= ELASTIC_SCROLL_CONTROL_DRAG_DEAD_ZONE) {
        return;
      }
      suppressClickRef.current = true;
      const nextDirection = nextOffset > 0 ? "down" : "up";
      directionRef.current = nextDirection;
      setDirection(nextDirection);
    },
    [],
  );

  const handlePointerFinish = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (dragPointerIdRef.current !== event.pointerId) return;
      dragPointerIdRef.current = null;
      dragPointerStartYRef.current = null;
      dragPointerOffsetRef.current = 0;
      clearLongPressTimer();
      cancelDragScroll();
      setDragOffset(0);
      preserveDirectionRef.current = false;
      syncDirectionAtEdge(directionRef.current);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [cancelDragScroll, clearLongPressTimer, syncDirectionAtEdge],
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      handlePointerFinish(event);
      pointerDownStoppedEdgeRef.current = false;
      suppressClickRef.current = false;
    },
    [handlePointerFinish],
  );

  const scrollToStart = useCallback(() => {
    const scrollport = scrollportRef.current;
    if (!scrollport) return;
    cancelAutomatedScroll();
    lastScrollTopRef.current = 0;
    scrollport.scrollTop = 0;
  }, [cancelAutomatedScroll, scrollportRef]);

  return {
    visible,
    direction,
    mode,
    dragOffset,
    dragIntensity: getElasticScrollDragIntensity(dragOffset),
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
