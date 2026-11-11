# Web push for chat

Chat messages reach learners who allowed notifications in their browser,
even with no ProCodrr tab open. Standard Web Push: the API encrypts each
message for the browser (RFC 8291) and posts it to the browser's own push
service (Chrome: FCM, Firefox: Mozilla, Edge: Windows, Safari: Apple) with a
VAPID signature (RFC 8292). A small service worker (`apps/web/public/sw.js`)
shows it. Phone apps keep their own pushes ([mobile-push.md](mobile-push.md)).

## How it fits the existing push pipeline

There is one pipeline, not two. A browser subscription is one more row in
`push_devices` (platform `web`, `fid` = `"web:" + sha256(endpoint)`, the
endpoint and its two keys in `web_endpoint`, `web_p256dh`, `web_auth`). So
browsers share, with phones:

- the queue (`push_deliveries`), its retries with backoff, per-device
  progress (a retry never repeats a browser that already got it) and expiry;
- recipient choice (the chat module: mute, mentions-only, already read,
  blocks, groups over 256 members push only mentions);
- clean-up: a push service answering 404/410 (unsubscribed, expired) or 403
  (made with another VAPID key) removes the row at once; repeated failures,
  signed-out logins and long-unseen rows are removed by the hourly upkeep.

The sender (`push-sender.ts`) sends phone rows to FCM and web rows to their
endpoint (`web-push.client.ts`, node:crypto only, no SDK). Browsers get
**chat messages only**; bell notifications keep their own live stream.

Each push is at most ~3 KB of JSON (the push services take 4 KB encrypted),
carries a TTL from the queue's expiry, `Urgency: high`, and a `Topic` per
chat, so a newer message replaces an older one still waiting for an offline
browser.

## API

| Route                                   | What it does                                               |
| --------------------------------------- | ---------------------------------------------------------- |
| `GET /me/web-push`                      | Whether browsers can subscribe, and the VAPID public key   |
| `PUT /me/web-push/subscription`         | Save this browser (`PushSubscription.toJSON()`), per login |
| `POST /me/web-push/subscription/remove` | Forget it (turned off, or before signing out)              |
| `POST /me/web-push/test`                | Send a test notification to this browser now               |
| `PATCH /chat/rooms/:id/me {muteFor}`    | Mute a chat for `8h`, `1w`, `always`, or `off`             |

Endpoints must be on `WEB_PUSH_ALLOWED_HOSTS` (the browsers' push
services), so the API never posts to an address a visitor chose.

## Setting it up

1. `pnpm --filter @veolms/api web-push:keys` prints a key pair.
2. Put both lines in the API environment of **every** API server and the
   notification worker (`/etc/veolms-api/api.env` in production), plus
   `WEB_PUSH_SUBJECT=mailto:<a support address>` (defaults to `WEB_URL`).
3. Restart. The worker logs `Push sending is on` with `web: true`.

`WEB_PUSH_ENABLED=false` is the kill switch (`PUSH_ENABLED=false` stops
every push). Never change the key pair casually: every subscription made
with the old key stops working; browsers subscribe again on their next visit.
`/sw.js` must be served from the site root with `Cache-Control: max-age=0`
(`apps/web/public/_headers`).

## In the browser

- **Turning it on**: the chat list's banner or Settings › Notifications asks
  the browser, registers `/sw.js` (only then: visitors who never turn it on
  get no service worker) and saves the subscription. Each visit re-saves it
  when it changed, belongs to another account or a day has passed.
- **No duplicates**: one subscription per browser, however many tabs. With
  push on, the tab's own alerts (the older in-tab `Notification`) step aside,
  and a hidden tab closes its chat stream after 2 minutes as usual.
- **Not shown** when the site is in front (the page plays its sound and
  shows the badge) or a visible tab already shows that chat.
- **One notification per chat** (tag `chat:<roomId>`): a new message
  replaces it, re-alerts, keeps the last 5 lines and counts ("Asha (3
  messages)"), WhatsApp-style.
- **Click**: focuses an open tab and opens the chat at the message in the
  app, or opens a new window at `/chat/:roomId?seq=`.
- **Read clears it**: opening the chat, or reading it in another tab or on
  another device while a tab is open here, closes its notification.
- **Sign-out**: the browser unsubscribes and the server forgets it before
  the session ends; if that request fails, the server drops subscriptions of
  signed-out logins when it next has a push for them.

## Settings › Notifications, and why

We looked at WhatsApp, Telegram and Discord and kept what learners use:

| Setting                            | From              | Why                                                                                                                         |
| ---------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Message notifications (on/off)     | all three         | One switch per device; states explained: on, on-while-open, blocked (how to unblock), unsupported, iPhone needs Home Screen |
| Show previews                      | WhatsApp          | Shared and classroom computers: "New message" instead of the text                                                           |
| New message sound / Sent sound     | WhatsApp          | Two separate switches, as asked; the sent sound is a short, quiet pop                                                       |
| Mute a chat: 8 h / 1 week / always | WhatsApp          | Follows the account to every device (server-side, like WhatsApp)                                                            |
| Mentions only (groups)             | Telegram, Discord | Large course groups are noisy; mentions still reach you                                                                     |
| Quiet hours (device time)          | Telegram-like     | Notifications still arrive, silently, so nothing is lost overnight                                                          |
| Send a test notification           | ours              | Answers "why don't I get notifications?" in one click, with a reason                                                        |

Left out on purpose: per-chat custom sounds and LED colours (WhatsApp),
notification exceptions lists and per-server overrides (Telegram, Discord),
"show sender only" previews. They add settings few learners would touch.

Per-device (this browser): previews, sounds, quiet hours, on/off. They live
in `store/chatPrefs.store.ts`; previews and quiet hours are copied to
IndexedDB for the service worker, which cannot read localStorage.
Per-account (every device): mute and mentions-only, on the server.

## What could not be checked automatically

The in-app browser pane denies notifications, so it was used for the
settings page, the "blocked" explanation and the mute dialog. The rest was
checked in Google Chrome against the real FCM push service (13 checks:
subscribe from the banner, shown with the tab closed, tag and link, stacking,
mute, click into an open tab, nothing while the chat is in front, read
clears it, previews off and quiet hours). Not checked: a real click opening
a new window (a script cannot make a trusted click), Firefox, Edge, Safari
(iOS needs the site on the Home Screen), and `pushsubscriptionchange`.
