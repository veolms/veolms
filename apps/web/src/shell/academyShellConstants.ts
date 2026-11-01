import logoDarkSvg from "../assets/procodrr-logo-dark.svg?raw";

/**
 * What a pointer or the keyboard is on when Settings or Discussions is about
 * to be opened (the menu's own items are buttons named for their page).
 */
export const SETTINGS_ENTRY_SELECTOR =
  '[data-settings-quick-trigger], a[href="/settings"], a[href^="/settings/"], a[href="/discussions"], a[href^="/discussions/"], a[href^="/discussions?"], button[aria-label="Discussions"]';

export const procodrrLogoSvg = logoDarkSvg.replace(
  /fill="black"/g,
  'fill="currentColor"',
);

export const SIDEBAR_COLLAPSED_WIDTH = 76;
export const SIDEBAR_CONTENT_REVEAL_DISTANCE = 24;
export const SIDEBAR_GESTURE_ACTIVATION_DISTANCE = 12;
export const SIDEBAR_GESTURE_DIRECTION_RATIO = 1.2;
export const SIDEBAR_FLING_MIN_DISTANCE = 24;
export const SIDEBAR_FLING_VELOCITY = 0.3;
export const SIDEBAR_HIDDEN_OFFSET_EXTRA = 18;
export const SIDEBAR_REVEAL_COMMIT_THRESHOLD = 0.4;
export const APPEARANCE_LONG_PRESS_DURATION = 500;
export const APPEARANCE_LONG_PRESS_MOVE_TOLERANCE = 10;
export const MOBILE_NAV_HIDE_SCROLL_THRESHOLD = 56;
export const MOBILE_NAV_SHOW_SCROLL_THRESHOLD = 18;
// How long a scroll still counts as the visitor's after the finger leaves
// the screen or a scrolling key is pressed (a fling glides on), and how much
// longer each further scroll step or wheel turn keeps it so.
export const MOBILE_NAV_USER_SCROLL_GLIDE_MS = 1200;
export const MOBILE_NAV_USER_SCROLL_STEP_MS = 250;
export const MOBILE_NAV_PLAYER_SELECTOR = "[data-learning-persistent-player]";
export const MOBILE_NAV_TOP_GUARD = 12;
export const MOBILE_DRAWER_INITIAL_SNAP_POINT = 0.82;

export const SIDEBAR_SWIPE_EXCLUSION_SELECTOR = [
  ".sidebar-resize-handle",
  ".learning-curriculum__resize-rail",
  ".app-slider",
  'input[type="range"]',
  '[role="slider"]',
  "progress",
  '[role="progressbar"]',
  ".course-progress",
  ".learning-progress-track",
  ".home-resume-progress",
  ".home-mini-progress",
  ".learning-card-progress",
  ".learning-curriculum__progress-track",
  "[data-player-control]",
  "[data-player-menu]",
  "[data-sidebar-swipe-ignore]",
].join(",");

/** At this sidebar width or narrower, a drag stacks the dock vertically. */
export const SIDEBAR_DOCK_VERTICAL_MAX_WIDTH = 180;
/**
 * How long the pointer rests in a drag before React is told the width the
 * drag has reached (see previewSidebarResizeWidth).
 */
export const SIDEBAR_RESIZE_STATE_SYNC_MS = 140;
/** How close two presses on the brand must be to count as one double tap. */
export const SIDEBAR_BRAND_DOUBLE_TAP_MS = 450;
export const SIDEBAR_BRAND_DOUBLE_TAP_DISTANCE = 40;
