import type { AuthIdentifier } from "./authFlow";

/**
 * Where this tab last had a sign-in code sent, and when. The code in the
 * inbox stays good after the login pop-up is closed or the page reloaded,
 * so it is kept for the tab (sessionStorage): going back and pressing
 * Continue with the same address returns to the code step without another
 * send, and the wait before a new one counts from the first.
 *
 * Only the address and the time are kept, never the code, and they go when
 * the tab does or once the code has been used. A local record, not the
 * server's: it can be wrong when the code was used up elsewhere, in which
 * case the visitor asks for a new one on the code step.
 *
 * Held in memory as well, for a browser that refuses storage.
 *
 * Kept apart per flow (`SentCodeScope`): a sign-in code and the code that
 * confirms a mobile number before a purchase are different codes on the
 * server, so one must never stand in for the other.
 */

export type SentCodeScope = "login" | "phone-verification";

interface SentCode {
  destination: string;
  /** When it was sent (epoch milliseconds). */
  at: number;
  /** When the server stops accepting it (epoch milliseconds). */
  expiresAt: number;
}

/**
 * A code is not offered again in its last half minute: the visitor would
 * reach the code step with a code about to stop working.
 */
const EXPIRY_MARGIN_MS = 30_000;

/**
 * How long a code lasts when the server does not say (an API from before
 * it answered with `codeExpiresInSeconds`): the five minutes it used then.
 */
const FALLBACK_LIFETIME_SECONDS = 5 * 60;

const SENT_CODE_KEYS: Record<SentCodeScope, string> = {
  login: "veolms-login-code-sent",
  "phone-verification": "veolms-phone-verification-code-sent",
};

const memorySentCodes: Partial<Record<SentCodeScope, SentCode>> = {};

function readSentCode(scope: SentCodeScope): SentCode | null {
  const memorySentCode = memorySentCodes[scope] ?? null;
  try {
    const stored = window.sessionStorage.getItem(SENT_CODE_KEYS[scope]);
    if (!stored) return memorySentCode;
    const value = JSON.parse(stored) as Partial<SentCode>;
    return typeof value.destination === "string" &&
      typeof value.at === "number" &&
      typeof value.expiresAt === "number"
      ? {
          destination: value.destination,
          at: value.at,
          expiresAt: value.expiresAt,
        }
      : null;
  } catch {
    return memorySentCode;
  }
}

function resolveDestination(identifier: AuthIdentifier) {
  return identifier.method === "email" ? identifier.email : identifier.phoneNo;
}

/**
 * After a send: to where, and for how long the server says the code lasts
 * (`codeExpiresInSeconds` in its answer, from OTP_TTL_MINUTES).
 */
export function rememberCodeSent(
  identifier: AuthIdentifier,
  expiresInSeconds: number | undefined,
  scope: SentCodeScope = "login",
) {
  const at = Date.now();
  const sent: SentCode = {
    destination: resolveDestination(identifier),
    at,
    expiresAt: at + (expiresInSeconds ?? FALLBACK_LIFETIME_SECONDS) * 1000,
  };
  memorySentCodes[scope] = sent;
  try {
    window.sessionStorage.setItem(SENT_CODE_KEYS[scope], JSON.stringify(sent));
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
}

/** When this tab last had a code sent to that destination, if it did. */
export function codeSentAt(
  identifier: AuthIdentifier,
  scope: SentCodeScope = "login",
): number | null {
  const sent = readSentCode(scope);
  return sent !== null && sent.destination === resolveDestination(identifier)
    ? sent.at
    : null;
}

/**
 * Whether the code this tab last sent to that destination can still be
 * entered: going back from the code step and pressing Continue with the
 * same address then returns to the code step without sending another, and
 * the wait before a new one keeps counting from the first send.
 */
export function hasUsableSentCode(
  identifier: AuthIdentifier,
  scope: SentCodeScope = "login",
): boolean {
  const sent = readSentCode(scope);
  return (
    sent !== null &&
    sent.destination === resolveDestination(identifier) &&
    Date.now() < sent.expiresAt - EXPIRY_MARGIN_MS
  );
}

/** Once a code has been used it is no longer one the visitor can enter. */
export function forgetCodeSent(scope: SentCodeScope = "login") {
  delete memorySentCodes[scope];
  try {
    window.sessionStorage.removeItem(SENT_CODE_KEYS[scope]);
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
}
