import type { OauthProvider } from "@veolms/contracts";
import {
  OAUTH_CALLBACK_PATH_TEST,
  OAUTH_POPUP_MARK_STORAGE_KEY,
  OAUTH_POPUP_WINDOW_NAME,
} from "./oauthPopup";

export const OAUTH_PROVIDER_STORAGE_KEY = "veolms_oauth_provider";
export const OAUTH_RETURN_TO_STORAGE_KEY = "veolms_oauth_return_to";

export function isOauthProvider(value: string | null): value is OauthProvider {
  return value === "google" || value === "github";
}

/**
 * `keepSharedCopy` when this tab only stops waiting (its sign-in window
 * closed): on Android that is also what Chrome does when it hands the
 * provider's answer to the installed app, which still needs the copy and
 * takes seconds to start.
 */
export function clearOauthHandoff({
  keepSharedCopy = false,
}: { keepSharedCopy?: boolean } = {}): void {
  if (typeof window === "undefined") return;

  window.sessionStorage.removeItem(OAUTH_PROVIDER_STORAGE_KEY);
  window.sessionStorage.removeItem(OAUTH_RETURN_TO_STORAGE_KEY);
  window.sessionStorage.removeItem(OAUTH_DIALOG_PAGE_STORAGE_KEY);
  window.sessionStorage.removeItem(OAUTH_REDIRECT_RESULT_STORAGE_KEY);
  if (keepSharedCopy) return;
  try {
    window.localStorage.removeItem(OAUTH_SHARED_HANDOFF_STORAGE_KEY);
  } catch {
    // Storage blocked: nothing was kept there.
  }
}

// The provider's answer can come back in a window that has none of this
// tab's session storage. On Android, when the site is installed as an app,
// Chrome hands the provider's redirect to /auth/callback (it follows a tap
// on Google's page) to the installed app instead of the sign-in window. The
// app shares Chrome's cookies, so the API's state check still passes, and
// its local storage, where a copy of the hand-off is kept for it.
const OAUTH_SHARED_HANDOFF_STORAGE_KEY = "veolms_oauth_handoff";
/** Older copies belong to a sign-in that was given up on. */
const OAUTH_SHARED_HANDOFF_MAX_AGE_MS = 15 * 60 * 1000;

/** Kept as the sign-in starts, for whichever window the answer reaches. */
export function rememberOauthHandoff(
  provider: OauthProvider,
  returnTo: string | null | undefined,
): void {
  window.sessionStorage.setItem(OAUTH_PROVIDER_STORAGE_KEY, provider);
  if (returnTo) {
    window.sessionStorage.setItem(OAUTH_RETURN_TO_STORAGE_KEY, returnTo);
  } else {
    window.sessionStorage.removeItem(OAUTH_RETURN_TO_STORAGE_KEY);
  }
  try {
    window.localStorage.setItem(
      OAUTH_SHARED_HANDOFF_STORAGE_KEY,
      JSON.stringify({ provider, returnTo: returnTo ?? null, at: Date.now() }),
    );
  } catch {
    // Storage blocked: only this tab and its window can finish.
  }
}

/**
 * The provider and the page to return to, for the callback: this tab's own
 * copy, or the shared one when the answer arrived in another window.
 */
export function readOauthHandoff(): {
  provider: OauthProvider | null;
  returnTo: string | null;
} {
  const provider = window.sessionStorage.getItem(OAUTH_PROVIDER_STORAGE_KEY);
  if (isOauthProvider(provider)) {
    return {
      provider,
      returnTo: window.sessionStorage.getItem(OAUTH_RETURN_TO_STORAGE_KEY),
    };
  }
  try {
    const shared = JSON.parse(
      window.localStorage.getItem(OAUTH_SHARED_HANDOFF_STORAGE_KEY) ?? "null",
    ) as { provider?: unknown; returnTo?: unknown; at?: unknown } | null;
    if (
      shared &&
      typeof shared.provider === "string" &&
      isOauthProvider(shared.provider) &&
      typeof shared.at === "number" &&
      Date.now() - shared.at < OAUTH_SHARED_HANDOFF_MAX_AGE_MS
    ) {
      return {
        provider: shared.provider,
        returnTo: typeof shared.returnTo === "string" ? shared.returnTo : null,
      };
    }
  } catch {
    // Unreadable or blocked: no provider.
  }
  return { provider: null, returnTo: null };
}

