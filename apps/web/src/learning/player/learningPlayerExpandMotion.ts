import {
  LEARNING_MINI_PLAYER_CORNER_RADIUS_PX,
  LEARNING_PLAYER_MOTION_DURATION_MS,
  LEARNING_PLAYER_MOTION_EASING,
  easeLearningPlayerMotionProgress,
  getLearningMotionSurfaceElement,
} from "./learningPlayerMotion";

/** A box on the lesson page, in viewport coordinates with the page at rest. */
export interface LearningPagePartRect {
  left: number;
  top: number;
  width: number;
}

/** Where the lesson page is expected to sit once it is back. */
export interface LearningPlayerExpandTarget extends LearningPagePartRect {
  /** The course content column, when it was showing. */
  column: LearningPagePartRect | null;
  /** Everything under the video. */
  content: LearningPagePartRect | null;
}

/**
 * Ends a motion early. With `hold`, everything that was moving is left
 * exactly where it is on screen, so another motion can pick it up from
 * there instead of from its resting place.
 */
export type LearningPlayerMotionFinish = (options?: { hold?: boolean }) => void;

export interface LearningPlayerExpandMotion {
  /**
   * Call once the host has become the full player. The motion carries on
   * from where it is and the returned function ends it early.
   *
   * With `turnedBack`, the expand was reversed before the lesson page
   * arrived: the full player is simply left where the window currently is,
   * ready for a minimize to take it the rest of the way.
   */
  handOff: (
    fullHost: HTMLElement,
    options?: { turnedBack?: boolean },
  ) => LearningPlayerMotionFinish;
  /** Turns the motion around from wherever it has reached. */
  reverse: () => void;
  /** Abandons the expand and leaves the mini window as it was. */
  cancel: () => void;
}

const QUICK_FADE_MS = 140;
const PLACEHOLDER_FADE_OUT_MS = 180;
const SETTLE_CORRECTION_MS = 220;
const TURN_MIN_DURATION_MS = 220;
const CORNER_SQUARE_OFF_MS = 180;
const RECT_TOLERANCE_PX = 1;
const FINISH_FALLBACK_BUFFER_MS = 250;
const MIN_PLACEHOLDER_PART_WIDTH_PX = 120;

const VIDEO_BOX_SELECTOR = ".youtube-player";
/** Parts of the mini window that sit under the video and must not zoom. */
const BELOW_VIDEO_SELECTOR =
  "[data-learning-mini-player-info-bar], [data-learning-mini-player-playlist-shell]";
/**
 * Layers drawn over the whole mini window (reading mode). They are not part
 * of the full player, so they must not grow past the video with the window.
 */
const WINDOW_OVERLAY_SELECTOR = ":scope > .reading-mode-effects";
/** Mini-only chrome on the video that should be gone at lift-off. */
const VIDEO_CHROME_SELECTOR =
  "[data-learning-mini-player-controls-ready], [data-mini-player-resize-handle]";
/** The parts of the lesson page that arrive attached to the player. */
const LESSON_PAGE_PARTS = [
  { key: "column", selector: ".learning-workspace__curriculum-column" },
  { key: "content", selector: ".learning-workspace__lesson-content" },
] as const;
const PLACEHOLDER_PARTS = [
  { key: "column", name: "side", display: "flex" },
  { key: "content", name: "content", display: "grid" },
] as const;

const MINI_HOST_INLINE_PROPERTIES = [
  "transform-origin",
  "pointer-events",
  "background-color",
  "box-shadow",
  "transition",
  "border-radius",
] as const;
const VIDEO_BOX_INLINE_PROPERTIES = ["transition", "border-radius"] as const;
const FULL_HOST_INLINE_PROPERTIES = [
  "transform-origin",
  "overflow",
  "z-index",
] as const;
const PLACEHOLDER_INLINE_PROPERTIES = [
  "display",
  "left",
  "top",
  "width",
  "height",
  "border-radius",
  "transform-origin",
] as const;
const PLACEHOLDER_LESSON_CARD_SELECTOR = "[data-learning-expand-sheet-lesson]";

