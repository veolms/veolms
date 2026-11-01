/**
 * Which home the account last signed in on this browser was shown, when it
 * is not the usual one (a learner's home with their courses):
 *
 * - "dashboard" and "admin-dashboard": someone who runs courses, in their
 *   Instructor or Admin view. Their home is the dashboard, and the menu
 *   beside it is that view's.
 * - "new-learner": a learner with no courses yet. Their home is the guest
 *   home with a greeting.
 *
 * Which of the three it will be is only known once the session, the saved
 * view and the learner's courses have answered. Putting up the wrong one
 * meanwhile shows one home and then swaps it for another, so the browser
 * remembers the answer. A script in the document's head copies it onto the
 * root element before anything is drawn, and until the answers are in the
 * home is chosen from there: by the page's own classes for a page built
 * ahead of time, and by the shell once it is running.
 *
 * It says nothing about who the account is, it is only acted on while the
 * browser is signed in, and it is forgotten when the session ends.
 */
export type HomeHint = "dashboard" | "admin-dashboard" | "new-learner";

/** Whether the hint says the account's home is the dashboard. */
export const isDashboardHomeHint = (hint: HomeHint | null) =>
  hint === "dashboard" || hint === "admin-dashboard";

const HOME_HINT_KEY = "veolms-home-hint";
const HOME_HINT_ATTRIBUTE = "data-home-hint";

/**
 * How long the dashboard's greeting and the name after it were, in the
 * heading's own font size. The heading wraps the name onto a second line
 * when the two do not fit side by side, which makes it taller; what stands
 * in for it has to wrap at the same width, and cannot know the name.
 */
const DASHBOARD_TITLE_KEY = "veolms-dashboard-title";
const GREETING_WIDTH_PROPERTY = "--dashboard-greeting-width";
const NAME_WIDTH_PROPERTY = "--dashboard-name-width";

const isHomeHint = (value: unknown): value is HomeHint =>
  value === "dashboard" ||
  value === "admin-dashboard" ||
  value === "new-learner";

/** Runs from the document's head (see `root.tsx`). */
export const getHomeHintBootstrapScript = () =>
  `(()=>{try{var r=document.documentElement,h=localStorage.getItem("${HOME_HINT_KEY}");if(h==="dashboard"||h==="admin-dashboard"||h==="new-learner")r.setAttribute("${HOME_HINT_ATTRIBUTE}",h);var t=(localStorage.getItem("${DASHBOARD_TITLE_KEY}")||"").split(","),g=parseFloat(t[0]),n=parseFloat(t[1]);if(g>0&&n>0){r.style.setProperty("${GREETING_WIDTH_PROPERTY}",g+"em");r.style.setProperty("${NAME_WIDTH_PROPERTY}",n+"em")}}catch{}})();`;

export function readHomeHint(): HomeHint | null {
  if (typeof document === "undefined") return null;
  const hint = document.documentElement.getAttribute(HOME_HINT_ATTRIBUTE);
  return isHomeHint(hint) ? hint : null;
}

/** Keeps which home this was for the next time the page is opened. */
export function rememberHomeHint(hint: HomeHint | null) {
  if (typeof document === "undefined") return;
  if (hint) document.documentElement.setAttribute(HOME_HINT_ATTRIBUTE, hint);
  else document.documentElement.removeAttribute(HOME_HINT_ATTRIBUTE);
  try {
    if (hint) window.localStorage.setItem(HOME_HINT_KEY, hint);
    else window.localStorage.removeItem(HOME_HINT_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
}

/** Both widths in em of the dashboard heading's font size. */
export function rememberDashboardTitle(
  greetingWidth: number,
  nameWidth: number,
) {
  if (!(greetingWidth > 0) || !(nameWidth > 0)) return;
  const greeting = greetingWidth.toFixed(3);
  const name = nameWidth.toFixed(3);
  const root = document.documentElement;
  root.style.setProperty(GREETING_WIDTH_PROPERTY, `${greeting}em`);
  root.style.setProperty(NAME_WIDTH_PROPERTY, `${name}em`);
  try {
    window.localStorage.setItem(DASHBOARD_TITLE_KEY, `${greeting},${name}`);
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
}

/** The session has ended: nothing is remembered about its home. */
export function forgetHomeHints() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.removeAttribute(HOME_HINT_ATTRIBUTE);
  root.style.removeProperty(GREETING_WIDTH_PROPERTY);
  root.style.removeProperty(NAME_WIDTH_PROPERTY);
  try {
    window.localStorage.removeItem(HOME_HINT_KEY);
    window.localStorage.removeItem(DASHBOARD_TITLE_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
}
