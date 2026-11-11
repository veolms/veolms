import {
  getChatPrefs,
  setChatPrefs,
  subscribeChatPrefs,
} from "../../store/chatPrefs.store";
import { writeWorkerPrefs } from "./webPush.prefs";
import { webPushService } from "./webPush.service";
import { readSavedWebPush, writeSavedWebPush } from "./webPush.state";

/**
 * Chat notifications with the tab closed (Web Push): the service worker
 * (public/sw.js) shows them; this file asks the browser, subscribes and
 * keeps the server's copy of the subscription current.
 *
 * - Turned on from Settings › Notifications or the chat list's banner.
 * - Each visit (`syncWebPush`) re-saves the subscription when it changed,
 *   belongs to another account, or a day has passed; nothing otherwise.
 * - Turned off, or at sign-out (`forgetWebPush`), the server forgets it
 *   and the browser unsubscribes.
 */

export type WebPushSupport =
  | "supported"
  /** iPhone and iPad: only once the site is added to the Home Screen. */
  | "install-first"
  /** The Android app sends its own notifications. */
  | "in-app"
  | "unsupported";

const SW_URL = "/sw.js";
/** A visit re-saves an unchanged subscription at most this often. */
const RESAVE_MS = 24 * 60 * 60 * 1000;

export function webPushSupport(): WebPushSupport {
  if (typeof window === "undefined") return "unsupported";
  const installedOnAndroid =
    /Android/iu.test(navigator.userAgent) &&
    window.matchMedia?.("(display-mode: standalone)").matches;
  if (installedOnAndroid) return "in-app";
  if (
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  ) {
    return "supported";
  }
  const appleTouch =
    /iPhone|iPad|iPod/u.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return appleTouch ? "install-first" : "unsupported";
}

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64Url.replace(/-/gu, "+").replace(/_/gu, "/");
  const raw = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(key: ArrayBuffer | null | undefined, publicKey: string) {
  if (!key) return false;
  const a = new Uint8Array(key);
  const b = keyBytes(publicKey);
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

/** "Chrome on Windows", for the server's row (support, not shown). */
function deviceLabel(): string | undefined {
  const ua = navigator.userAgent;
  const browser = /Edg\//u.test(ua)
    ? "Edge"
    : /OPR\//u.test(ua)
      ? "Opera"
      : /Firefox\//u.test(ua)
        ? "Firefox"
        : /Chrome\//u.test(ua)
          ? "Chrome"
          : /Safari\//u.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Windows/u.test(ua)
    ? "Windows"
    : /Android/u.test(ua)
      ? "Android"
      : /iPhone|iPad/u.test(ua)
        ? "iOS"
        : /Mac OS X/u.test(ua)
          ? "macOS"
          : /Linux/u.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

let registering: Promise<ServiceWorkerRegistration> | null = null;
function registration(): Promise<ServiceWorkerRegistration> {
  registering ??= navigator.serviceWorker
    .register(SW_URL, { scope: "/" })
    .then(() => navigator.serviceWorker.ready)
    .catch((error: unknown) => {
      registering = null;
      throw error;
    });
  return registering;
}

let stopPrefsCopy: (() => void) | null = null;
/** Keeps the service worker's copy of previews and quiet hours current. */
function copyPrefsForWorker() {
  const copy = () => {
    const prefs = getChatPrefs();
    void writeWorkerPrefs({
      previews: prefs.previews,
      quietHours: prefs.quietHours,
    });
  };
  copy();
  stopPrefsCopy ??= subscribeChatPrefs(copy);
}

async function subscribeAndSave(userId: string, publicKey: string) {
  const reg = await registration();
  let subscription = await reg.pushManager.getSubscription();
  // Made with another key (the server's changed): it can never receive.
  if (
    subscription &&
    !sameKey(subscription.options.applicationServerKey, publicKey)
  ) {
    await subscription.unsubscribe().catch(() => false);
    subscription = null;
  }
  subscription ??= await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(publicKey),
  });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("The browser gave an incomplete subscription.");
  }
  const previous = readSavedWebPush();
  await webPushService.save({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    ...(previous && previous.endpoint !== json.endpoint
      ? { previousEndpoint: previous.endpoint }
      : {}),
    ...(deviceLabel() ? { deviceLabel: deviceLabel() } : {}),
  });
  writeSavedWebPush({ endpoint: json.endpoint, userId, savedAt: Date.now() });
  copyPrefsForWorker();
}

