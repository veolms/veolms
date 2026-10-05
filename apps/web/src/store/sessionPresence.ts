/**
 * A non-identifying "this browser was signed in last time" flag. The
 * prerendered documents carry guest content, so without it a signed-in
 * reload paints the guest screen until `/auth/me` answers. The flag holds no
 * user data (the session cookie stays the source of truth); it only decides
 * which placeholder the first paint shows.
 */
export const SESSION_PRESENCE_KEY = "veolms-session-present";
const AUTH_IDENTITY_HINT_KEY = "veolms-auth-identity";

export function readSessionPresence(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.localStorage.getItem(SESSION_PRESENCE_KEY) === "1" ||
      Boolean(window.sessionStorage.getItem(AUTH_IDENTITY_HINT_KEY))
    );
  } catch {
    return false;
  }
}

export function writeSessionPresence(present: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (present) window.localStorage.setItem(SESSION_PRESENCE_KEY, "1");
    else window.localStorage.removeItem(SESSION_PRESENCE_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
  if (present) document.documentElement.dataset.sessionHint = "signed-in";
  else delete document.documentElement.dataset.sessionHint;
}

// Runs from the document head so the attribute is set before the prerendered
// body is parsed; styles keyed on it apply to the very first paint.
export const getSessionPresenceBootstrapScript = () =>
  `(()=>{try{if(localStorage.getItem("${SESSION_PRESENCE_KEY}")==="1"||sessionStorage.getItem("${AUTH_IDENTITY_HINT_KEY}"))document.documentElement.dataset.sessionHint="signed-in"}catch{}})();`;
