import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

const STORAGE_KEY = "veolms:learning-player-height";
/**
 * The video area can be dragged all the way shut. Released shorter than
 * this, it closes completely rather than leaving a sliver of video.
 */
const HIDDEN_HEIGHT_SNAP = 48;
/** Released this close to the full height, the video goes back to full. */
const FULL_HEIGHT_SNAP = 12;
const KEYBOARD_STEP = 24;

/**
 * At this height or less the video counts as compact, and a phone's player
 * drops its secondary controls.
 */
export const LESSON_PLAYER_COMPACT_HEIGHT = 160;

/**
 * At this height or less, a video on a wider screen (tablet, desktop) has
 * its timeline moved from above the control bar down onto the video's
 * bottom edge, as on a phone, to leave the short picture clear.
 */
export const LESSON_PLAYER_SHORT_HEIGHT = 250;

/**
 * At this height or less, a wider screen's seek tooltip shows the time
 * alone, in line with the control bar: there is no room above the bar.
 */
export const LESSON_PLAYER_SEEK_TIME_ONLY_HEIGHT = 140;

/** At this height or less a phone's player keeps only a small play button. */
export const LESSON_PLAYER_TINY_HEIGHT = 100;

/** The custom property the player slot reads its height limit from. */
export const LESSON_PLAYER_MAX_HEIGHT_PROPERTY = "--learning-player-max-height";

function readStoredHeight(): number | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return null;
    const height = Number(stored);
    return Number.isFinite(height) && height >= 0 ? height : null;
  } catch {
    return null;
  }
}

function storeHeight(height: number | null) {
  try {
    if (height === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(Math.round(height)));
  } catch {
    // The height still applies for this visit.
  }
}

/**
 * The height the viewer has given the lesson video area, or `null` for its
 * natural 16:9 height. Remembered on this device.
 */
export function useLessonPlayerHeight() {
  const [height, setHeight] = useState<number | null>(() =>
    typeof window === "undefined" ? null : readStoredHeight(),
  );
  const changeHeight = useCallback((next: number | null) => {
    setHeight(next);
    storeHeight(next);
  }, []);
  return [height, changeHeight] as const;
}

const findSlot = (handle: HTMLElement) =>
  handle.parentElement?.querySelector<HTMLElement>(
    "[data-learning-player-anchor]",
  ) ?? null;

const applyHeight = (slot: HTMLElement, next: number | null) => {
  if (next === null) {
    slot.style.removeProperty(LESSON_PLAYER_MAX_HEIGHT_PROPERTY);
    delete slot.dataset.learningPlayerShortened;
  } else {
    slot.style.setProperty(LESSON_PLAYER_MAX_HEIGHT_PROPERTY, `${next}px`);
    slot.dataset.learningPlayerShortened = "";
  }
};

/** Marks the slot while it is being resized; the player hides its controls. */
const markResizing = (slot: HTMLElement | null, resizing: boolean) => {
  if (!slot) return;
  if (resizing) slot.dataset.learningPlayerResizing = "";
  else delete slot.dataset.learningPlayerResizing;
};

/**
 * Says whether a mouse (not a finger) is over the grip's strip.
 * Kept on the grip's strip, where its styles read it.
 */
const GRIP_STRIP_SELECTOR = '[role="separator"][aria-label="Resize video"]';

const markMouseHover = (hovered: boolean) => {
  document
    .querySelector<HTMLElement>(GRIP_STRIP_SELECTOR)
    ?.toggleAttribute("data-mouse-hover", hovered);
};

const resolveHeight = (wanted: number, fullHeight: number) =>
  wanted >= fullHeight - FULL_HEIGHT_SNAP ? null : Math.max(0, wanted);

/** Where a drag that was let go at `height` settles. */
const settleHeight = (height: number | null) =>
  height !== null && height < HIDDEN_HEIGHT_SNAP ? 0 : height;

interface HeightDrag {
  pointerId: number;
  startY: number;
  startHeight: number;
  fullHeight: number;
  height: number | null;
}

