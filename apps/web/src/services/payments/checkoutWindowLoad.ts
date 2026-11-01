// Whether the payment provider's window really opened.
//
// Razorpay's checkout.js puts up its overlay (with a spinner) at once and
// loads the window itself from api.razorpay.com in a frame. Once that page
// is up, it posts `{ source: "frame", event: "load" }` to this page, about
// 0.4 s after opening on a normal connection. Where Razorpay's servers
// refuse the visitor (seen 2026-10-17 for a learner in Pakistan: an empty
// 406 for the window, 403 for its logging, both from Razorpay's load
// balancer), that message never comes, checkout.js says nothing either,
// and its spinner and our "Processing…" button stayed up for good.
//
// So the window is opened here and the page waits for that message: a
// little after the frame itself has finished loading (it loads the refusal
// page too), or for a longer time in all on a slow connection. If it never
// comes, the overlay is taken down by hand: checkout.js's own `close()`
// leaves it up when its window never loaded, along with the `overflow:
// hidden` it put on the page. It keeps reusing that refused frame for later
// openings in the same page, so only a reload asks Razorpay again.

const PROVIDER_ORIGIN = "https://api.razorpay.com";
/** After the frame's own load, how long its "loaded" message may take. */
const AFTER_FRAME_LOAD_MS = 4000;
/** In all, however slow the connection. */
const OVERALL_MS = 20000;

export const CHECKOUT_WINDOW_BLOCKED_MESSAGE =
  "The payment window couldn't open. Our payment provider, Razorpay, didn't load it on your connection, which can happen outside India and on some networks or VPNs. Nothing was charged. Try another network and reload this page, or contact us and we'll help you enrol.";

/** Set once a window was refused: the frame checkout.js reuses is dead. */
let refusedInThisPage = false;

interface CheckoutWindow {
  open: () => void;
  close?: () => void;
}

/**
 * Opens the provider's window and calls `onBlocked` once if it never
 * reports that it loaded, after taking its overlay down. Returns a function
 * that stops watching.
 */
export function openCheckoutWindow(
  checkout: CheckoutWindow,
  onBlocked: () => void,
): () => void {
  const rootStyle = document.documentElement.getAttribute("style");
  const bodyStyle = document.body.getAttribute("style");
  checkout.open();

  let done = false;
  let afterFrameTimer = 0;
  const frame = document.querySelector<HTMLIFrameElement>(
    ".razorpay-container iframe",
  );

  const stop = () => {
    if (done) return;
    done = true;
    window.removeEventListener("message", onMessage);
    frame?.removeEventListener("load", onFrameLoad);
    window.clearTimeout(afterFrameTimer);
    window.clearTimeout(overallTimer);
  };
  const blocked = () => {
    if (done) return;
    stop();
    refusedInThisPage = true;
    checkout.close?.();
    const container = document.querySelector<HTMLElement>(
      ".razorpay-container",
    );
    if (container) container.style.display = "none";
    restoreStyle(document.documentElement, rootStyle);
    restoreStyle(document.body, bodyStyle);
    onBlocked();
  };
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== PROVIDER_ORIGIN) return;
    // Any message from the window means it is up; its first is `load`.
    stop();
  };
  const onFrameLoad = () => {
    window.clearTimeout(afterFrameTimer);
    afterFrameTimer = window.setTimeout(blocked, AFTER_FRAME_LOAD_MS);
  };

  window.addEventListener("message", onMessage);
  frame?.addEventListener("load", onFrameLoad);
  // The refused frame is shown again as it is, with no new load to wait for.
  if (refusedInThisPage) onFrameLoad();
  const overallTimer = window.setTimeout(blocked, OVERALL_MS);
  return stop;
}

function restoreStyle(element: HTMLElement, style: string | null) {
  if (style === null) element.removeAttribute("style");
  else element.setAttribute("style", style);
}