export type EnableResult =
  | { ok: true }
  | {
      ok: false;
      reason: "denied" | "dismissed" | "unsupported" | "off" | "failed";
    };

/**
 * Turns notifications on for this device (call from a click: the browser
 * asks only then). Where push is not possible, the tab's own alerts are
 * used instead (while a tab is open).
 */
export async function enableWebPush(userId: string): Promise<EnableResult> {
  if (typeof Notification === "undefined") {
    return { ok: false, reason: "unsupported" };
  }
  // First, while the click still counts as the person asking.
  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      reason: permission === "denied" ? "denied" : "dismissed",
    };
  }
  setChatPrefs({ desktopAlerts: true });
  if (webPushSupport() !== "supported") return { ok: true };
  try {
    const config = await webPushService.getConfig();
    // The server sends no browser pushes: the tab's alerts still work.
    if (!config.enabled || !config.publicKey)
      return { ok: false, reason: "off" };
    await subscribeAndSave(userId, config.publicKey);
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** Stops pushes to this browser: the server forgets it, the browser too. */
async function unsubscribe(timeout?: number) {
  const saved = readSavedWebPush();
  let subscription: PushSubscription | null = null;
  try {
    const reg = await navigator.serviceWorker?.getRegistration("/");
    subscription = (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    subscription = null;
  }
  const endpoint = subscription?.endpoint ?? saved?.endpoint;
  writeSavedWebPush(null);
  await Promise.all([
    endpoint
      ? webPushService.remove(endpoint, timeout).catch(() => undefined)
      : undefined,
    subscription?.unsubscribe().catch(() => false),
  ]);
}

export async function disableWebPush() {
  setChatPrefs({ desktopAlerts: false });
  await unsubscribe();
}

/**
 * Before signing out: this browser stops receiving the account's chats.
 * Waits for the server at most `timeout` ms (the session is still valid);
 * if it cannot be reached, signing out ends the login, and the server
 * drops subscriptions of ended logins by itself.
 */
export async function forgetWebPush(timeout = 2_000) {
  if (!readSavedWebPush()) return;
  await unsubscribe(timeout);
}

/**
 * On each visit while signed in: keeps the subscription saved for this
 * account, or cleans up when notifications were turned off or blocked.
 */
export async function syncWebPush(userId: string) {
  if (webPushSupport() !== "supported") return;
  const saved = readSavedWebPush();
  const wanted =
    getChatPrefs().desktopAlerts && Notification.permission === "granted";
  if (!wanted) {
    if (saved) await unsubscribe();
    return;
  }
  copyPrefsForWorker();
  const reg = await navigator.serviceWorker.getRegistration("/");
  const subscription = (await reg?.pushManager.getSubscription()) ?? null;
  const current =
    saved &&
    subscription &&
    saved.userId === userId &&
    saved.endpoint === subscription.endpoint &&
    Date.now() - saved.savedAt < RESAVE_MS;
  if (current) return;
  const config = await webPushService.getConfig();
  if (!config.enabled || !config.publicKey) return;
  await subscribeAndSave(userId, config.publicKey);
}

/** The endpoint to send a test to, if this browser is subscribed. */
export async function currentEndpoint(): Promise<string | null> {
  if (webPushSupport() !== "supported") return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription())?.endpoint ?? null;
}

export async function sendTestNotification(): Promise<string | null> {
  const endpoint = await currentEndpoint();
  if (!endpoint) return "This browser isn't subscribed yet.";
  try {
    const result = await webPushService.test(endpoint);
    return result.sent ? null : result.problem;
  } catch {
    return "Couldn't reach the server. Try again.";
  }
}
