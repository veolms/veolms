/**
 * A tap that closes a menu must do only that. The menu (and the dimmed
 * layer of a bottom sheet) closes on the finger's `pointerup` / the
 * outside `pointerdown`, and is gone before the browser delivers the rest
 * of the same tap: the compatibility `mousedown` / `mouseup` and the
 * `click`. Those then land on whatever was under the menu, most often the
 * video, and played or paused it (or pressed a control).
 *
 * This swallows the rest of that one tap, in the capture phase before any
 * other listener sees it, and then steps aside: after the first `click`,
 * or after `timeoutMs` when the browser sends none (a drag, a cancelled
 * touch).
 */

/** Events the browser still sends for a tap after its `pointerup`. */
export const TAP_TAIL_EVENTS: readonly string[] = [
  "mousedown",
  "mouseup",
  "click",
  "dblclick",
];

/**
 * Events of a press after its `pointerdown`: the player's video surface
 * plays and pauses on `pointerup` / `touchend`, not on `click`.
 */
export const PRESS_TAIL_EVENTS: readonly string[] = [
  "touchstart",
  "pointerup",
  "touchend",
  ...TAP_TAIL_EVENTS,
];

/** Before the page's own listeners (the object form, which every EventTarget matches on removal). */
const CAPTURE = { capture: true } as const;

/** Long enough for a slow phone's delayed click, short enough to never eat the next tap. */
export const TAP_THROUGH_WINDOW_MS = 700;

interface ListenerTarget {
  addEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: (event: Event) => void,
    options?: boolean | EventListenerOptions,
  ): void;
}

/**
 * Swallows the rest of the current tap. `isProtected` limits it to events
 * aimed at some elements (the player), so a click elsewhere on the page
 * still works. Returns a function that stops swallowing early.
 */
export function swallowTapThrough({
  target = typeof window === "undefined"
    ? undefined
    : (window as ListenerTarget),
  isProtected = () => true,
  timeoutMs = TAP_THROUGH_WINDOW_MS,
  events = TAP_TAIL_EVENTS,
}: {
  target?: ListenerTarget;
  isProtected?: (eventTarget: EventTarget | null) => boolean;
  timeoutMs?: number;
  /** What to swallow: the rest of a tap after `pointerup` (default) or after `pointerdown`. */
  events?: readonly string[];
} = {}): () => void {
  if (!target) return () => undefined;
  let done = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    if (done) return;
    done = true;
    if (timer !== null) clearTimeout(timer);
    for (const type of events) {
      target.removeEventListener(type, swallow, CAPTURE);
    }
  };

  function swallow(event: Event) {
    if (!isProtected(event.target)) {
      // The tap went somewhere else on the page: leave it alone.
      if (event.type === "click") stop();
      return;
    }
    // Window touch listeners are passive: cancelling a touchstart there only
    // logs a warning. Stopping it is what keeps it from the player.
    if (event.type !== "touchstart") event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    // The click ends the tap (a double tap's second half is a new tap).
    if (event.type === "click") stop();
  }

  for (const type of events) {
    target.addEventListener(type, swallow, CAPTURE);
  }
  timer = setTimeout(stop, timeoutMs);
  return stop;
}
