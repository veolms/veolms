// Social sign-in in a small window over the page, so the login pop-up and
// the page behind it stay put. The provider sends that window back to
// /auth/callback; a script in the document head (below) hands the address
// to the page that opened it and closes it before the app has loaded. The
// page then exchanges the code itself, as the callback route would.
//
// When the provider would answer without asking the visitor anything (one
// Google account that has already agreed), the same question is put in a
// hidden frame instead (`askOauthProviderSilently`), so no window flashes
// open and shut. The frame comes back to /auth/callback too and hands its
// answer over the same way, to the page that holds it.
//
// The window is known on /auth/callback by its name, or by a mark in its
// own session storage. Google's later sign-in pages (the account chooser
// once an account is picked, consent) enforce Cross-Origin-Opener-Policy,
// which moves the window into a new browsing context group: its name is
// cleared and `opener` is gone. Session storage stays with the window, so
// the mark still says what it is, and the channel still reaches the page.

export const OAUTH_POPUP_WINDOW_NAME = "veolms-oauth";
export const OAUTH_POPUP_MARK_STORAGE_KEY = "veolms_oauth_popup_window";
/**
 * Head-script test for the callback address. The deployed site sends
 * `/auth/callback` on to `/auth/callback/` (trailing slash) before the page
 * loads, so both forms count; the dev server keeps the first.
 */
export const OAUTH_CALLBACK_PATH_TEST =
  '(location.pathname==="/auth/callback"||location.pathname==="/auth/callback/")';
const OAUTH_POPUP_CHANNEL = "veolms-oauth";
/** Followed by an id of its own, so each frame's answer is told apart. */
const OAUTH_SILENT_FRAME_PREFIX = "veolms-oauth-silent:";
const RESULT_MESSAGE = "veolms-oauth-result";
const ACK_MESSAGE = "veolms-oauth-ack";
/** How long the window waits for the page to take the code over. */
const HANDOFF_TIMEOUT_MS = 3000;
/** How long a hidden frame may take to bring the provider's answer back. */
const SILENT_TIMEOUT_MS = 5000;

declare global {
  interface Window {
    /**
     * Set on /auth/callback in a sign-in window or hidden frame: true once
     * the page that opened it has the answer, false when a window's page
     * never answered and the window finishes signing in itself. A hidden
     * frame never does that; for it this is always true.
     */
    __VEO_OAUTH_POPUP__?: Promise<boolean>;
  }
}

/**
 * Runs in the head of every document and does nothing outside a sign-in
 * window (its name or mark) or hidden frame on /auth/callback; the mark is
 * taken as soon as it is read. A window posts the address on a
 * channel (it reaches the page even if the provider's pages cut the window
 * off from its opener) and to its opener, and closes once either answers. A
 * frame posts it to the page it is in. Each message says who sent it.
 */
export function getOauthPopupHandoffScript(): string {
  return `(function(){try{if(!${OAUTH_CALLBACK_PATH_TEST})return;var name=window.name,silent=name.indexOf(${JSON.stringify(OAUTH_SILENT_FRAME_PREFIX)})===0&&window.parent!==window;if(!silent&&(window.parent!==window||(name!==${JSON.stringify(OAUTH_POPUP_WINDOW_NAME)}&&sessionStorage.getItem(${JSON.stringify(OAUTH_POPUP_MARK_STORAGE_KEY)})!=="1")))return;if(!silent)sessionStorage.removeItem(${JSON.stringify(OAUTH_POPUP_MARK_STORAGE_KEY)});var done=false,channel=null;window.__VEO_OAUTH_POPUP__=new Promise(function(resolve){function finish(handedOff){if(done)return;done=true;if(channel)channel.close();window.removeEventListener("message",onMessage);if(silent){resolve(true);}else if(handedOff){resolve(true);window.close();}else{window.name="";resolve(false);}}function onAck(data){if(data&&data.type===${JSON.stringify(ACK_MESSAGE)})finish(true);}function onMessage(event){if(event.origin===location.origin)onAck(event.data);}var message={type:${JSON.stringify(RESULT_MESSAGE)},search:location.search,from:silent?name:${JSON.stringify(OAUTH_POPUP_WINDOW_NAME)}};window.addEventListener("message",onMessage);if(silent){window.parent.postMessage(message,location.origin);}else{if(typeof BroadcastChannel==="function"){channel=new BroadcastChannel(${JSON.stringify(OAUTH_POPUP_CHANNEL)});channel.onmessage=function(event){onAck(event.data);};channel.postMessage(message);}if(window.opener&&window.opener!==window){try{window.opener.postMessage(message,location.origin);}catch(e){}}}setTimeout(function(){finish(false);},${HANDOFF_TIMEOUT_MS});});}catch(e){}})();`;
}

/**
 * Asks the provider out of sight to answer at once, without showing the
 * visitor anything (`prompt=none`). Resolves with its answer's parameters:
 * a code, or an error such as `interaction_required` when the visitor has
 * to choose or agree to something. Null when no answer came back (the
 * browser keeps the provider's sign-in from frames, it took too long, or
 * `signal` called it off).
 */