/**
 * Corners of the player where it rests in the lesson card: the top ones
 * follow the card, the bottom ones are square because the lesson continues
 * straight under the video.
 */
const restingPlayerCorners = (radius: string) => `${radius} ${radius} 0 0`;

const cancelAnimations = (animations: readonly Animation[]) => {
  for (const animation of animations) {
    try {
      animation.cancel();
    } catch {
      // The target may already be gone.
    }
  }
};

/**
 * Pins an element, through inline styles, to where it currently appears on
 * screen. `rest` is its rectangle with no motion applied.
 */
function holdAt(
  element: HTMLElement,
  visual: { left: number; top: number; width: number },
  rest: DOMRect,
  mode: "window" | "page-part",
) {
  if (rest.width <= 0) return;
  const x = visual.left - rest.left;
  const y = visual.top - rest.top;
  const scale = visual.width / rest.width;
  if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5 && Math.abs(scale - 1) < 0.002) {
    return;
  }
  element.style.transformOrigin = "top left";
  if (mode === "window") {
    // The form the minimize motion animates the window in.
    element.style.setProperty(
      "translate",
      `${x.toFixed(3)}px ${y.toFixed(3)}px`,
    );
    element.style.setProperty("scale", scale.toFixed(5));
  } else {
    // The form the minimize motion slides the page parts away in.
    element.style.transform = `translate3d(${x.toFixed(3)}px, ${y.toFixed(
      3,
    )}px, 0) scale(${scale.toFixed(5)})`;
  }
}

const cancelTransitions = (element: HTMLElement) =>
  cancelAnimations(
    element
      .getAnimations()
      .filter((animation) => "transitionProperty" in animation),
  );

const clearInlineProperties = (
  element: HTMLElement,
  properties: readonly string[],
) => {
  for (const property of properties) element.style.removeProperty(property);
};

/**
 * The radius the moving window must reach so its corners never poke out of
 * the rounded panel the full player sits in: the player's top-left corner
 * coincides with that panel's corner once it has landed.
 */
function resolveRestingCornerRadius(host: HTMLElement): number {
  let radius = LEARNING_MINI_PLAYER_CORNER_RADIUS_PX;
  for (
    let frame = host.parentElement;
    frame && frame !== document.body;
    frame = frame.parentElement
  ) {
    const style = window.getComputedStyle(frame);
    const frameRadius = Number.parseFloat(style.borderTopLeftRadius);
    if (frameRadius > 0 && style.overflow !== "visible") {
      radius = Math.max(radius, frameRadius);
      break;
    }
  }
  return radius;
}

/**
 * Keyframes that carry a box of the lesson page from the mini window's
 * position to rest. Everything that uses them pivots on the player's resting
 * top-left corner, so the player and the page around it move and zoom as a
 * single sheet.
 */
const sheetKeyframes = (
  fromX: number,
  fromY: number,
  fromScale: number,
): PropertyIndexedKeyframes => ({
  translate: [`${fromX.toFixed(3)}px ${fromY.toFixed(3)}px`, "0px 0px"],
  scale: [fromScale.toFixed(5), "1"],
});

const pivotInBox = (
  pivot: LearningPagePartRect,
  box: { left: number; top: number },
) =>
  `${(pivot.left - box.left).toFixed(3)}px ${(pivot.top - box.top).toFixed(3)}px`;

/**
 * One element of the expand, described by where it is at the mini window
 * and where it is with the full player in place. Describing both ends lets
 * the motion be turned around at any moment and continue from wherever the
 * element currently is, in either direction.
 */
interface MotionTrack {
  element: HTMLElement;
  atMini: Record<string, string>;
  atFull: Record<string, string>;
  /** For parts that only fade briefly rather than travel. */
  durationMs?: number;
  easing?: string;
  animation: Animation | null;
}

const MOTION_IDENTITY: Record<string, string> = {
  translate: "0px 0px",
  scale: "1",
};