/**
 * A strip along the bottom edge of the lesson video that is dragged up to
 * make the video area shorter (the picture shrinks inside it, keeping its
 * shape), all the way to hidden, and back down to its full height, which
 * is as tall as it goes.
 *
 * While the pointer is held the height is written straight onto the slot, so
 * the lesson page does not re-render on every move; the result is handed to
 * `onChange` on release.
 */
export function LessonPlayerHeightHandle({
  height,
  onChange,
}: {
  height: number | null;
  onChange: (height: number | null) => void;
}) {
  const dragRef = useRef<HeightDrag | null>(null);
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // On a phone a finger resizes from the title; the grip is for a mouse.
    if (event.pointerType === "touch" && window.innerWidth <= 640) return;
    const slot = findSlot(event.currentTarget);
    if (!slot) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: slot.getBoundingClientRect().height,
      fullHeight: (slot.getBoundingClientRect().width * 9) / 16,
      height,
    };
    markResizing(slot, true);
    setDragging(true);
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const slot = findSlot(event.currentTarget);
    markResizing(slot, false);
    const settled = settleHeight(drag.height);
    if (slot && settled !== drag.height) applyHeight(slot, settled);
    onChange(settled);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const slot = findSlot(event.currentTarget);
    if (!drag || drag.pointerId !== event.pointerId || !slot) return;
    // A release that never reached the handle must not leave it dragging.
    if ((event.buttons & 1) === 0) {
      endDrag(event);
      return;
    }
    drag.height = resolveHeight(
      drag.startHeight + event.clientY - drag.startY,
      drag.fullHeight,
    );
    applyHeight(slot, drag.height);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const slot = findSlot(event.currentTarget);
    if (!slot) return;
    event.preventDefault();
    const bounds = slot.getBoundingClientRect();
    const next = resolveHeight(
      bounds.height +
        (event.key === "ArrowUp" ? -KEYBOARD_STEP : KEYBOARD_STEP),
      (bounds.width * 9) / 16,
    );
    applyHeight(slot, next);
    onChange(next);
  };

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize video"
      title="Drag to resize the video (Alt+V hides or shows it)"
      aria-keyshortcuts="Alt+V"
      tabIndex={0}
      // A short video on a wider screen has its timeline on that edge too.
      // There the strip only steps down far enough to leave the timeline
      // itself free, and the grip is drawn exactly where it always is, 5px
      // under the video, so it does not move as the video is resized.
      // At phone width the strip sits clear below the video, so that it
      // does not lie over the timeline on the video's bottom edge, and it
      // lets every touch through to the title under it: it only takes the
      // pointer once a mouse is there (which the title notices first).
      // At phone width the grip shows only while it, or the lesson title
      // under it, is under a real mouse (touch uses the title swipe). CSS
      // cannot tell that apart: a finger leaves `:hover` behind, and a
      // phone-sized view on a computer reports no hover support at all. So
      // the pointer's own type decides, and marks the grip (`markMouseHover`).
      data-dragging={dragging || undefined}
      className="group/player-height pointer-events-auto absolute inset-x-0 bottom-0 z-41 flex h-3 translate-y-1/2 cursor-ns-resize touch-none items-center justify-center outline-none select-none max-[640px]:pointer-events-none max-[640px]:translate-y-[calc(100%+10px)] max-[640px]:items-start max-[640px]:data-mouse-hover:pointer-events-auto min-[641px]:[.learning-workspace\_\_player-wrap:has([data-learning-player-short])_&]:translate-y-[calc(100%+4px)] min-[641px]:[.learning-workspace\_\_player-wrap:has([data-learning-player-short])_&]:items-start"
      onPointerEnter={(event) => markMouseHover(event.pointerType === "mouse")}
      onPointerLeave={() => {
        if (!dragRef.current) markMouseHover(false);
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      // Double click: a shortened or hidden video goes back to full height;
      // one already at full height is put away at the top.
      onDoubleClick={(event) => {
        const next = height === null ? 0 : null;
        const slot = findSlot(event.currentTarget);
        if (slot) applyHeight(slot, next);
        onChange(next);
      }}
      onKeyDown={handleKeyDown}
    >
      <span
        aria-hidden="true"
        className="block h-1 w-16 shrink-0 translate-y-[7px] rounded-full max-[640px]:translate-y-0 min-[641px]:[.learning-workspace\_\_player-wrap:has([data-learning-player-short])_&]:translate-y-px bg-[color-mix(in_srgb,var(--accent)_54%,var(--border))] opacity-0 transition-[width,opacity,background-color] duration-160 ease-out group-hover/player-height:opacity-50 group-data-mouse-hover/player-height:opacity-50 group-focus-visible/player-height:opacity-50 motion-reduce:transition-none group-data-dragging/player-height:w-20 group-data-dragging/player-height:bg-(--accent) group-data-dragging/player-height:opacity-100"
      />
    </div>
  );
}

