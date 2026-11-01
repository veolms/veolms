import { resolveMfaSetupView, type MfaGateUser } from "../auth/mfaGate";

/**
 * Where a sign-in that still owes its second step stands.
 *
 * Signing in creates the session before two-factor is answered: the browser
 * already holds its cookie, and the session can do nothing until the second
 * step is passed (or, for an account that must have two-factor and has none,
 * until it is set up). Such a session is only wanted while its owner is on
 * that step. Once they turn away from it, the sign-in has been called off
 * and the session has to go, or every page they open sends them back to the
 * step they declined.
 *
 * This keeps the little that is needed to tell "on the way to the step"
 * from "walked away from it":
 * - `started`: a sign-in in this tab has just answered "two-factor needed"
 *   and the tab is on its way to the step;
 * - `shown`: the step has been on screen in this tab;
 * - `none`: neither. A waiting session met in this state was left over from
 *   an earlier visit, or belongs to a sign-in going on in another tab.
 */
type Stage = "none" | "started" | "shown";

let stage: Stage = "none";

/**
 * Set while this tab shows the step, so other tabs can tell that a waiting
 * session is in use rather than left over. It is a time, not a flag, so a
 * tab that died without clearing it stops counting after a while.
 */
const STEP_OPEN_KEY = "veolms-mfa-step-open";
const STEP_OPEN_MAX_AGE_MS = 15 * 60 * 1000;

function writeStepOpen(open: boolean) {
  try {
    if (open) window.localStorage.setItem(STEP_OPEN_KEY, String(Date.now()));
    else window.localStorage.removeItem(STEP_OPEN_KEY);
  } catch {
    // Storage can be unavailable; other tabs then fall back to asking for
    // the step, which is what they did before any of this existed.
  }
}

function isStepOpenInAnotherTab(): boolean {
  try {
    const since = Number(window.localStorage.getItem(STEP_OPEN_KEY));
    return since > 0 && Date.now() - since < STEP_OPEN_MAX_AGE_MS;
  } catch {
    return false;
  }
}

/** A sign-in has just been answered: with the second step owed, or not. */
export function notePendingMfaLogin(mfaRequired: boolean) {
  stage = mfaRequired ? "started" : "none";
}

/**
 * The second step is on screen in this tab. Returns what to call when it
 * leaves the screen.
 */
export function notePendingMfaStepShown(): () => void {
  stage = "shown";
  writeStepOpen(true);
  const clear = () => writeStepOpen(false);
  // Leaving by closing the tab or loading another address never unmounts.
  window.addEventListener("pagehide", clear);
  return () => {
    window.removeEventListener("pagehide", clear);
    clear();
  };
}

/** The second step was passed, or the sign-in was called off. */
export function endPendingMfaLogin() {
  stage = "none";
}

/**
 * Whether a session still waiting on its second step, met somewhere other
 * than that step, is a sign-in its owner walked away from.
 *
 * A session waiting to be *verified* only ever comes from a sign-in, so met
 * cold it was abandoned, unless another tab has the step open right now. One
 * waiting to be *set up* can also be an account that was made an instructor
 * or admin while signed in; that one is still taken to the step, and counts
 * as abandoned only once this tab has shown the step and left it.
 */
export function isPendingMfaLoginAbandoned(
  user: MfaGateUser | null | undefined,
): boolean {
  const view = resolveMfaSetupView(user);
  if (view !== "verify" && view !== "enroll") return false;
  if (stage === "started") return false;
  if (stage === "shown") return true;
  return view === "verify" && !isStepOpenInAnotherTab();
}

/**
 * Whether a request refused for want of the second step should send the tab
 * to that step, given the session this tab last heard about (`undefined`
 * while it has not heard yet).
 *
 * It should when the tab believed the session was complete: the server knows
 * better. Otherwise the route guards already hold the same news and are
 * acting on it, and for an abandoned sign-in that means ending the session,
 * which a redirect to the step would undo.
 */
export function shouldFollowMfaRequired(
  knownUser: MfaGateUser | null | undefined,
): boolean {
  if (knownUser === undefined) return false;
  const view = resolveMfaSetupView(knownUser);
  if (view === "done") return true;
  if (view === "login") return false;
  return !isPendingMfaLoginAbandoned(knownUser);
}
