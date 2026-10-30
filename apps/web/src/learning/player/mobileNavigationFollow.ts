import type { LessonPlayerMinimizeGestureState } from "./useLessonPlayerMinimizeGesture";

/**
 * How the phone's bottom menu and the lesson player keep step.
 *
 * The bottom menu (`.mobile-bottom-nav`, owned by the page shell) hides
 * while the page is scrolled down and comes back when it is scrolled up.
 * The mini player rests on top of it, so:
 *
 * - while the player is being minimized, a hidden menu comes up with the
 *   swipe, as far as the swipe has gone, and goes back down if the swipe is
 *   taken back (`syncMobileNavigationWithMinimizeGesture`);
 * - where the mini player rests is worked out from where the menu stands
 *   once it has arrived, not from where it is drawn on its way there
 *   (`getMobileNavigationRestingTop`), and the mini player is moved to that
 *   place whenever the menu hides or shows
 *   (`observeMobileNavigationShown`).
 *
 * The shell is told to show its menu through an event, because the menu's
 * hidden state is the shell's own.
 *
 * Nothing is done to the menu when the mini player is expanded again: the
 * shell shows its menu whenever the lesson page opens, so a menu sent down
 * with the expand only came straight back up at the end of it.
 */
const NAVIGATION_SELECTOR = ".mobile-bottom-nav";
const SCROLL_HIDDEN_CLASS = "is-scroll-hidden";
const FULL_PLAYER_SELECTOR = ".learning-persistent-player--full";

export const MOBILE_NAVIGATION_REVEAL_EVENT = "veolms-mobile-navigation-reveal";

/** As long as the minimize motion, and eased the same way. */
const SETTLE_MS = 500;
const SETTLE_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

/** The bottom menu, when the page has one laid out (a phone). */
export function getMobileNavigation(): HTMLElement | null {
  const navigation = document.querySelector<HTMLElement>(NAVIGATION_SELECTOR);
  return navigation && navigation.offsetHeight > 0 ? navigation : null;
}

/**
 * Whether the menu is where the mini player should rest on it: shown, on
 * its way up with a minimize, or about to be shown because the full player
 * is still on the page and minimizing it brings the menu back.
 */
export function isMobileNavigationUnderMiniPlayer(navigation: HTMLElement) {
  return (
    !navigation.classList.contains(SCROLL_HIDDEN_CLASS) ||
    navigation.dataset.minimizeReveal !== undefined ||
    document.querySelector(FULL_PLAYER_SELECTOR) !== null
  );
}

/**
 * The menu's top edge where it stands once shown. Its drawn position is no
 * use while it slides in or out: it would put the mini player wherever the
 * menu happened to be in that frame.
 */
export function getMobileNavigationRestingTop(navigation: HTMLElement) {
  return navigation.offsetTop;
}

let clearTimer: number | undefined;

function releaseNavigation(navigation: HTMLElement) {
  window.clearTimeout(clearTimer);
  clearTimer = undefined;
  delete navigation.dataset.minimizeReveal;
  navigation.style.removeProperty("transition");
  navigation.style.removeProperty("visibility");
  navigation.style.removeProperty("opacity");
  navigation.style.removeProperty("transform");
}

/**
 * Brings a hidden bottom menu up with a minimize, by as much as the
 * minimize has progressed: under a finger it follows every frame, and when
 * the finger lets go it eases the rest of the way (up if the player is
 * going to its mini window, back down if it is going back to full size).
 * A menu that was already showing is left alone.
 */
export function syncMobileNavigationWithMinimizeGesture(
  state: LessonPlayerMinimizeGestureState,
) {
  const navigation = getMobileNavigation();
  if (!navigation) return;
  const following = navigation.dataset.minimizeReveal !== undefined;

  if (state.phase === "idle") {
    if (following) releaseNavigation(navigation);
    return;
  }
  if (!following && !navigation.classList.contains(SCROLL_HIDDEN_CLASS)) {
    return;
  }

  navigation.dataset.minimizeReveal = "";
  const shown = Math.min(1, Math.max(0, state.progress));
  const settling = state.phase !== "dragging";
  navigation.style.transition = settling
    ? `transform ${SETTLE_MS}ms ${SETTLE_EASING}, opacity ${SETTLE_MS}ms ${SETTLE_EASING}`
    : "none";
  navigation.style.visibility = "visible";
  navigation.style.opacity = String(shown);
  navigation.style.transform = `translate3d(0, calc((100% + 4px) * ${(1 - shown).toFixed(4)}), 0)`;

  window.clearTimeout(clearTimer);
  clearTimer = undefined;
  if (!settling) return;

  if (state.phase === "settling-mini") {
    // The shell now holds the menu shown; these styles only carry it there.
    window.dispatchEvent(new Event(MOBILE_NAVIGATION_REVEAL_EVENT));
  }
  // The page may be left before the gesture reports that it has come to
  // rest, so the menu is given back to the shell's own rules by the clock.
  clearTimer = window.setTimeout(
    () => releaseNavigation(navigation),
    SETTLE_MS + 80,
  );
}

/**
 * Calls back whenever the bottom menu goes from hidden to shown or back.
 * Returns what stops the watching.
 */
export function observeMobileNavigationShown(onChange: () => void) {
  const navigation = document.querySelector<HTMLElement>(NAVIGATION_SELECTOR);
  if (!navigation) return () => undefined;
  let hidden = navigation.classList.contains(SCROLL_HIDDEN_CLASS);
  const observer = new MutationObserver(() => {
    const nextHidden = navigation.classList.contains(SCROLL_HIDDEN_CLASS);
    if (nextHidden === hidden) return;
    hidden = nextHidden;
    onChange();
  });
  observer.observe(navigation, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}
