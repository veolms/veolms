import type { QueryClient } from "@tanstack/react-query";

import { notificationKeys } from "./notifications.keys";
import { notificationsService } from "./notifications.service";

/**
 * Live notification updates over Server-Sent Events (EventSource).
 *
 * One stream per tab, however many components ask for it. The stream only
 * says "changed"; the summary and lists are then refetched over REST. While
 * it is connected the summary polls only every 10 minutes; whenever it is
 * not (unsupported browser, refused, network trouble) it polls every 2
 * minutes as before, so nothing depends on the stream working.
 *
 * The stream is closed while the tab is hidden and reopened when it is
 * shown again: a hidden tab needs no live badge, and reopening refetches
 * whatever changed meanwhile.
 */

/** How long to wait before trying again after the server refused. */
const REFUSED_RETRY_MIN_MS = 60_000;
const REFUSED_RETRY_MAX_MS = 10 * 60_000;

let users = 0;
let queryClient: QueryClient | null = null;
let source: EventSource | null = null;
let live = false;
/** Whether a stream has opened since this tab started listening. */
let readyBefore = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = REFUSED_RETRY_MIN_MS;
const liveListeners = new Set<() => void>();

function setLive(next: boolean) {
  if (live === next) return;
  live = next;
  for (const listener of liveListeners) listener();
}

function refetchNotifications() {
  void queryClient?.invalidateQueries({ queryKey: notificationKeys.summary() });
  void queryClient?.invalidateQueries({ queryKey: notificationKeys.lists() });
}

function close() {
  clearTimeout(retryTimer);
  retryTimer = undefined;
  source?.close();
  source = null;
  setLive(false);
}

function open() {
  if (source || users === 0 || document.visibilityState === "hidden") return;
  const next = notificationsService.openChangeStream();
  source = next;

  // Sent once the stream is open, also after the browser reconnects. The
  // first one follows the page's own fetch; any later one may follow a
  // change that happened while disconnected, so it refetches.
  next.addEventListener("ready", () => {
    retryDelay = REFUSED_RETRY_MIN_MS;
    setLive(true);
    if (readyBefore) refetchNotifications();
    readyBefore = true;
  });
  next.addEventListener("changed", refetchNotifications);
  next.onerror = () => {
    setLive(false);
    // CONNECTING: the browser is reconnecting by itself (after `retry`).
    // CLOSED: the server refused (signed out, too many tabs, turned off);
    // the browser gives up, so try again later, polling meanwhile.
    if (next.readyState === EventSource.CLOSED && source === next) {
      source = null;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        open();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, REFUSED_RETRY_MAX_MS);
    }
  };
}

function onVisibilityChange() {
  if (document.visibilityState === "hidden") close();
  else open();
}

/**
 * Starts the tab's stream (or joins it) for a signed-in user; returns the
 * function that leaves it. The last one to leave closes it.
 */
export function startNotificationStream(client: QueryClient): () => void {
  if (
    typeof window === "undefined" ||
    typeof window.EventSource === "undefined"
  ) {
    return () => {};
  }
  queryClient = client;
  users += 1;
  if (users === 1) {
    document.addEventListener("visibilitychange", onVisibilityChange);
    open();
  }
  let left = false;
  return () => {
    if (left) return;
    left = true;
    users -= 1;
    if (users === 0) {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      close();
      retryDelay = REFUSED_RETRY_MIN_MS;
      readyBefore = false;
    }
  };
}

/** Whether the stream is connected right now (for useSyncExternalStore). */
export function isNotificationStreamLive(): boolean {
  return live;
}

export function subscribeNotificationStreamLive(
  listener: () => void,
): () => void {
  liveListeners.add(listener);
  return () => liveListeners.delete(listener);
}