function playTrack(
  track: MotionTrack,
  toFull: boolean,
  motion: { durationMs: number; easing: string; fromCurrent: boolean },
) {
  const destination = toFull ? track.atFull : track.atMini;
  let origin = toFull ? track.atMini : track.atFull;
  if (motion.fromCurrent) {
    const style = window.getComputedStyle(track.element);
    origin = Object.fromEntries(
      Object.keys(destination).map((property) => {
        const value = style.getPropertyValue(property);
        return [
          property,
          value === "none" || value === ""
            ? (MOTION_IDENTITY[property] ?? value)
            : value,
        ];
      }),
    );
  }
  track.animation?.cancel();
  track.animation = track.element.animate(
    Object.fromEntries(
      Object.keys(destination).map((property) => [
        property,
        [origin[property]!, destination[property]!],
      ]),
    ),
    {
      duration: track.durationMs ?? motion.durationMs,
      easing: track.easing ?? motion.easing,
      fill: "both",
    },
  );
}

/**
 * Shows the lesson page placeholders and describes their motion along the
 * same path as the player, so the page is visibly arriving from the first
 * frame even though the real page has not rendered yet.
 */
function preparePlaceholderSheet(
  sheet: HTMLElement,
  frame: DOMRect,
  target: LearningPlayerExpandTarget,
  motion: {
    fromScale: number;
    fromX: number;
    fromY: number;
    restRadius: number;
  },
) {
  sheet.style.display = "block";
  sheet.dataset.learningExpandSheetActive = "";
  sheet.style.left = `${frame.left}px`;
  sheet.style.top = `${frame.top}px`;
  sheet.style.width = `${frame.width}px`;
  sheet.style.height = `${frame.height}px`;
  sheet.style.borderRadius = `${motion.restRadius}px`;

  // The lesson card is exactly as wide as the full player. Whatever the
  // sheet has left beside it is the gutter and the course content card.
  const lessonCard = sheet.querySelector<HTMLElement>(
    PLACEHOLDER_LESSON_CARD_SELECTOR,
  );
  if (lessonCard) {
    lessonCard.style.width = `${Math.min(
      frame.width,
      Math.max(0, target.left - frame.left + target.width),
    )}px`;
    lessonCard.style.borderRadius = `${motion.restRadius}px`;
  }

  // The page fades in as it arrives: transparent at the mini window,
  // opaque by the time it is in place.
  const tracks: MotionTrack[] = [
    {
      element: sheet,
      atMini: { opacity: "0" },
      atFull: { opacity: "1" },
      easing: "ease-out",
      animation: null,
    },
  ];
  const parts: HTMLElement[] = [];
  for (const { display, key, name } of PLACEHOLDER_PARTS) {
    const rect = target[key];
    const part = sheet.querySelector<HTMLElement>(
      `[data-learning-expand-sheet-part="${name}"]`,
    );
    if (!part || !rect || rect.width < MIN_PLACEHOLDER_PART_WIDTH_PX) continue;
    part.style.display = display;
    part.style.left = `${rect.left - frame.left}px`;
    part.style.top = `${rect.top - frame.top}px`;
    part.style.width = `${rect.width}px`;
    part.style.height = `${Math.max(0, frame.bottom - rect.top)}px`;
    if (key === "column") part.style.borderRadius = `${motion.restRadius}px`;
    part.style.transformOrigin = pivotInBox(target, rect);
    parts.push(part);
    tracks.push({
      element: part,
      atMini: {
        translate: `${motion.fromX.toFixed(3)}px ${motion.fromY.toFixed(3)}px`,
        scale: motion.fromScale.toFixed(5),
      },
      atFull: MOTION_IDENTITY,
      animation: null,
    });
  }

  let hidden = false;
  let fadeTimer = 0;
  let fade: Animation | null = null;
  const hide = () => {
    if (hidden) return;
    hidden = true;
    window.clearTimeout(fadeTimer);
    fade?.cancel();
    for (const track of tracks) track.animation?.cancel();
    clearInlineProperties(sheet, PLACEHOLDER_INLINE_PROPERTIES);
    delete sheet.dataset.learningExpandSheetActive;
    if (lessonCard) {
      clearInlineProperties(lessonCard, PLACEHOLDER_INLINE_PROPERTIES);
    }
    for (const part of parts) {
      clearInlineProperties(part, PLACEHOLDER_INLINE_PROPERTIES);
    }
  };
  return {
    tracks,
    hide,
    /** Cross-fades to the real page underneath, then hides. */
    fadeOut: () => {
      if (hidden) return;
      fade = sheet.animate(
        { opacity: 0 },
        { duration: PLACEHOLDER_FADE_OUT_MS, fill: "forwards" },
      );
      fadeTimer = window.setTimeout(hide, PLACEHOLDER_FADE_OUT_MS);
    },
  };
}

