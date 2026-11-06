/**
 * Scrolling the list while a course is dragged near its top or bottom
 * edge, so a course can be carried past what fits on the screen.
 *
 * The closer the pointer is to the edge (or past it), the faster the list
 * moves, and it speeds up the longer the pointer stays there: a short list
 * stays easy to aim in, a long one is crossed in a few seconds. Speeds are
 * in pixels per millisecond and scale with the list's height, so a phone
 * and a desktop cross a screenful in about the same time.
 */

/** How long the pointer stays at an edge before the scroll is at full speed. */
const RAMP_MS = 1200;
/** How much faster than the starting speed the ramp ends. */
const RAMP_GAIN = 2.5;

export interface EdgeBounds {
  top: number;
  bottom: number;
}

/** The band at each edge that scrolls: a share of the height, kept usable. */
export function edgeZone(height: number): number {
  return Math.min(Math.max(height * 0.18, 56), 140);
}

/** The fastest scroll before the ramp: a screenful in about 0.9 seconds. */
export function baseSpeed(height: number): number {
  return Math.min(Math.max(height / 900, 0.5), 1.6);
}

/**
 * The scroll speed for a pointer at `y` (negative: up), given how long it
 * has stayed in an edge band. Zero away from the edges.
 */
export function autoScrollSpeed(
  y: number,
  bounds: EdgeBounds,
  heldMs: number,
): number {
  const height = Math.max(bounds.bottom - bounds.top, 1);
  const zone = edgeZone(height);
  const fromTop = y - bounds.top;
  const fromBottom = bounds.bottom - y;
  let direction = 0;
  let depth = 0;
  if (fromTop < zone) {
    direction = -1;
    depth = (zone - fromTop) / zone;
  } else if (fromBottom < zone) {
    direction = 1;
    depth = (zone - fromBottom) / zone;
  }
  if (direction === 0) return 0;
  const intensity = Math.min(Math.max(depth, 0), 1);
  const ramp = 1 + (RAMP_GAIN - 1) * Math.min(heldMs / RAMP_MS, 1);
  // Squared, so the band's inner part creeps and its outer part rushes.
  return direction * baseSpeed(height) * (0.15 + 0.85 * intensity ** 2) * ramp;
}

/** The nearest ancestor that scrolls up and down, or the page itself. */
export function scrollParentOf(element: Element | null): HTMLElement {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
  }
  return (document.scrollingElement ?? document.documentElement) as HTMLElement;
}

function boundsOf(container: HTMLElement): EdgeBounds {
  if (
    container === document.scrollingElement ||
    container === document.documentElement
  ) {
    return { top: 0, bottom: window.innerHeight };
  }
  const box = container.getBoundingClientRect();
  return {
    top: Math.max(box.top, 0),
    bottom: Math.min(box.bottom, window.innerHeight),
  };
}

export interface AutoScroller {
  /** Where the pointer is now, in viewport coordinates. */
  update: (clientY: number) => void;
  stop: () => void;
}

/**
 * Scrolls `container` on every frame while the pointer is in an edge band;
 * `onScrolled` runs after each step, so what is under the pointer can be
 * looked at again.
 */
export function startAutoScroll(
  container: HTMLElement,
  onScrolled?: () => void,
): AutoScroller {
  let pointerY: number | null = null;
  let heldSince: number | null = null;
  let last = performance.now();
  let frame = requestAnimationFrame(step);

  function step(now: number) {
    const elapsed = Math.min(now - last, 50);
    last = now;
    if (pointerY !== null) {
      const speed = autoScrollSpeed(pointerY, boundsOf(container), 0);
      if (speed === 0) {
        heldSince = null;
      } else {
        heldSince ??= now;
        const ramped = autoScrollSpeed(
          pointerY,
          boundsOf(container),
          now - heldSince,
        );
        const before = container.scrollTop;
        container.scrollTop = before + ramped * elapsed;
        if (container.scrollTop !== before) onScrolled?.();
      }
    }
    frame = requestAnimationFrame(step);
  }

  return {
    update: (clientY) => {
      pointerY = clientY;
    },
    stop: () => cancelAnimationFrame(frame),
  };
}