/** A touch has to travel this far up or down before it resizes the video. */
const TITLE_SWIPE_START_DISTANCE = 8;

/**
 * Let go while moving at least this fast (px/ms), the swipe is a flick: up
 * puts the video away, down brings it back to full height, however far the
 * finger travelled. The speed is taken over the last moments of the swipe.
 */
const TITLE_FLICK_SPEED = 0.45;
const TITLE_FLICK_SAMPLE_MS = 90;
const TITLE_FLICK_SETTLE_MS = 220;

interface TitleSwipe extends HeightDrag {
  active: boolean;
  slot: HTMLElement;
  startX: number;
  /** Recent positions, oldest first, for the speed at release. */
  samples: SwipeSample[];
}

interface SwipeSample {
  time: number;
  y: number;
}

/** Vertical speed (px/ms, down is positive) over the end of a swipe. */
function getReleaseSpeed(samples: readonly SwipeSample[]) {
  const latest = samples[samples.length - 1];
  if (!latest) return 0;
  const earlier =
    samples.find(
      (sample) => latest.time - sample.time <= TITLE_FLICK_SAMPLE_MS,
    ) ?? latest;
  return latest.time > earlier.time
    ? (latest.y - earlier.y) / (latest.time - earlier.time)
    : 0;
}

/**
 * Ends a touch resize: a flick goes all the way (up hides the video, down
 * restores its full height), anything slower stays where it was let go.
 */
function releaseTouchResize(
  slot: HTMLElement,
  samples: readonly SwipeSample[],
  height: number | null,
  onChange: (height: number | null) => void,
) {
  const speed = getReleaseSpeed(samples);
  if (Math.abs(speed) >= TITLE_FLICK_SPEED) {
    const target = speed < 0 ? 0 : null;
    // The page hears of the new height once the glide is over, so that it
    // does not put the slot there itself part-way through. The slot counts
    // as being resized until then, which keeps the player's controls away
    // for the whole glide.
    settleSlotWithMotion(slot, target, () => {
      onChange(target);
      // After the page has taken over, so a hidden video's controls do
      // not show for a frame in between.
      window.setTimeout(() => markResizing(slot, false), 60);
    });
    return;
  }
  markResizing(slot, false);
  const settled = settleHeight(height);
  if (settled !== height) applyHeight(slot, settled);
  onChange(settled);
}

/** Glides the slot to where a flick sends it instead of jumping there. */
function settleSlotWithMotion(
  slot: HTMLElement,
  target: number | null,
  onSettled: () => void,
) {
  const fullHeight = (slot.getBoundingClientRect().width * 9) / 16;
  slot.style.transition = `max-height ${TITLE_FLICK_SETTLE_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`;
  // "Full height" is no limit at all, which cannot be animated to: glide
  // to the full height in pixels first, then lift the limit.
  applyHeight(slot, target ?? fullHeight);
  window.setTimeout(() => {
    slot.style.removeProperty("transition");
    if (target === null) applyHeight(slot, null);
    onSettled();
  }, TITLE_FLICK_SETTLE_MS + 40);
}