/**
 * Runs the motion on the full player and squares its corners off once it
 * has landed. `startTime` places it on the clock the mini-window phase
 * started, so taking over from the mini window does not show.
 *
 * With `page`, the real lesson page parts follow the same keyframes around
 * the player's corner and so stay attached to it.
 */
function animateFullHost(
  fullHost: HTMLElement,
  endRect: DOMRect,
  options: {
    durationMs: number;
    fromRadius: number;
    fromScale: number;
    fromX: number;
    fromY: number;
    page: "attached" | "attached-fading-in" | "none";
    restRadius: number;
    startTime: number | null;
  },
): LearningPlayerMotionFinish {
  const {
    durationMs,
    fromRadius,
    fromScale,
    fromX,
    fromY,
    page,
    restRadius,
    startTime,
  } = options;

  fullHost.style.transformOrigin = "top left";
  fullHost.style.overflow = "hidden";
  fullHost.style.zIndex = "190";
  fullHost.dataset.learningPlayerRestorePhase = "expanding";

  const animations: Animation[] = [];
  const pageParts: HTMLElement[] = [];
  /** The travelling animation, while the player has not yet landed. */
  let travelling: Animation | null = null;
  let finished = false;
  const finish: LearningPlayerMotionFinish = (finishOptions) => {
    if (finished) return;
    finished = true;
    window.clearTimeout(timer);
    // Where the sheet is right now, by the wall clock. The computed style
    // would do only if a frame had just rendered, and a hold is often asked
    // for straight after the main thread has been busy.
    let sheetNow: { x: number; y: number; scale: number } | null = null;
    if (finishOptions?.hold && travelling) {
      const clock = travelling.startTime;
      const eased = easeLearningPlayerMotionProgress(
        (typeof clock === "number" ? performance.now() - clock : 0) /
          Math.max(1, durationMs),
      );
      sheetNow = {
        x: fromX * (1 - eased),
        y: fromY * (1 - eased),
        scale: fromScale + (1 - fromScale) * eased,
      };
    }
    cancelAnimations(animations);
    clearInlineProperties(fullHost, FULL_HOST_INLINE_PROPERTIES);
    for (const part of pageParts) {
      part.style.removeProperty("transform-origin");
    }
    delete fullHost.dataset.learningPlayerRestorePhase;
    if (sheetNow) {
      // Everything pivots on the player's resting corner.
      for (const element of [fullHost, ...pageParts]) {
        const rest = element.getBoundingClientRect();
        holdAt(
          element,
          {
            left:
              endRect.left +
              (rest.left - endRect.left) * sheetNow.scale +
              sheetNow.x,
            top:
              endRect.top +
              (rest.top - endRect.top) * sheetNow.scale +
              sheetNow.y,
            width: rest.width * sheetNow.scale,
          },
          rest,
          element === fullHost ? "window" : "page-part",
        );
      }
    }
  };
  const elapsedMs = startTime === null ? 0 : performance.now() - startTime;
  const timer = window.setTimeout(
    finish,
    Math.max(0, durationMs - elapsedMs) +
      CORNER_SQUARE_OFF_MS +
      FINISH_FALLBACK_BUFFER_MS,
  );

  // The player rests with square corners. They are only squared once it has
  // landed, where the surrounding panel clips them anyway.
  const squareOff = () => {
    if (finished) return;
    const tail = fullHost.animate(
      {
        borderRadius: [
          restingPlayerCorners(`${restRadius.toFixed(2)}px`),
          "0px",
        ],
      },
      { duration: CORNER_SQUARE_OFF_MS, easing: "ease-out" },
    );
    travelling = null;
    cancelAnimations(animations.splice(0));
    animations.push(tail);
    tail.finished.then(
      () => finish(),
      () => undefined,
    );
  };
  if (durationMs <= 0) {
    squareOff();
    return finish;
  }

  // Movement, corner radius and opacity are separate animations on purpose:
  // movement and opacity can run on the compositor, the radius cannot, and
  // mixing them would pull everything back onto the main thread.
  const timing: KeyframeAnimationOptions = {
    duration: durationMs,
    easing: LEARNING_PLAYER_MOTION_EASING,
  };
  const keyframes = sheetKeyframes(fromX, fromY, fromScale);
  const move = fullHost.animate(keyframes, timing);
  travelling = move;
  animations.push(
    move,
    fullHost.animate(
      {
        borderRadius: [
          `${fromRadius.toFixed(2)}px`,
          restingPlayerCorners(`${restRadius.toFixed(2)}px`),
        ],
      },
      { ...timing, fill: "forwards" },
    ),
  );
  if (page !== "none") {
    const surface = getLearningMotionSurfaceElement();
    for (const { selector } of LESSON_PAGE_PARTS) {
      const part = surface?.querySelector<HTMLElement>(selector);
      if (!part) continue;
      part.style.transformOrigin = pivotInBox(
        endRect,
        part.getBoundingClientRect(),
      );
      pageParts.push(part);
      animations.push(part.animate(keyframes, timing));
      if (page === "attached-fading-in") {
        animations.push(
          part.animate({ opacity: [0, 1] }, { ...timing, easing: "ease-out" }),
        );
      }
    }
  }
  if (startTime !== null) {
    for (const animation of animations) animation.startTime = startTime;
  }
  move.finished.then(squareOff, () => undefined);
  return finish;
}

