/*
 * The site's service worker. It does one job: chat notifications that
 * arrive while no tab is open (Web Push). It caches nothing and handles no
 * requests, so pages load exactly as they do without it.
 *
 * A push carries one message, already encrypted for this browser (see
 * apps/api/src/modules/notifications/push/push-message.ts, WebPushMessage).
 * It is shown WhatsApp-style: one notification per chat (its tag), the
 * last few lines stacked, a count in the title. Nothing is shown when the
 * site is in front, or a visible tab shows that chat: the page has it.
 *
 * This browser's choices (previews, quiet hours) are written to IndexedDB
 * by the page (services/webPush/webPush.prefs.ts), because a service
 * worker cannot read localStorage.
 *
 * A site has one service worker for "/". An extension that registers its
 * own there must load this file inside it (`importScripts("/sw.js")`, as
 * cloud's offline-sw.js does), or pushes reach a worker that cannot show
 * them. The page keeps whatever worker the site already runs
 * (services/webPush/webPush.ts, registration()). Top-level names here
 * must not clash with that worker's.
 */

const PREFS_DB = "veolms-push";
const PREFS_STORE = "prefs";
const PREFS_KEY = "device";
const ICON = "/static/app-icon-192.png";
const MAX_LINES = 5;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function readPrefs() {
  const fallback = { previews: true, quietHours: null };
  return new Promise((resolve) => {
    let request;
    try {
      request = indexedDB.open(PREFS_DB, 1);
    } catch {
      resolve(fallback);
      return;
    }
    request.onupgradeneeded = () => {
      request.result.createObjectStore(PREFS_STORE);
    };
    request.onerror = () => resolve(fallback);
    request.onsuccess = () => {
      const db = request.result;
      try {
        const get = db
          .transaction(PREFS_STORE, "readonly")
          .objectStore(PREFS_STORE)
          .get(PREFS_KEY);
        get.onsuccess = () => {
          db.close();
          resolve({ ...fallback, ...(get.result || {}) });
        };
        get.onerror = () => {
          db.close();
          resolve(fallback);
        };
      } catch {
        db.close();
        resolve(fallback);
      }
    };
  });
}

/** "22:00"–"07:00" (overnight) or "13:00"–"14:00", in this device's time. */
function inQuietHours(quietHours, now) {
  if (!quietHours || !quietHours.from || !quietHours.to) return false;
  const minutes = (value) => {
    const [h, m] = String(value).split(":").map(Number);
    return h * 60 + m;
  };
  const from = minutes(quietHours.from);
  const to = minutes(quietHours.to);
  const at = now.getHours() * 60 + now.getMinutes();
  if (from === to) return false;
  return from < to ? at >= from && at < to : at >= from || at < to;
}

function chatPath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

async function showPush(message) {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  if (message.kind !== "test") {
    // The site is in front: the page plays its sound and shows the badge.
    if (windows.some((w) => w.visibilityState === "visible" && w.focused)) {
      return;
    }
    // A visible tab already shows this chat.
    if (
      message.roomId &&
      windows.some(
        (w) =>
          w.visibilityState === "visible" &&
          chatPath(w.url) === `/chat/${message.roomId}`,
      )
    ) {
      return;
    }
  }

  const prefs = await readPrefs();
  const silent = inQuietHours(prefs.quietHours, new Date());
  if (message.kind === "test") {
    await self.registration.showNotification(message.title, {
      body: message.body,
      tag: "test",
      icon: ICON,
      silent,
      data: { url: message.url || "/chat" },
    });
    return;
  }

  const tag = message.tag || "chat";
  const [shown] = await self.registration.getNotifications({ tag });
  const previous = (shown && shown.data) || {};
  const count = (previous.count || 0) + 1;
  const line = prefs.previews ? message.body : null;
  const lines = [...(previous.lines || []), line]
    .filter((value) => typeof value === "string")
    .slice(-MAX_LINES);
  const title =
    count > 1 ? `${message.title} (${count} messages)` : message.title;
  const body = prefs.previews
    ? lines.join("\n")
    : count > 1
      ? `${count} new messages`
      : "New message";

  await self.registration.showNotification(title, {
    body,
    tag,
    // A newer message in the same chat alerts again, as on WhatsApp.
    renotify: true,
    icon: ICON,
    silent,
    timestamp: Date.parse(message.sentAt || "") || Date.now(),
    data: {
      url: message.url || "/chat",
      roomId: message.roomId || null,
      seq: message.seq || null,
      count,
      lines,
    },
  });
}

self.addEventListener("push", (event) => {
  let message = null;
  try {
    message = event.data ? event.data.json() : null;
  } catch {
    message = null;
  }
  if (!message || message.v !== 1 || typeof message.title !== "string") {
    // Browsers require something to be shown for every push.
    event.waitUntil(
      self.registration.showNotification("ProCodrr", {
        body: "You have a new message.",
        tag: "chat",
        icon: ICON,
        data: { url: "/chat" },
      }),
    );
    return;
  }
  event.waitUntil(showPush(message));
});

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  event.notification.close();
  const path =
    typeof data.url === "string" && data.url.startsWith("/")
      ? data.url
      : "/chat";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const target =
        windows.find((w) => chatPath(w.url).startsWith("/chat")) ||
        windows.find((w) => w.visibilityState === "visible") ||
        windows[0];
      if (target) {
        // The page opens it in the app, without a reload.
        target.postMessage({ type: "veolms:open", path });
        await target.focus().catch(() => {});
        return;
      }
      await self.clients.openWindow(path);
    })(),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  // The browser replaced the subscription: subscribe again with the same
  // key; the next visit saves the new one (with the old as previous).
  const old = event.oldSubscription;
  const key = old && old.options && old.options.applicationServerKey;
  if (!key) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: key })
      .catch(() => {}),
  );
});