// When the sign-in window is blocked the whole tab goes to the provider.
// The page the login pop-up was open over is kept here, so the provider's
// answer is taken back to it, with the pop-up open, instead of to a
// separate callback page; the answer waits under the second key.
const OAUTH_DIALOG_PAGE_STORAGE_KEY = "veolms_oauth_dialog_page";
export const OAUTH_REDIRECT_RESULT_STORAGE_KEY = "veolms_oauth_redirect_result";
const OAUTH_RETURN_ATTRIBUTE = "data-oauth-return";

export function rememberOauthDialogPage(): void {
  const { pathname, search, hash } = window.location;
  window.sessionStorage.setItem(
    OAUTH_DIALOG_PAGE_STORAGE_KEY,
    `${pathname}${search}${hash}`,
  );
}

/**
 * Runs in the head of every document. On /auth/callback after a full-tab
 * sign-in that started in the login pop-up, it puts the provider's answer
 * aside and replaces the address with the page the pop-up was open over,
 * before anything of the callback page is drawn (its content is hidden
 * meanwhile). That page loads its own document, opens the pop-up, and the
 * pop-up finishes signing in. A sign-in window or hidden frame (see
 * oauthPopup) is left to its own script.
 */
export function getOauthDialogReturnScript(): string {
  return `(function(){try{if(!${OAUTH_CALLBACK_PATH_TEST}||window.name===${JSON.stringify(OAUTH_POPUP_WINDOW_NAME)}||sessionStorage.getItem(${JSON.stringify(OAUTH_POPUP_MARK_STORAGE_KEY)})==="1"||window.parent!==window)return;var page=sessionStorage.getItem(${JSON.stringify(OAUTH_DIALOG_PAGE_STORAGE_KEY)});sessionStorage.removeItem(${JSON.stringify(OAUTH_DIALOG_PAGE_STORAGE_KEY)});if(!page||page.charAt(0)!=="/"||page.charAt(1)==="/"||page.charAt(1)===${JSON.stringify("\\")})return;sessionStorage.setItem(${JSON.stringify(OAUTH_REDIRECT_RESULT_STORAGE_KEY)},location.search);document.documentElement.setAttribute(${JSON.stringify(OAUTH_RETURN_ATTRIBUTE)},"");var style=document.createElement("style");style.textContent="html[${OAUTH_RETURN_ATTRIBUTE}] #root{visibility:hidden}";document.head.appendChild(style);location.replace(page);}catch(e){}})();`;
}

/** True on a callback document the script above is replacing. */
export function isReturningToOauthDialog(): boolean {
  return document.documentElement.hasAttribute(OAUTH_RETURN_ATTRIBUTE);
}

/**
 * The provider's answer put aside above, with the provider it is from.
 * Read on the pop-up's first render, so it opens already saying it is
 * signing in; taken with `clearOauthRedirectResult` once acted on.
 */
export function peekOauthRedirectResult(): {
  provider: OauthProvider;
  params: URLSearchParams;
} | null {
  if (typeof window === "undefined") return null;
  const search = window.sessionStorage.getItem(
    OAUTH_REDIRECT_RESULT_STORAGE_KEY,
  );
  const provider = window.sessionStorage.getItem(OAUTH_PROVIDER_STORAGE_KEY);
  if (search === null || !isOauthProvider(provider)) return null;
  return { provider, params: new URLSearchParams(search) };
}

export function clearOauthRedirectResult(): void {
  window.sessionStorage.removeItem(OAUTH_REDIRECT_RESULT_STORAGE_KEY);
}
