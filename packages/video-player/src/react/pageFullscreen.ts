/**
 * Full screen drawn by the page, for a browser that cannot put an element
 * full screen. Safari on iPhone is the one that matters: all it offers is the
 * video's own system player, with Apple's controls (10-second skips where the
 * lesson's own buttons were) and none of the lesson's, a picture that did not
 * turn sideways, and a page that came back without its controls.
 *
 * Instead the player's shell covers the screen itself. It is raised into the
 * top layer as a manual popover, so it is drawn above everything and out of
 * reach of any transformed or clipped ancestor, as an element put full screen
 * by the browser is, and sized to the viewport.
 *
 * A page cannot turn an iPhone's screen (there is no orientation lock), so
 * while the phone is upright a landscape video is turned instead: the shell
 * is laid out as wide as the screen is tall and given a quarter turn
 * clockwise, the way the system player turns. A phone held sideways with
 * rotation unlocked turns the page itself, and the quarter turn comes off.
 * Code that reads a pointer position or a box inside the player goes through
 * `toPlayerPoint` / `toPlayerRect`, which undo the turn, and the shell
 * carries the screen's size as the player sees it
 * (`--player-screen-width` / `--player-screen-height`) for layouts that
 * follow the screen.
 */

interface WebkitFullscreenDocument extends Document {
  webkitFullscreenEnabled?: boolean;
}

interface WebkitFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

/** Dispatched on the document whenever the page full screen starts, ends or
 * turns. */
export const PAGE_FULLSCREEN_CHANGE_EVENT = "videoplayerpagefullscreenchange";

const PAGE_FULLSCREEN_ATTRIBUTE = "data-player-page-fullscreen";
const QUARTER_TURN_ATTRIBUTE = "data-player-quarter-turn";

// Set on the shell, all `!important`, so no class or style of its own (the
// minimize motion's translate, its rounded corners) shows through.
const SHELL_STYLE: Record<string, string> = {
  position: "fixed",
  top: "0",
  left: "0",
  right: "auto",
  bottom: "auto",
  margin: "0",
  padding: "0",
  border: "0",
  "border-radius": "0",
  "box-sizing": "border-box",
  "min-width": "0",
  "min-height": "0",
  "max-width": "none",
  "max-height": "none",
  overflow: "hidden",
  background: "#000",
  // A popover takes the system's text colour; the player inherits its own.
  color: "inherit",
  // Over the page where the top layer is missing (Safari before 17).
  "z-index": "2147483647",
  "transform-origin": "0 0",
  translate: "none",
  rotate: "none",
  scale: "none",
};
const LAYOUT_PROPERTIES = [
  "width",
  "height",
  "transform",
  "--player-screen-width",
  "--player-screen-height",
];

interface PageFullscreen {
  element: HTMLElement;
  contentLandscape: () => boolean;
  onExitRequest: () => void;
  saved: Array<[property: string, value: string, priority: string]>;
  turned: boolean;
  viewportWidth: number;
  dispose: () => void;
}

export interface PlayerRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

let active: PageFullscreen | null = null;

/** Whether the browser can put `element` itself full screen. */
export function canUseElementFullscreen(element: HTMLElement): boolean {
  if (typeof document === "undefined") return false;
  const target = element as WebkitFullscreenElement;
  if (!target.requestFullscreen && !target.webkitRequestFullscreen) {
    return false;
  }
  const enabled =
    document.fullscreenEnabled ??
    (document as WebkitFullscreenDocument).webkitFullscreenEnabled;
  return enabled !== false;
}

export function getPageFullscreenElement(): HTMLElement | null {
  return active?.element ?? null;
}

/** Whether the page full screen is giving the player a quarter turn. */
export function isPageFullscreenTurned(): boolean {
  return Boolean(active?.turned);
}

function notify(): void {
  document.dispatchEvent(new Event(PAGE_FULLSCREEN_CHANGE_EVENT));
}

/**
 * Whether an upright phone gives a landscape video a quarter turn. Off: the
 * turned picture sat inside the browser's upright bars (the page cannot hide
 * them), which looked less like full screen, not more; as on YouTube's
 * mobile site, the learner turns the phone and the page follows. The turn
 * is kept behind this switch, with the coordinate helpers that undo it.
 */
const QUARTER_TURN_ENABLED = false;

/** Sizes (and turns) the shell for the screen; returns whether it turned. */
function layout(state: PageFullscreen): boolean {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const turned =
    QUARTER_TURN_ENABLED && height > width && state.contentLandscape();
  const style = state.element.style;
  const set = (property: string, value: string) =>
    style.setProperty(property, value, "important");
  set("width", `${turned ? height : width}px`);
  set("height", `${turned ? width : height}px`);
  set("transform", turned ? `translateX(${width}px) rotate(90deg)` : "none");
  if (turned) {
    set("--player-screen-width", `${height}px`);
    set("--player-screen-height", `${width}px`);
  } else {
    style.removeProperty("--player-screen-width");
    style.removeProperty("--player-screen-height");
  }
  state.element.toggleAttribute(QUARTER_TURN_ATTRIBUTE, turned);
  state.viewportWidth = width;
  const changed = turned !== state.turned;
  state.turned = turned;
  return changed;
}

