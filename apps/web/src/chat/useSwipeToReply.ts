import { useCallback, useRef, useState } from "react";

/** Pulled this far, letting go acts (WhatsApp: about a thumb's width). */
const TRIGGER_PX = 64;
/** Past the trigger the bubble follows ever more slowly, up to this. */
const MAX_PX = 100;
/** A finger moves this far before the gesture's direction is decided. */
const DECIDE_PX = 8;
/** Sideways only when clearly more sideways than up or down. */
const SIDEWAYS_RATIO = 1.4;
/** The bubble's way back: quick, with a slight overshoot (a snap). */
const SNAP_BACK = "transform 220ms cubic-bezier(0.2, 0.9, 0.3, 1.15)";

/** What a swipe does: right replies (any message), left shows Message info (yours). */
export type SwipeAction = "reply" | "info";

export interface SwipeIcon {
  action: SwipeAction;
  /** Where the icon sits in the row: the edge the bubble is leaving. */
  left: number;
  top: number;
}

interface Gesture {
  x: number;
  y: number;
  axis: "x" | "y" | null;
  action: SwipeAction | null;
  armed: boolean;
  frame: number;
  offset: number;
  /** The bubble's edge the icon sits by (px, in the row). */
  edge: number;
}

/**
 * WhatsApp's swipe on a message (touch screens): drag a bubble right and
 * let go to reply; drag your own message left for its info (WhatsApp on
 * iPhone). The bubble follows the finger, a round icon grows in the gap it
 * leaves, a short buzz says it is far enough (Android), and the bubble
 * snaps back when the finger lifts. A gesture that starts up or down is a
 * scroll and is left alone; the row's `touch-action: pan-y` keeps the page
 * from moving sideways.
 *
 * The bubble and icon are moved by transform, frame by frame, without
 * re-rendering the message.
 */
export function useSwipeToReply({
  canReply,
  canInfo,
}: {
  canReply: boolean;
  canInfo: boolean;
}) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const [icon, setIcon] = useState<SwipeIcon | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const paint = useCallback(() => {
    const current = gesture.current;
    const bubble = bubbleRef.current;
    if (!current || !bubble) return;
    current.frame = 0;
    const offset = current.offset;
    bubble.style.transition = "none";
    bubble.style.transform = offset ? `translateX(${offset}px)` : "";
    const mark = iconRef.current;
    if (!mark) return;
    const pulled = Math.abs(offset);
    const progress = Math.min(1, pulled / TRIGGER_PX);
    // Centred in the gap once there is room for it; tucked under the
    // bubble's edge before that.
    const shift = Math.max(0, pulled / 2 - 16);
    mark.style.opacity = String(progress);
    mark.style.transform = `translateX(${current.action === "info" ? -shift : shift}px) scale(${current.armed ? 1 : 0.55 + 0.35 * progress})`;
  }, []);

  /** A finger touched the message. `from` is where (skipped on sliders). */
  const begin = useCallback(
    (touch: { clientX: number; clientY: number }, from: EventTarget | null) => {
      gesture.current = null;
      if (!canReply && !canInfo) return;
      if (from instanceof Element && startsElsewhere(from)) return;
      if (settle.current) {
        clearTimeout(settle.current);
        settle.current = null;
      }
      gesture.current = {
        x: touch.clientX,
        y: touch.clientY,
        axis: null,
        action: null,
        armed: false,
        frame: 0,
        offset: 0,
        edge: 0,
      };
    },
    [canReply, canInfo],
  );

  /** The finger moved. True once the message is being swiped sideways. */
  const move = useCallback(
    (touch: { clientX: number; clientY: number }): boolean => {
      const current = gesture.current;
      if (!current) return false;
      const dx = touch.clientX - current.x;
      const dy = touch.clientY - current.y;
      if (current.axis === null) {
        if (Math.abs(dx) < DECIDE_PX && Math.abs(dy) < DECIDE_PX) return false;
        const sideways = Math.abs(dx) > Math.abs(dy) * SIDEWAYS_RATIO;
        const action: SwipeAction | null = !sideways
          ? null
          : dx > 0
            ? canReply
              ? "reply"
              : null
            : canInfo
              ? "info"
              : null;
        if (!action) {
          // A scroll, or a way this message can't be swiped.
          current.axis = "y";
          return false;
        }
        current.axis = "x";
        current.action = action;
        const bubble = bubbleRef.current;
        if (bubble) {
          current.edge =
            action === "reply"
              ? bubble.offsetLeft
              : bubble.offsetLeft + bubble.offsetWidth;
          setIcon({
            action,
            left: current.edge + (action === "reply" ? 0 : -32),
            top: bubble.offsetTop + Math.min(bubble.offsetHeight, 64) / 2 - 16,
          });
        }
      }
      if (current.axis !== "x") return false;
      const along = current.action === "reply" ? dx : -dx;
      const pulled = Math.max(0, along);
      const eased =
        pulled <= TRIGGER_PX
          ? pulled
          : Math.min(MAX_PX, TRIGGER_PX + (pulled - TRIGGER_PX) * 0.35);
      current.offset = current.action === "reply" ? eased : -eased;
      const armed = pulled >= TRIGGER_PX;
      if (armed && !current.armed) navigator.vibrate?.(10);
      current.armed = armed;
      if (!current.frame) current.frame = requestAnimationFrame(paint);
      return true;
    },
    [canReply, canInfo, paint],
  );

  /**
   * The finger lifted (or the touch was taken away: `cancelled`). Returns
   * what to do, when the swipe went far enough.
   */
  const end = useCallback((cancelled = false): SwipeAction | null => {
    const current = gesture.current;
    gesture.current = null;
    if (!current || current.axis !== "x") return null;
    if (current.frame) cancelAnimationFrame(current.frame);
    const bubble = bubbleRef.current;
    if (bubble) {
      bubble.style.transition = SNAP_BACK;
      bubble.style.transform = "";
    }
    const mark = iconRef.current;
    if (mark) {
      mark.style.transition = "opacity 160ms ease-out";
      mark.style.opacity = "0";
    }
    settle.current = setTimeout(() => {
      settle.current = null;
      if (bubble) bubble.style.transition = "";
      setIcon(null);
    }, 240);
    return !cancelled && current.armed ? current.action : null;
  }, []);

  return { bubbleRef, iconRef, icon, begin, move, end };
}

/**
 * A touch that belongs to something inside the message: a seek bar (a
 * voice message), a box that scrolls sideways (a wide code block), a text
 * field.
 */
function startsElsewhere(target: Element): boolean {
  if (target.closest('[role="slider"], input, textarea, select')) return true;
  for (
    let node: Element | null = target;
    node && !node.hasAttribute("data-bubble");
    node = node.parentElement
  ) {
    if (node.scrollWidth > node.clientWidth + 1) {
      const overflow = getComputedStyle(node).overflowX;
      if (overflow === "auto" || overflow === "scroll") return true;
    }
  }
  return false;
}