/**
 * Expands the full player out of the rectangle the mini window occupied.
 * Used when the motion could not start early, so the whole of it runs on
 * the full player with the real lesson page attached and fading in.
 */
export function expandLearningPlayerFromRect(
  fullHost: HTMLElement,
  startRect: DOMRect,
): LearningPlayerMotionFinish {
  const endRect = fullHost.getBoundingClientRect();
  if (
    typeof fullHost.animate !== "function" ||
    startRect.width <= 0 ||
    endRect.width <= 0 ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return () => undefined;
  }
  const fromScale = startRect.width / endRect.width;
  return animateFullHost(fullHost, endRect, {
    durationMs: LEARNING_PLAYER_MOTION_DURATION_MS,
    fromRadius: LEARNING_MINI_PLAYER_CORNER_RADIUS_PX / fromScale,
    fromScale,
    fromX: startRect.left - endRect.left,
    fromY: startRect.top - endRect.top,
    page: "attached-fading-in",
    restRadius: resolveRestingCornerRadius(fullHost),
    startTime: null,
  });
}

/**
 * Starts expanding the mini window the moment it is asked to, before the
 * lesson page exists again. Only `translate`, `scale` and `opacity` animate,
 * so the compositor keeps everything moving while the route change occupies
 * the main thread.
 *
 * The lesson page is represented by `placeholderSheet` from the first frame,
 * attached to the player and fading in, so the motion never has to wait for
 * the page. `handOff` swaps in the real player and page wherever the motion
 * has reached.
 *
 * Only the video grows inside the mini window. The info bar and lesson list
 * under it keep their size and fade away, since the full player has neither.
 */
