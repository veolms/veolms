const ACTIVE_SESSIONS_VERIFICATION_KEY = "veolms.activeSessionsVerified";

export interface ActiveSessionsVerificationState {
  userId: string;
  verifiedUntil: string;
}

export function clearActiveSessionsVerification(): void {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(ACTIVE_SESSIONS_VERIFICATION_KEY);
  }
}

export function readActiveSessionsVerification(
  userId: string,
  now = Date.now(),
): ActiveSessionsVerificationState | null {
  if (typeof window === "undefined") return null;

  const saved = window.sessionStorage.getItem(ACTIVE_SESSIONS_VERIFICATION_KEY);
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
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(
      ACTIVE_SESSIONS_VERIFICATION_KEY,
      JSON.stringify(state),
    );
  }
}