/**
 * On a touch screen the lesson title under the video works like the resize
 * strip: swiping up on it makes the video shorter, all the way to hidden,
 * and swiping down brings it back. A quick flick up or down goes the whole
 * way, like the handle of a bottom sheet. A tap is still a tap. Spread the result
 * onto the title; it needs a `touch-action` there that keeps the page from
 * taking the swipe as a scroll: `none` while the video is shortened, and
 * `pan-up` (the browser keeps downward drags) while it is at full height.
 */
export function useLessonTitleHeightSwipe(
  height: number | null,
  onChange: (height: number | null) => void,
) {
  const swipeRef = useRef<TitleSwipe | null>(null);
  const swallowClickRef = useRef(false);

  const end = (event: ReactPointerEvent<HTMLElement>) => {
    const swipe = swipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    swipeRef.current = null;
    if (!swipe.active) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    releaseTouchResize(swipe.slot, swipe.samples, swipe.height, onChange);
    // The release that ends a swipe is not a tap on the title.
    swallowClickRef.current = true;
    window.setTimeout(() => {
      swallowClickRef.current = false;
    }, 350);
  };

  return {
    // For the header around the title. The grip shows only while a mouse is
    // over the grip's own strip, not the rest of the title. At phone width
    // that strip lets pointers through to the header (so touches reach the
    // title), which is why the header is what notices a mouse arriving on it.
    onHeaderPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== "mouse") return;
      const strip = document
        .querySelector<HTMLElement>(GRIP_STRIP_SELECTOR)
        ?.getBoundingClientRect();
      markMouseHover(
        Boolean(
          strip &&
          event.clientX >= strip.left &&
          event.clientX <= strip.right &&
          event.clientY >= strip.top &&
          event.clientY <= strip.bottom,
        ),
      );
    },
    onHeaderPointerLeave: () => markMouseHover(false),
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== "touch" || !event.isPrimary) return;
      const slot = document.querySelector<HTMLElement>(
        "[data-learning-player-anchor]",
      );
      if (!slot) return;
      const bounds = slot.getBoundingClientRect();
      swipeRef.current = {
        active: false,
        fullHeight: (bounds.width * 9) / 16,
        height,
        pointerId: event.pointerId,
        samples: [],
        slot,
        startHeight: bounds.height,
        startX: event.clientX,
        startY: event.clientY,
      };
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const swipe = swipeRef.current;
      if (!swipe || swipe.pointerId !== event.pointerId) return;
      if (!swipe.active) {
        const deltaX = Math.abs(event.clientX - swipe.startX);
        const deltaY = Math.abs(event.clientY - swipe.startY);
        if (Math.max(deltaX, deltaY) < TITLE_SWIPE_START_DISTANCE) return;
        // A video already at full height has nowhere to go on a downward
        // swipe: that one is left to the browser (pull to refresh).
        const pullsDownAtFullHeight =
          swipe.height === null && event.clientY > swipe.startY;
        if (deltaX > deltaY || pullsDownAtFullHeight) {
          swipeRef.current = null;
          return;
        }
        swipe.active = true;
        swipe.startY = event.clientY;
        markResizing(swipe.slot, true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      swipe.samples.push({ time: event.timeStamp, y: event.clientY });
      if (swipe.samples.length > 8) swipe.samples.shift();
      swipe.height = resolveHeight(
        swipe.startHeight + event.clientY - swipe.startY,
        swipe.fullHeight,
      );
      applyHeight(swipe.slot, swipe.height);
    },
    onPointerUp: end,
    onPointerCancel: end,
    onClickCapture: (event: {
      preventDefault(): void;
      stopPropagation(): void;
    }) => {
      if (!swallowClickRef.current) return;
      swallowClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}

/** Touches that begin on these are left alone by the pull-down. */
const PULL_DOWN_IGNORED_TARGETS =
  "#learning-course-content-trigger, input, textarea, [contenteditable=true], [data-discussion-atomic-editor], [role=dialog]";

interface HiddenVideoPull {
  active: boolean;
  fullHeight: number;
  height: number | null;
  identifier: number;
  samples: SwipeSample[];
  slot: HTMLElement;
  startHeight: number;
  startX: number;
  startY: number;
}

/** Nothing between the touched element and the page has scrolled down. */
function isScrolledToTop(target: Element) {
  for (
    let element: Element | null = target;
    element;
    element = element.parentElement
  ) {
    if (element.scrollTop > 0) return false;
  }
  return true;
}

/**
 * On a phone, a video that has been made shorter, or put away altogether,
 * is pulled back from the page under it: once the description and comments
 * are scrolled to their top, dragging down anywhere in them draws the video
 * out as far as the finger goes, and a flick down brings it out completely. (The same pull would otherwise be
 * the browser's own overscroll, which is why it is claimed here.)
 */
export function useLessonHiddenVideoPullDown(
  height: number | null,
  onChange: (height: number | null) => void,
) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (height === null) return undefined;
    let pull: HiddenVideoPull | null = null;

    const findTouch = (touches: TouchList) =>
      Array.from(touches).find(
        (touch) => touch.identifier === pull?.identifier,
      );

    const handleStart = (event: TouchEvent) => {
      pull = null;
      const touch = event.touches[0];
      const target = event.target;
      if (
        window.innerWidth > 640 ||
        event.touches.length !== 1 ||
        !touch ||
        !(target instanceof Element) ||
        !target.closest("[data-learning-lesson-content]") ||
        target.closest(PULL_DOWN_IGNORED_TARGETS) ||
        !isScrolledToTop(target)
      ) {
        return;
      }
      const slot = document.querySelector<HTMLElement>(
        "[data-learning-player-anchor]",
      );
      if (!slot) return;
      const bounds = slot.getBoundingClientRect();
      pull = {
        active: false,
        fullHeight: (bounds.width * 9) / 16,
        height,
        startHeight: bounds.height,
        identifier: touch.identifier,
        samples: [],
        slot,
        startX: touch.clientX,
        startY: touch.clientY,
      };
    };

    const handleMove = (event: TouchEvent) => {
      if (!pull) return;
      const touch = findTouch(event.touches);
      if (!touch) return;
      if (!pull.active) {
        const deltaX = touch.clientX - pull.startX;
        const deltaY = touch.clientY - pull.startY;
        if (
          deltaY < -TITLE_SWIPE_START_DISTANCE ||
          Math.abs(deltaX) > Math.max(TITLE_SWIPE_START_DISTANCE, deltaY)
        ) {
          pull = null;
          return;
        }
        if (deltaY < TITLE_SWIPE_START_DISTANCE) return;
        if (
          !(event.target instanceof Element) ||
          !isScrolledToTop(event.target)
        ) {
          pull = null;
          return;
        }
        pull.active = true;
        pull.startY = touch.clientY;
        markResizing(pull.slot, true);
      }
      if (event.cancelable) event.preventDefault();
      pull.samples.push({ time: event.timeStamp, y: touch.clientY });
      if (pull.samples.length > 8) pull.samples.shift();
      pull.height = resolveHeight(
        pull.startHeight + touch.clientY - pull.startY,
        pull.fullHeight,
      );
      applyHeight(pull.slot, pull.height);
    };

    const handleEnd = (event: TouchEvent) => {
      if (!pull || findTouch(event.touches)) return;
      const ended = pull;
      pull = null;
      if (!ended.active) return;
      releaseTouchResize(ended.slot, ended.samples, ended.height, (next) =>
        onChangeRef.current(next),
      );
    };

    document.addEventListener("touchstart", handleStart, { passive: true });
    document.addEventListener("touchmove", handleMove, { passive: false });
    document.addEventListener("touchend", handleEnd);
    document.addEventListener("touchcancel", handleEnd);
    return () => {
      document.removeEventListener("touchstart", handleStart);
      document.removeEventListener("touchmove", handleMove);
      document.removeEventListener("touchend", handleEnd);
      document.removeEventListener("touchcancel", handleEnd);
    };
  }, [height]);
}
