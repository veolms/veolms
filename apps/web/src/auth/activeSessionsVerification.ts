const ACTIVE_SESSIONS_VERIFICATION_KEY = "veolms.activeSessionsVerified";

export interface ActiveSessionsVerificationState {
  userId: string;
  verifiedUntil: string;
}

/**
 * Returns the current tab's sessionStorage, or null when sessionStorage is
 * unavailable (SSR, storage blocked by the browser, or private-mode quota).
 * Accessing window.sessionStorage itself can throw, so this is guarded.
 */
function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch (error) {
    console.warn("sessionStorage is unavailable.", error);
    return null;
  }
}

export function clearActiveSessionsVerification(): void {
  try {
    getStorage()?.removeItem(ACTIVE_SESSIONS_VERIFICATION_KEY);
  } catch (error) {
    console.warn("Could not clear active-sessions verification.", error);
  }
}

export function readActiveSessionsVerification(
  userId: string,
  now = Date.now(),
): ActiveSessionsVerificationState | null {
  let saved: string | null;
  try {
    saved = getStorage()?.getItem(ACTIVE_SESSIONS_VERIFICATION_KEY) ?? null;
  } catch (error) {
    console.warn("Could not read active-sessions verification.", error);
    return null;
  }

  if (!saved) return null;

  let state: unknown;
  try {
    state = JSON.parse(saved);
  } catch {
    clearActiveSessionsVerification();
    return null;
  }

  if (
    typeof state !== "object" ||
    state === null ||
    !("userId" in state) ||
    typeof state.userId !== "string" ||
    !("verifiedUntil" in state) ||
    typeof state.verifiedUntil !== "string" ||
    state.userId !== userId ||
    !Number.isFinite(Date.parse(state.verifiedUntil)) ||
    Date.parse(state.verifiedUntil) <= now
  ) {
    clearActiveSessionsVerification();
    return null;
  }

  return {
    userId: state.userId,
    verifiedUntil: state.verifiedUntil,
  };
}

export function saveActiveSessionsVerification(
  state: ActiveSessionsVerificationState,
): void {
  try {
    getStorage()?.setItem(
      ACTIVE_SESSIONS_VERIFICATION_KEY,
      JSON.stringify(state),
    );
  } catch (error) {
    console.warn("Could not save active-sessions verification.", error);
  }
}
