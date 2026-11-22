import { useEffect, useRef, type MouseEvent } from "react";

import { prefersReducedMotion } from "../components/likeFeedback";

/** How close in time and place taps must be to count as one gesture. */
const TAP_WINDOW_MS = 320;
const TAP_SLOP_PX = 24;

/**
 * Controls keep their own taps: a double tap on a link, a button (the like
 * button itself), a menu, a field, the editor or a picture is not a like.
 */
const INTERACTIVE =
  "a, button, input, textarea, select, summary, label, video, audio, img, [role=button], [role=menuitem], [role=link], [role=tab], [role=checkbox], [role=radio], [role=switch], [contenteditable=true], .cm-editor, [data-no-tap-gesture]";

/** Marks the element a gesture belongs to, so a reply inside a comment is its own. */
export const TAP_GESTURE_ATTRIBUTE = "data-tap-gesture";

/**
 * Quick taps on a comment or reply, with a finger or a mouse:
 *
 * - a double tap likes it (or takes the like back), as its like button
 *   would: the button is pressed, so a signed-out reader gets the login
 *   window and the count changes at once; a thumbs-up pops at the tap;
 * - a triple tap opens its discussion thread.
 *
 * A double tap waits a moment for a third, so a triple tap does not like
 * the comment on the way. The page does not zoom on a double tap
 * (`touch-action: manipulation`), and a double-click does not select a word.
 */
export function useCommentTapGestures({
  onOpenThread,
  enabled = true,
}: {
  /** What a triple tap does; without it a triple tap does nothing. */
  onOpenThread?: () => void;
  enabled?: boolean;
}) {
  const taps = useRef<{ count: number; at: number; x: number; y: number }>({
    count: 0,
    at: 0,
    x: 0,
    y: 0,
  });
  const likeTimer = useRef<number | undefined>(undefined);
  const openThreadRef = useRef(onOpenThread);
  useEffect(() => {
    openThreadRef.current = onOpenThread;
  }, [onOpenThread]);
  useEffect(() => () => window.clearTimeout(likeTimer.current), []);

  /** Whether this press belongs to this element and to no control in it. */
  const isOwnPlainTap = (event: MouseEvent<HTMLElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return false;
    if (target.closest(`[${TAP_GESTURE_ATTRIBUTE}]`) !== event.currentTarget)
      return false;
    const control = target.closest(INTERACTIVE);
    return !control || !event.currentTarget.contains(control);
  };

  const onMouseDown = (event: MouseEvent<HTMLElement>) => {
    // A double-click would select a word under the pointer.
    if (enabled && event.detail > 1 && isOwnPlainTap(event)) {
      event.preventDefault();
    }
  };

  const onClick = (event: MouseEvent<HTMLElement>) => {
    if (!enabled || !isOwnPlainTap(event)) return;
    // Text being selected with a drag is not a tap.
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim()) {
      taps.current.count = 0;
      return;
    }
    const now = performance.now();
    const last = taps.current;
    const near =
      now - last.at < TAP_WINDOW_MS &&
      Math.hypot(event.clientX - last.x, event.clientY - last.y) < TAP_SLOP_PX;
    const count = near ? last.count + 1 : 1;
    taps.current = { count, at: now, x: event.clientX, y: event.clientY };

    if (count === 2) {
      const container = event.currentTarget;
      const point = { x: event.clientX, y: event.clientY };
      window.clearTimeout(likeTimer.current);
      likeTimer.current = window.setTimeout(
        () => pressLike(container, point),
        TAP_WINDOW_MS,
      );
    } else if (count === 3) {
      window.clearTimeout(likeTimer.current);
      taps.current.count = 0;
      openThreadRef.current?.();
    }
  };

  // The element also needs `data-tap-gesture` (TAP_GESTURE_ATTRIBUTE).
  return {
    onMouseDown,
    onClick,
    style: { touchAction: "manipulation" as const },
  };
}

/** Presses the element's own like button, and shows a like at the tap. */
function pressLike(container: HTMLElement, point: { x: number; y: number }) {
  const button = [
    ...container.querySelectorAll<HTMLElement>("[data-comment-like]"),
  ].find(
    (candidate) =>
      candidate.closest(`[${TAP_GESTURE_ATTRIBUTE}]`) === container,
  );
  if (!button || button.matches(":disabled")) return;
  const wasLiked = button.getAttribute("aria-pressed") === "true";
  button.click();
  // After the like is shown: a thumbs-up where the finger was, only when
  // the tap gave a like (a signed-out reader gets the login window).
  requestAnimationFrame(() => {
    const liked = button.getAttribute("aria-pressed") === "true";
    if (!wasLiked && liked) popLike(button, point);
  });
}

function popLike(button: HTMLElement, point: { x: number; y: number }) {
  const icon = button.querySelector("svg");
  if (!icon || prefersReducedMotion()) return;
  const burst = icon.cloneNode(true) as SVGElement;
  const size = 44;
  burst.setAttribute("width", String(size));
  burst.setAttribute("height", String(size));
  burst.setAttribute("aria-hidden", "true");
  Object.assign(burst.style, {
    position: "fixed",
    left: `${point.x - size / 2}px`,
    top: `${point.y - size / 2}px`,
    zIndex: "400",
    pointerEvents: "none",
    color: "var(--accent-ink, var(--accent))",
    filter:
      "drop-shadow(0 6px 14px color-mix(in srgb, var(--accent) 45%, transparent))",
  });
  document.body.append(burst);
  const animation = burst.animate(
    [
      { transform: "scale(0.4)", opacity: 0 },
      { transform: "scale(1.15)", opacity: 1, offset: 0.35 },
      { transform: "translateY(-18px) scale(1)", opacity: 0 },
    ],
    { duration: 650, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
  );
  animation.onfinish = () => burst.remove();
  animation.oncancel = () => burst.remove();
}
