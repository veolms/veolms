import { useLayoutEffect, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";

const MINIMUM_TRACK_INSET = 8;
const MINIMUM_THUMB_HEIGHT = 40;
const DRAG_DIRECTION_THRESHOLD = 4;

export const FLOATING_SCROLLBAR_HORIZONTAL_DRAG_EVENT =
  "veolms:floating-scrollbar-horizontal-drag";

export interface FloatingScrollbarHorizontalDragDetail {
  phase: "start" | "move" | "end" | "cancel";
  pointerId: number;
  clientX: number;
  clientY: number;
  ariaControls: string;
  handle: HTMLElement;
}

type FloatingScrollbarProps = {
  scrollportRef: RefObject<HTMLElement | null>;
  ariaControls?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  rightEdgeSelector?: string;
  enableHorizontalDrag?: boolean;
};

type ScrollbarDrag = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startScrollTop: number;
  clickedThumb: boolean;
  trackTop: number;
  thumbHeight: number;
  maximumThumbOffset: number;
  maximumScrollOffset: number;
  mode: "pending" | "scroll" | "resize";
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function FloatingScrollbar({
  scrollportRef,
  ariaControls = "courses-main-scrollport",
  ariaLabel = "Page scroll position",
  className,
  disabled = false,
  rightEdgeSelector,
  enableHorizontalDrag = false,
}: FloatingScrollbarProps) {
  const scrollbarRef = useRef<HTMLSpanElement>(null);
  const dragRef = useRef<ScrollbarDrag | null>(null);
  const [scrollportReadyVersion, setScrollportReadyVersion] = useState(0);

  // Portal-based drawers can attach their scrollport after this sibling has
  // committed. Retry until the ref exists, then reconnect the observers once.
  useLayoutEffect(() => {
    if (disabled || scrollportRef.current) return;

    let animationFrame = 0;
    let remainingAttempts = 60;
    const waitForScrollport = () => {
      if (scrollportRef.current) {
        setScrollportReadyVersion((version) => version + 1);
        return;
      }
      if (remainingAttempts-- <= 0) return;
      animationFrame = window.requestAnimationFrame(waitForScrollport);
    };
    animationFrame = window.requestAnimationFrame(waitForScrollport);

    return () => window.cancelAnimationFrame(animationFrame);
  }, [disabled, scrollportRef]);

  useLayoutEffect(() => {
    const scrollport = scrollportRef.current;
    const scrollbar = scrollbarRef.current;
    if (!scrollport || !scrollbar) return;

    let animationFrame = 0;

    const syncScrollbar = () => {
      animationFrame = 0;
      const scrollportStyle = window.getComputedStyle(scrollport);
      const canScroll =
        !disabled &&
        scrollport.getClientRects().length > 0 &&
        (scrollportStyle.overflowY === "auto" ||
          scrollportStyle.overflowY === "scroll") &&
        scrollport.scrollHeight > scrollport.clientHeight + 1;

      scrollbar.classList.toggle("is-visible", canScroll);
      scrollbar.setAttribute("aria-hidden", canScroll ? "false" : "true");
      scrollbar.tabIndex = canScroll ? 0 : -1;
      if (!canScroll) {
        scrollbar.setAttribute("aria-valuemax", "0");
        scrollbar.setAttribute("aria-valuenow", "0");
        return;
      }

      const scrollportRect = scrollport.getBoundingClientRect();
      const rightEdgeRect = rightEdgeSelector
        ? scrollport
            .querySelector<HTMLElement>(rightEdgeSelector)
            ?.getBoundingClientRect()
        : null;
      const topTrackInset = rightEdgeRect
        ? 0
        : Math.max(
            MINIMUM_TRACK_INSET,
            Number.parseFloat(scrollportStyle.borderTopRightRadius) || 0,
          );
      const bottomTrackInset = rightEdgeRect
        ? 0
        : Math.max(
            MINIMUM_TRACK_INSET,
            Number.parseFloat(scrollportStyle.borderBottomRightRadius) || 0,
          );
      const trackHeight = Math.max(
        0,
        scrollportRect.height - topTrackInset - bottomTrackInset,
      );
      const thumbHeight = Math.min(
        trackHeight,
        Math.max(
          MINIMUM_THUMB_HEIGHT,
          trackHeight * (scrollport.clientHeight / scrollport.scrollHeight),
        ),
      );
      const maximumThumbOffset = Math.max(0, trackHeight - thumbHeight);
      const maximumScrollOffset = Math.max(
        1,
        scrollport.scrollHeight - scrollport.clientHeight,
      );
      const thumbOffset =
        maximumThumbOffset * (scrollport.scrollTop / maximumScrollOffset);

      scrollbar.setAttribute(
        "aria-valuemax",
        String(Math.round(maximumScrollOffset)),
      );
      scrollbar.setAttribute(
        "aria-valuenow",
        String(Math.round(scrollport.scrollTop)),
      );

      scrollbar.style.setProperty(
        "--floating-scrollbar-top",
        `${scrollportRect.top + topTrackInset}px`,
      );
      scrollbar.style.setProperty(
        "--floating-scrollbar-right",
        `${Math.max(
          0,
          window.innerWidth - (rightEdgeRect?.right ?? scrollportRect.right),
        )}px`,
      );
      scrollbar.style.setProperty(
        "--floating-scrollbar-height",
        `${trackHeight}px`,
      );
      scrollbar.style.setProperty(
        "--floating-scrollbar-thumb-height",
        `${thumbHeight}px`,
      );
      scrollbar.style.setProperty(
        "--floating-scrollbar-thumb-offset",
        `${thumbOffset}px`,
      );
    };

    const scheduleSync = () => {
      if (animationFrame === 0) {
        animationFrame = window.requestAnimationFrame(syncScrollbar);
      }
    };

    // A scrollport can move without resizing when navigation or the sidebar
    // changes the surrounding layout. Observe and listen through that chain so
    // the fixed thumb follows the panel before the user scrolls it.
    const layoutAncestors: HTMLElement[] = [];
    for (
      let ancestor = scrollport.parentElement;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      layoutAncestors.push(ancestor);
    }

    scrollport.addEventListener("scroll", scheduleSync, { passive: true });
    layoutAncestors.forEach((ancestor) =>
      ancestor.addEventListener("scroll", scheduleSync, { passive: true }),
    );
    window.addEventListener("resize", scheduleSync);
    window.addEventListener("pageshow", scheduleSync);
    document.addEventListener("transitionrun", scheduleSync, true);
    document.addEventListener("transitioncancel", scheduleSync, true);
    document.addEventListener("transitionend", scheduleSync, true);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleSync);
    resizeObserver?.observe(scrollport);
    layoutAncestors.forEach((ancestor) => resizeObserver?.observe(ancestor));
    Array.from(scrollport.children).forEach((child) =>
      resizeObserver?.observe(child),
    );

    const contentObserver = new MutationObserver(() => {
      Array.from(scrollport.children).forEach((child) =>
        resizeObserver?.observe(child),
      );
      scheduleSync();
    });
    contentObserver.observe(scrollport, { childList: true, subtree: true });

    scheduleSync();

    return () => {
      if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame);
      scrollport.removeEventListener("scroll", scheduleSync);
      layoutAncestors.forEach((ancestor) =>
        ancestor.removeEventListener("scroll", scheduleSync),
      );
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("pageshow", scheduleSync);
      document.removeEventListener("transitionrun", scheduleSync, true);
      document.removeEventListener("transitioncancel", scheduleSync, true);
      document.removeEventListener("transitionend", scheduleSync, true);
      resizeObserver?.disconnect();
      contentObserver.disconnect();
    };
  }, [disabled, rightEdgeSelector, scrollportReadyVersion, scrollportRef]);

  const getTrackScrollTop = (drag: ScrollbarDrag, clientY: number) => {
    if (drag.maximumThumbOffset <= 0) return 0;
    const requestedThumbOffset = clamp(
      clientY - drag.trackTop - drag.thumbHeight / 2,
      0,
      drag.maximumThumbOffset,
    );
    return (
      (requestedThumbOffset / drag.maximumThumbOffset) *
      drag.maximumScrollOffset
    );
  };

  const dispatchHorizontalDrag = (
    phase: FloatingScrollbarHorizontalDragDetail["phase"],
    event: ReactPointerEvent<HTMLSpanElement>,
    clientX = event.clientX,
    clientY = event.clientY,
  ) => {
    if (!enableHorizontalDrag) return;
    window.dispatchEvent(
      new CustomEvent<FloatingScrollbarHorizontalDragDetail>(
        FLOATING_SCROLLBAR_HORIZONTAL_DRAG_EVENT,
        {
          detail: {
            phase,
            pointerId: event.pointerId,
            clientX,
            clientY,
            ariaControls,
            handle: event.currentTarget,
          },
        },
      ),
    );
  };

  const beginDrag = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (
      event.button !== 0 ||
      !event.currentTarget.classList.contains("is-visible")
    ) {
      return;
    }

    const scrollport = scrollportRef.current;
    const thumb = event.currentTarget.querySelector<HTMLElement>(
      ".floating-scrollbar__thumb",
    );
    if (!scrollport || !thumb) return;

    const trackRect = event.currentTarget.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const maximumThumbOffset = Math.max(0, trackRect.height - thumbRect.height);
    const maximumScrollOffset = Math.max(
      0,
      scrollport.scrollHeight - scrollport.clientHeight,
    );
    const clickedThumb =
      event.clientY >= thumbRect.top && event.clientY <= thumbRect.bottom;
    let startScrollTop = scrollport.scrollTop;

    if (!enableHorizontalDrag && !clickedThumb && maximumThumbOffset > 0) {
      const requestedThumbOffset = clamp(
        event.clientY - trackRect.top - thumbRect.height / 2,
        0,
        maximumThumbOffset,
      );
      startScrollTop =
        (requestedThumbOffset / maximumThumbOffset) * maximumScrollOffset;
      scrollport.scrollTop = startScrollTop;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollTop,
      clickedThumb,
      trackTop: trackRect.top,
      thumbHeight: thumbRect.height,
      maximumThumbOffset,
      maximumScrollOffset,
      mode: enableHorizontalDrag ? "pending" : "scroll",
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add("is-dragging");
    event.preventDefault();
  };

  const dragThumb = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = dragRef.current;
    const scrollport = scrollportRef.current;
    const thumb = event.currentTarget.querySelector<HTMLElement>(
      ".floating-scrollbar__thumb",
    );
    if (!drag || drag.pointerId !== event.pointerId || !scrollport || !thumb) {
      return;
    }

    if (drag.mode === "pending") {
      const horizontalDistance = Math.abs(event.clientX - drag.startClientX);
      const verticalDistance = Math.abs(event.clientY - drag.startClientY);
      if (
        Math.max(horizontalDistance, verticalDistance) <
        DRAG_DIRECTION_THRESHOLD
      ) {
        return;
      }

      if (horizontalDistance > verticalDistance) {
        drag.mode = "resize";
        event.currentTarget.classList.add("is-resizing");
        dispatchHorizontalDrag(
          "start",
          event,
          drag.startClientX,
          drag.startClientY,
        );
      } else {
        drag.mode = "scroll";
        if (!drag.clickedThumb) {
          drag.startScrollTop = getTrackScrollTop(drag, drag.startClientY);
          scrollport.scrollTop = drag.startScrollTop;
        }
      }
    }

    if (drag.mode === "resize") {
      dispatchHorizontalDrag("move", event);
      event.preventDefault();
      return;
    }

    const maximumThumbOffset = Math.max(
      1,
      event.currentTarget.clientHeight - thumb.getBoundingClientRect().height,
    );
    const maximumScrollOffset = Math.max(
      0,
      scrollport.scrollHeight - scrollport.clientHeight,
    );
    scrollport.scrollTop = clamp(
      drag.startScrollTop +
        ((event.clientY - drag.startClientY) / maximumThumbOffset) *
          maximumScrollOffset,
      0,
      maximumScrollOffset,
    );
  };

  const endDrag = (
    event: ReactPointerEvent<HTMLSpanElement>,
    cancelled = false,
  ) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const scrollport = scrollportRef.current;
    if (
      !cancelled &&
      drag.mode === "pending" &&
      !drag.clickedThumb &&
      scrollport
    ) {
      scrollport.scrollTop = getTrackScrollTop(drag, drag.startClientY);
    } else if (drag.mode === "resize") {
      dispatchHorizontalDrag(cancelled ? "cancel" : "end", event);
    }
    dragRef.current = null;
    event.currentTarget.classList.remove("is-dragging");
    event.currentTarget.classList.remove("is-resizing");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLSpanElement>) => {
    const scrollport = scrollportRef.current;
    if (!scrollport) return;

    const lineStep = Math.max(40, scrollport.clientHeight * 0.08);
    const pageStep = scrollport.clientHeight * 0.9;
    const maximumScrollOffset = Math.max(
      0,
      scrollport.scrollHeight - scrollport.clientHeight,
    );
    const nextScrollTop = {
      ArrowDown: scrollport.scrollTop + lineStep,
      ArrowUp: scrollport.scrollTop - lineStep,
      End: maximumScrollOffset,
      Home: 0,
      PageDown: scrollport.scrollTop + pageStep,
      PageUp: scrollport.scrollTop - pageStep,
    }[event.key];

    if (nextScrollTop === undefined) return;
    scrollport.scrollTop = clamp(nextScrollTop, 0, maximumScrollOffset);
    event.preventDefault();
  };

  return (
    <span
      ref={scrollbarRef}
      className={`floating-scrollbar${className ? ` ${className}` : ""}`}
      role="scrollbar"
      aria-label={ariaLabel}
      aria-controls={ariaControls}
      aria-hidden="true"
      aria-orientation="vertical"
      aria-description={
        enableHorizontalDrag
          ? "Drag vertically to scroll or horizontally to resize course content"
          : undefined
      }
      aria-valuemin={0}
      aria-valuemax={0}
      aria-valuenow={0}
      tabIndex={-1}
      onPointerDown={beginDrag}
      onPointerMove={dragThumb}
      onPointerUp={endDrag}
      onPointerCancel={(event) => endDrag(event, true)}
      onLostPointerCapture={(event) => {
        if (dragRef.current?.mode === "resize") {
          dispatchHorizontalDrag("cancel", event);
        }
        dragRef.current = null;
        event.currentTarget.classList.remove("is-dragging");
        event.currentTarget.classList.remove("is-resizing");
      }}
      onKeyDown={handleKeyDown}
    >
      <span className="floating-scrollbar__thumb" />
    </span>
  );
}
