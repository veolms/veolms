import { useSyncExternalStore } from "react";

/**
 * The Google account this browser last signed in with, so the login pop-up
 * can offer it by name ("Continue as Anurag") and ask Google for that
 * account directly (a `login_hint`, which also lets a browser with several
 * Google accounts sign in without a window). Kept through a sign-out, like
 * the "last used" offer on most sites; it holds the account's name, address
 * and a hosted picture, nothing else. Signing in with another Google
 * account (the arrow on the button) puts that one in its place.
 *
 * Which way the visitor last signed in (Google, or a code by email or text)
 * is kept beside it, for the "Last used" mark.
 */

export interface LastGoogleAccount {
  email: string;
  name: string;
  /** A hosted picture address; pictures embedded as data are not kept. */
  avatarUrl?: string;
}

export type SignInMethod = "google" | "code";

const LAST_GOOGLE_ACCOUNT_KEY = "veolms-last-google-account";
const LAST_SIGN_IN_METHOD_KEY = "veolms-last-sign-in-method";
const MAX_AVATAR_URL_LENGTH = 2_000;

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readLastGoogleAccount(): LastGoogleAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(LAST_GOOGLE_ACCOUNT_KEY) ?? "null",
    ) as Record<string, unknown> | null;
    const email = readText(saved?.email);
    if (!email) return null;
    const avatarUrl = readText(saved?.avatarUrl);
    return {
      email,
      name: readText(saved?.name) || email.split("@")[0] || email,
      ...(avatarUrl ? { avatarUrl } : {}),
    };
  } catch {
    return null;
  }
}

export function readLastSignInMethod(): SignInMethod | null {
  if (typeof window === "undefined") return null;
  try {
    const method = window.localStorage.getItem(LAST_SIGN_IN_METHOD_KEY);
    return method === "google" || method === "code" ? method : null;
  } catch {
    return null;
  }
}

/** After any Google sign-in: this account, and Google as the way in. */
export function rememberGoogleSignIn(user: {
  email?: string | null;
  displayName?: string | null;
  avatarDataUrl?: string | null;
}): void {
  const email = readText(user.email);
  if (!email || typeof window === "undefined") return;
  const avatar = readText(user.avatarDataUrl);
  const avatarUrl =
    /^https?:\/\//i.test(avatar) && avatar.length <= MAX_AVATAR_URL_LENGTH
      ? avatar
      : undefined;
  try {
    window.localStorage.setItem(
      LAST_GOOGLE_ACCOUNT_KEY,
      JSON.stringify({
        email,
        name: readText(user.displayName),
        ...(avatarUrl ? { avatarUrl } : {}),
      }),
    );
    window.localStorage.setItem(LAST_SIGN_IN_METHOD_KEY, "google");
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
}

/** After a sign-in with a code: the Google account stays on offer. */
export function rememberCodeSignIn(): void {
  try {
    window.localStorage.setItem(LAST_SIGN_IN_METHOD_KEY, "code");
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
}

const subscribeToNothing = () => () => {};
let cachedRaw: string | null | undefined;
let cachedAccount: LastGoogleAccount | null = null;

function readCachedLastGoogleAccount(): LastGoogleAccount | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(LAST_GOOGLE_ACCOUNT_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedAccount = readLastGoogleAccount();
  }
  return cachedAccount;
}

/**
 * The account to offer, read in the browser only: a page built ahead of
 * time has none, and the first render in the browser must match it.
 */
export function useLastGoogleAccount(): {
  account: LastGoogleAccount | null;
  lastUsed: boolean;
} {
  const account = useSyncExternalStore(
    subscribeToNothing,
    readCachedLastGoogleAccount,
    () => null,
  );
  const method = useSyncExternalStore(
    subscribeToNothing,
    readLastSignInMethod,
    () => null,
  );
  return { account, lastUsed: account !== null && method === "google" };
}