export function askOauthProviderSilently(
  url: string,
  signal?: AbortSignal,
): Promise<URLSearchParams | null> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(null);
      return;
    }
    const frame = document.createElement("iframe");
    frame.name = `${OAUTH_SILENT_FRAME_PREFIX}${Math.random().toString(36).slice(2)}`;
    frame.hidden = true;
    frame.tabIndex = -1;
    frame.setAttribute("aria-hidden", "true");

    const finish = (params: URLSearchParams | null) => {
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      signal?.removeEventListener("abort", onAbort);
      frame.remove();
      resolve(params);
    };
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== frame.contentWindow
      ) {
        return;
      }
      const { type, search, from } = (event.data ?? {}) as {
        type?: unknown;
        search?: unknown;
        from?: unknown;
      };
      if (
        type !== RESULT_MESSAGE ||
        from !== frame.name ||
        typeof search !== "string"
      ) {
        return;
      }
      frame.contentWindow?.postMessage(
        { type: ACK_MESSAGE },
        window.location.origin,
      );
      finish(new URLSearchParams(search));
    };
    const onAbort = () => finish(null);

    window.addEventListener("message", onMessage);
    signal?.addEventListener("abort", onAbort);
    const timer = window.setTimeout(() => finish(null), SILENT_TIMEOUT_MS);
    const silentUrl = new URL(url);
    silentUrl.searchParams.set("prompt", "none");
    frame.src = silentUrl.toString();
    document.body.appendChild(frame);
  });
}

/**
 * Opens the sign-in window. Called straight from the click, before any
 * request, or the browser blocks it. Null when it was blocked anyway.
 */
export function openOauthPopup(providerLabel: string): Window | null {
  const width = 500;
  const height = 640;
  const left = Math.max(
    0,
    Math.round(window.screenX + (window.outerWidth - width) / 2),
  );
  const top = Math.max(
    0,
    Math.round(window.screenY + (window.outerHeight - height) / 2),
  );
  // A new window starts with a copy of this tab's session storage, so the
  // mark is put here for the moment it opens, then taken off again.
  sessionStorage.setItem(OAUTH_POPUP_MARK_STORAGE_KEY, "1");
  const popup = window.open(
    "",
    OAUTH_POPUP_WINDOW_NAME,
    `popup=yes,width=${width},height=${height},left=${left},top=${top}`,
  );
  sessionStorage.removeItem(OAUTH_POPUP_MARK_STORAGE_KEY);
  if (!popup) return null;
  try {
    // A window that was already open under this name copied nothing.
    popup.sessionStorage.setItem(OAUTH_POPUP_MARK_STORAGE_KEY, "1");
  } catch {
    // Still on the provider's page; it got the mark when it opened.
  }

  // A blank window until the provider's page arrives; say what it is for.
  try {
    const doc = popup.document;
    doc.title = `Continue with ${providerLabel}`;
    // On a phone the window is a tab of its own, drawn at desktop width
    // (tiny text) unless the blank document says it is a mobile page.
    const viewport = doc.createElement("meta");
    viewport.name = "viewport";
    viewport.content = "width=device-width,initial-scale=1";
    doc.head.appendChild(viewport);
    doc.body.style.cssText =
      "margin:0;display:grid;place-items:center;min-height:100vh;background:#12151a;color:#c9d1dc;font:15px system-ui,sans-serif";
    doc.body.textContent = `Opening ${providerLabel}…`;
  } catch {
    // A window already on the provider's page cannot be written to.
  }
  popup.focus();
  return popup;
}

export type OauthPopupOutcome =
  { kind: "result"; params: URLSearchParams } | { kind: "closed" };

/**
 * Waits for the sign-in window to come back with the provider's answer, or
 * to be closed without one. The listener stays until `stop` is called, so
 * an answer arriving after the window looked closed (it can, when the
 * provider's pages cut it off from this page) still counts.
 */
export function listenForOauthPopup(
  popup: Window,
  onOutcome: (outcome: OauthPopupOutcome) => void,
): () => void {
  let stopped = false;
  let reportedClosed = false;
  const channel =
    typeof BroadcastChannel === "function"
      ? new BroadcastChannel(OAUTH_POPUP_CHANNEL)
      : null;

  const take = (data: unknown, reply: (message: unknown) => void) => {
    if (stopped || !data || typeof data !== "object") return;
    const { type, search, from } = data as {
      type?: unknown;
      search?: unknown;
      from?: unknown;
    };
    if (
      type !== RESULT_MESSAGE ||
      from !== OAUTH_POPUP_WINDOW_NAME ||
      typeof search !== "string"
    ) {
      return;
    }
    reply({ type: ACK_MESSAGE });
    stop();
    onOutcome({ kind: "result", params: new URLSearchParams(search) });
  };

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    take(event.data, (message) =>
      (event.source as Window | null)?.postMessage(
        message,
        window.location.origin,
      ),
    );
  };
  if (channel) {
    channel.onmessage = (event: MessageEvent) =>
      take(event.data, (message) => channel.postMessage(message));
  }
  window.addEventListener("message", onMessage);

  const closedTimer = window.setInterval(() => {
    if (reportedClosed || !popup.closed) return;
    reportedClosed = true;
    window.clearInterval(closedTimer);
    onOutcome({ kind: "closed" });
  }, 400);

  function stop() {
    if (stopped) return;
    stopped = true;
    window.clearInterval(closedTimer);
    window.removeEventListener("message", onMessage);
    channel?.close();
  }

  return stop;
}