export function startLearningPlayerExpand(
  miniHost: HTMLElement,
  target: LearningPlayerExpandTarget,
  placeholderSheet: HTMLElement | null,
): LearningPlayerExpandMotion | null {
  if (
    typeof miniHost.animate !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return null;
  }
  const startRect = miniHost.getBoundingClientRect();
  if (startRect.width <= 0 || target.width <= 0) return null;

  const durationMs = LEARNING_PLAYER_MOTION_DURATION_MS;
  const easing = LEARNING_PLAYER_MOTION_EASING;
  const startedAt = performance.now();
  const targetScale = target.width / startRect.width;
  const restRadius = resolveRestingCornerRadius(miniHost);
  // Layout-size corners that read as the resting ones at the final scale.
  const radiusAtRest = restingPlayerCorners(
    `${(restRadius / targetScale).toFixed(2)}px`,
  );
  const cornerTransition = `border-radius ${durationMs}ms ${easing}`;
  const videoBox = miniHost.querySelector<HTMLElement>(VIDEO_BOX_SELECTOR);
  const belowVideo = Array.from(
    miniHost.querySelectorAll<HTMLElement>(BELOW_VIDEO_SELECTOR),
  );
  // While the window grows, its overlays are cut back to the video. Left
  // alone they would also cover the strip the fading info bar leaves under
  // it, which grows with the window into a band across the lesson page.
  const windowOverlays = Array.from(
    miniHost.querySelectorAll<HTMLElement>(WINDOW_OVERLAY_SELECTOR),
  );
  const belowVideoHeight = videoBox
    ? Math.max(0, miniHost.clientHeight - videoBox.offsetHeight)
    : 0;
  const fitWindowOverlaysToVideo = (fit: boolean) => {
    for (const overlay of windowOverlays) {
      if (fit && belowVideoHeight > 0) {
        overlay.style.clipPath = `inset(0 0 ${belowVideoHeight}px 0)`;
      } else {
        overlay.style.removeProperty("clip-path");
      }
    }
  };
  fitWindowOverlaysToVideo(true);
  const frame = miniHost.parentElement?.getBoundingClientRect();
  const placeholder =
    placeholderSheet && frame
      ? preparePlaceholderSheet(placeholderSheet, frame, target, {
          fromScale: 1 / targetScale,
          fromX: startRect.left - target.left,
          fromY: startRect.top - target.top,
          restRadius,
        })
      : null;

  // Legacy CSS forces the mini window's radius (and squares the video box
  // inside it). A transition is the one thing that outranks those rules, so
  // the corners are moved through transitions on inline important values.
  if (videoBox) {
    // The video loses the bar under it, so in flight its own bottom corners
    // are the window's. They start from the window's radius and square off
    // as it lands, where the lesson continues straight under the video.
    videoBox.style.transition = "none";
    videoBox.style.setProperty(
      "border-radius",
      `${LEARNING_MINI_PLAYER_CORNER_RADIUS_PX}px`,
      "important",
    );
    void window.getComputedStyle(videoBox).borderTopLeftRadius;
    videoBox.style.transition = cornerTransition;
    videoBox.style.setProperty("border-radius", radiusAtRest, "important");
  }
  miniHost.style.transformOrigin = "top left";
  miniHost.style.pointerEvents = "none";
  // Whatever fades under the video fades over the page, not over the
  // window's black backing, and the mini window's shadow stays behind.
  miniHost.style.backgroundColor = "transparent";
  miniHost.style.boxShadow = "none";
  miniHost.style.transition = cornerTransition;
  miniHost.style.setProperty("border-radius", radiusAtRest, "important");

  // The window itself is tracked by hand rather than as a `MotionTrack`:
  // its position has to be known from real time. Reading it back from the
  // computed style is not good enough, because that only advances with
  // rendered frames and the hand-off happens inside the long task that
  // renders the lesson page.
  interface WindowState {
    x: number;
    y: number;
    scale: number;
  }
  const windowAtMini: WindowState = { x: 0, y: 0, scale: 1 };
  const windowAtFull: WindowState = {
    x: target.left - startRect.left,
    y: target.top - startRect.top,
    scale: targetScale,
  };
  let windowRun = {
    from: windowAtMini,
    to: windowAtFull,
    durationMs,
    animation: null as Animation | null,
  };
  const windowKeyframe = ({ scale, x, y }: WindowState) => ({
    translate: `${x.toFixed(3)}px ${y.toFixed(3)}px`,
    scale: scale.toFixed(5),
  });
  const runWindow = (from: WindowState, to: WindowState, runMs: number) => {
    windowRun.animation?.cancel();
    windowRun = {
      from,
      to,
      durationMs: runMs,
      animation: miniHost.animate([windowKeyframe(from), windowKeyframe(to)], {
        duration: runMs,
        easing,
        fill: "both",
      }),
    };
    return windowRun.animation!;
  };
  /** Where the window is right now, by the wall clock. */
  const readWindow = (): WindowState => {
    const { animation, from, to } = windowRun;
    const startTime = animation?.startTime;
    const elapsedMs =
      typeof startTime === "number" ? performance.now() - startTime : 0;
    const eased = easeLearningPlayerMotionProgress(
      elapsedMs / Math.max(1, windowRun.durationMs),
    );
    return {
      x: from.x + (to.x - from.x) * eased,
      y: from.y + (to.y - from.y) * eased,
      scale: from.scale + (to.scale - from.scale) * eased,
    };
  };
  const tracks: MotionTrack[] = [...(placeholder?.tracks ?? [])];
  for (const element of belowVideo) {
    // Counter the window's scale so these keep their size while they fade.
    element.style.transformOrigin = "top left";
    tracks.push(
      {
        element,
        atMini: { scale: "1" },
        atFull: { scale: (1 / targetScale).toFixed(5) },
        animation: null,
      },
      {
        element,
        atMini: { opacity: "1" },
        atFull: { opacity: "0" },
        durationMs: QUICK_FADE_MS,
        easing: "linear",
        animation: null,
      },
    );
  }
  for (const track of tracks) {
    playTrack(track, true, { durationMs, easing, fromCurrent: false });
  }
  // The mini controls only ever fade out; turning back simply drops the
  // fade so they return to whatever the pointer calls for.
  const chromeFades = Array.from(
    miniHost.querySelectorAll<HTMLElement>(VIDEO_CHROME_SELECTOR),
    (chrome) =>
      chrome.animate(
        { opacity: 0 },
        { duration: QUICK_FADE_MS, fill: "forwards" },
      ),
  );
  // The first run of the window: the clock a mid-flight hand-off joins.
  const move = runWindow(windowAtMini, windowAtFull, durationMs);

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    windowRun.animation?.cancel();
    for (const track of tracks) track.animation?.cancel();
    cancelAnimations(chromeFades);
    clearInlineProperties(miniHost, MINI_HOST_INLINE_PROPERTIES);
    fitWindowOverlaysToVideo(false);
    for (const element of belowVideo) {
      element.style.removeProperty("transform-origin");
    }
    if (videoBox) {
      clearInlineProperties(videoBox, VIDEO_BOX_INLINE_PROPERTIES);
      cancelTransitions(videoBox);
    }
    // A corner transition still in flight would outrank whatever radius the
    // next phase animates.
    cancelTransitions(miniHost);
  };

  let headingToFull = true;
  // Once turned around, the motion no longer follows its original clock.
  let reversedOnce = false;
  return {
    cancel: () => {
      release();
      placeholder?.hide();
    },
    reverse: () => {
      if (released) return;
      headingToFull = !headingToFull;
      reversedOnce = true;
      // Ease to the new destination from where everything is now, over a
      // time that matches how far there is left to go.
      const current = readWindow();
      const destination = headingToFull ? windowAtFull : windowAtMini;
      const remaining =
        Math.abs(destination.scale - current.scale) /
        Math.max(0.001, Math.abs(targetScale - 1));
      const turn = {
        durationMs: Math.max(
          TURN_MIN_DURATION_MS,
          durationMs * Math.min(1, remaining),
        ),
        easing,
        fromCurrent: true,
      };
      runWindow(current, destination, turn.durationMs);
      for (const track of tracks) playTrack(track, headingToFull, turn);
      fitWindowOverlaysToVideo(headingToFull);
      if (!headingToFull) cancelAnimations(chromeFades);
      // The corners follow: back to the mini window's, or on to the
      // resting radius again.
      const radius = headingToFull
        ? radiusAtRest
        : `${LEARNING_MINI_PLAYER_CORNER_RADIUS_PX}px`;
      miniHost.style.setProperty("border-radius", radius, "important");
      videoBox?.style.setProperty("border-radius", radius, "important");
    },
    handOff: (fullHost, handOffOptions) => {
      const startTime =
        typeof move.startTime === "number" ? move.startTime : null;
      const elapsedMs = performance.now() - startedAt;
      // Note where the window is before letting go of it.
      const current = readWindow();
      const visual = {
        left: startRect.left + current.x,
        top: startRect.top + current.y,
        width: startRect.width * current.scale,
      };
      release();
      const endRect = fullHost.getBoundingClientRect();
      if (endRect.width <= 0) {
        placeholder?.hide();
        return () => undefined;
      }

      if (handOffOptions?.turnedBack) {
        // Heading back to the corner. Leave the player where the window is,
        // and the lesson page displaced with it, so the minimize that
        // follows takes both the rest of the way without the page first
        // flashing into place.
        placeholder?.hide();
        holdAt(fullHost, visual, endRect, "window");
        const surface = getLearningMotionSurfaceElement();
        for (const { selector } of LESSON_PAGE_PARTS) {
          const part = surface?.querySelector<HTMLElement>(selector);
          if (!part) continue;
          const rest = part.getBoundingClientRect();
          holdAt(
            part,
            {
              left: rest.left + (visual.left - endRect.left),
              top: rest.top + (visual.top - endRect.top),
              width: rest.width,
            },
            rest,
            "page-part",
          );
        }
        return () => undefined;
      }

      // The real page is in place underneath; let the stand-in dissolve.
      placeholder?.fadeOut();
      const landed =
        Math.abs(visual.left - endRect.left) <= RECT_TOLERANCE_PX &&
        Math.abs(visual.top - endRect.top) <= RECT_TOLERANCE_PX &&
        Math.abs(visual.width - endRect.width) <= RECT_TOLERANCE_PX;

      let finishHost: LearningPlayerMotionFinish;
      if (elapsedMs < durationMs && !reversedOnce) {
        // Mid-flight: the real player and page continue the same motion on
        // the same clock, under the dissolving stand-in.
        const fromScale = startRect.width / endRect.width;
        finishHost = animateFullHost(fullHost, endRect, {
          durationMs,
          fromRadius: LEARNING_MINI_PLAYER_CORNER_RADIUS_PX / fromScale,
          fromScale,
          fromX: startRect.left - endRect.left,
          fromY: startRect.top - endRect.top,
          page: "attached",
          restRadius,
          startTime,
        });
      } else {
        // Either resting where the player was expected, or part-way after
        // being turned around and back. Finish from wherever it is.
        const fromScale = visual.width / endRect.width;
        const remaining = Math.min(1, Math.abs(1 - fromScale) * 4);
        finishHost = animateFullHost(fullHost, endRect, {
          durationMs: landed
            ? 0
            : Math.max(SETTLE_CORRECTION_MS, durationMs * remaining),
          fromRadius: restRadius / fromScale,
          fromScale,
          fromX: visual.left - endRect.left,
          fromY: visual.top - endRect.top,
          page: landed ? "none" : "attached",
          restRadius,
          startTime: null,
        });
      }
      return (finishOptions) => {
        finishHost(finishOptions);
        placeholder?.hide();
      };
    },
  };
}