export function enterPageFullscreen(
  element: HTMLElement,
  options: { contentLandscape: () => boolean; onExitRequest: () => void },
): void {
  if (active?.element === element) return;
  if (active) exitPageFullscreen();

  const style = element.style;
  const saved = [...Object.keys(SHELL_STYLE), ...LAYOUT_PROPERTIES].map(
    (property): [string, string, string] => [
      property,
      style.getPropertyValue(property),
      style.getPropertyPriority(property),
    ],
  );
  const state: PageFullscreen = {
    element,
    ...options,
    saved,
    turned: false,
    viewportWidth: window.innerWidth,
    dispose: () => undefined,
  };
  active = state;

  element.setAttribute(PAGE_FULLSCREEN_ATTRIBUTE, "");
  for (const [property, value] of Object.entries(SHELL_STYLE)) {
    style.setProperty(property, value, "important");
  }
  layout(state);
  if (typeof element.showPopover === "function") {
    try {
      element.setAttribute("popover", "manual");
      element.showPopover();
    } catch {
      element.removeAttribute("popover");
    }
  }

  // The page under the player must not scroll with a finger that slides off
  // a control: on a phone that also pulls the browser's bars in and out.
  const rootStyle = document.documentElement.style;
  const rootOverflow: [string, string] = [
    rootStyle.getPropertyValue("overflow"),
    rootStyle.getPropertyPriority("overflow"),
  ];
  rootStyle.setProperty("overflow", "hidden", "important");

  const handleResize = () => {
    if (active !== state) return;
    if (layout(state)) notify();
  };
  // Escape leaves, as it leaves a browser full screen. A menu open in the
  // player takes it first (it stops it before it reaches the document).
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    state.onExitRequest();
  };
  window.addEventListener("resize", handleResize);
  window.addEventListener("orientationchange", handleResize);
  window.visualViewport?.addEventListener("resize", handleResize);
  document.addEventListener("keydown", handleKeyDown);
  state.dispose = () => {
    window.removeEventListener("resize", handleResize);
    window.removeEventListener("orientationchange", handleResize);
    window.visualViewport?.removeEventListener("resize", handleResize);
    document.removeEventListener("keydown", handleKeyDown);
    if (rootOverflow[0]) {
      rootStyle.setProperty("overflow", rootOverflow[0], rootOverflow[1]);
    } else {
      rootStyle.removeProperty("overflow");
    }
  };
  notify();
}

/**
 * Ends the page full screen; with `element`, only if that element has it.
 * Returns whether one was ended.
 */
export function exitPageFullscreen(element?: HTMLElement | null): boolean {
  const state = active;
  if (!state || (element && state.element !== element)) return false;
  active = null;
  state.dispose();
  const shell = state.element;
  if (shell.hasAttribute("popover")) {
    try {
      shell.hidePopover();
    } catch {
      // Already hidden (the shell left the page while it was up).
    }
    shell.removeAttribute("popover");
  }
  for (const [property, value, priority] of state.saved) {
    if (value) shell.style.setProperty(property, value, priority);
    else shell.style.removeProperty(property);
  }
  shell.removeAttribute(PAGE_FULLSCREEN_ATTRIBUTE);
  shell.removeAttribute(QUARTER_TURN_ATTRIBUTE);
  notify();
  return true;
}

function turnedAround(within: Element | null | undefined) {
  const state = active;
  if (!state?.turned) return null;
  if (within && !state.element.contains(within)) return null;
  return state;
}

/**
 * A pointer position in the player's own axes: the client position, unless
 * the player has a quarter turn (and `within` is inside it).
 */
export function toPlayerPoint(
  clientX: number,
  clientY: number,
  within?: Element | null,
): { x: number; y: number } {
  const state = turnedAround(within);
  if (!state) return { x: clientX, y: clientY };
  return { x: clientY, y: state.viewportWidth - clientX };
}

/** A client box (`getBoundingClientRect`) in the player's own axes. */
export function toPlayerRect(
  rect: DOMRectReadOnly,
  within?: Element | null,
): PlayerRect {
  const state = turnedAround(within);
  if (!state) {
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  }
  const viewportWidth = state.viewportWidth;
  return {
    left: rect.top,
    top: viewportWidth - rect.right,
    right: rect.bottom,
    bottom: viewportWidth - rect.left,
    width: rect.height,
    height: rect.width,
  };
}

/** The box of `element` in the player's own axes. */
export function playerRectOf(element: Element): PlayerRect {
  return toPlayerRect(element.getBoundingClientRect(), element);
}
