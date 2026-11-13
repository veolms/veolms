# Mobile push (Firebase Cloud Messaging)

What the server sends to phones, and what the app must do. Server code:
`apps/api/src/modules/notifications/push/` and
`apps/api/src/modules/chat/push/`. Channel list and type map:
`packages/contracts/src/push-channels.ts` (the single source; copy the ids
from there).

## 1. Register the install

The app is addressed by its **Firebase Installation ID (FID)**, not the old
registration token.

- Android: `FirebaseMessagingService.onRegistered(installationId)` (manifest
  meta-data `firebase_messaging_installation_id_enabled = true`), or
  `FirebaseInstallations.getInstance().getId()`.
- iOS: `Installations.installations().installationID()`, plus the
  `InstallationIDDidChange` notification.

Call **after login, on every app start, and whenever the FID changes**
(signed in, the `veolms-session` cookie):

```
PUT /v1/me/push-devices
{
  "fid": "cXk7Hb3sR2mZ8a1bC4dE5f",
  "previousFid": "…",            // only when the FID changed
  "applicationId": "org.veolms.app",     // the running app's package name / bundle id
  "platform": "android",         // or "ios"
  "appVersion": "1.4.0",         // optional
  "deviceLabel": "Pixel 7",      // optional
  "pushAllowed": true            // the phone allows notifications for the app
}
→ 200 { "success": true, "data": { "registered": true, "pushEnabled": true } }
→ 400 PUSH_APP_UNKNOWN: this applicationId is not set up on the server
```

There is more than one app: the community app (`org.veolms.app`) and any
number of whitelabel apps, each with its own package name. The web app,
inside the app's WebView, makes this call (native code never has the
session): it sends `platform().applicationId` from the bridge, which
picks the Firebase project in `PUSH_APPS`; a wrong one would fail every
send. Builds without that field fall back to `VITE_NATIVE_APP_ID`;
without either, nothing is registered.

On **sign-out**, the web app removes the phone first, while the session
still holds (at most 2 s; the server stops pushes to a signed-out login
anyway):

```
DELETE /v1/me/push-devices/:fid      → 200 { "data": { "removed": true } }
```

The Firebase installation is **not** reset: in the community app one FID
is registered with several academies, and a new FID would silently break
pushes from all the others.

Rules the server applies: one row per FID (the latest login owns the phone),
10 phones per account (the least recently seen goes), rows unseen for 270
days are dropped, a phone whose login was signed out (logout elsewhere,
"sign out other sessions") stops getting pushes. A login that simply
expired keeps its pushes, so reminders can bring the learner back.

## 2. Android channels (create all at every start)

Android 8+ uses the channel's importance; Android 7.x ignores channels and
uses the per-message `notification_priority`, which the server always sends.
A channel's importance can never change after creation: a change needs a new
id (`mentions_v2`) and deleting the old channel. Set `general` as the
manifest default
(`com.google.firebase.messaging.default_notification_channel_id`).

| Group (id, name)      | Channel id           | Name                   | Importance |
| --------------------- | -------------------- | ---------------------- | ---------- |
| `chats` Chats         | `chat_messages`      | Chat messages          | HIGH       |
| `learning` Learning   | `course_updates`     | Course updates         | DEFAULT    |
| `learning` Learning   | `study_reminders`    | Study reminders        | DEFAULT    |
| `learning` Learning   | `achievements`       | Achievements           | LOW        |
| `community` Community | `mentions`           | Mentions               | HIGH       |
| `community` Community | `discussion_replies` | Discussion replies     | DEFAULT    |
| `community` Community | `moderation_updates` | Moderation             | DEFAULT    |
| `account` Account     | `purchases`          | Purchases and payments | DEFAULT    |
| `account` Account     | `support_replies`    | Support replies        | DEFAULT    |
| `account` Account     | `account_security`   | Account and security   | HIGH       |
| `teaching` Teaching   | `video_processing`   | Video processing       | LOW        |
| (none)                | `general`            | General                | DEFAULT    |

Descriptions are in `push-channels.ts`.

## 3. What arrives

Every message's `data` (all values are strings) has `kind`. Chat messages
also carry `title`, `body` and `androidChannelId` there (the app draws them);
notifications carry them only in the notification block. Text is cut to keep
the whole message under FCM's 4096-byte limit. Plus:

### Notifications (`kind = "notification"`)

Android gets a **notification message**: the system shows it on
`android.notification.channel_id` even when the app is not running.

| data key         | Meaning                                                                           |
| ---------------- | --------------------------------------------------------------------------------- |
| `notificationId` | The in-app notification; mark it read on tap (`PATCH /v1/notifications/:id/read`) |
| `type`           | e.g. `learning.reminder`, `purchase.completed`                                    |
| `category`       | `transactional`, `social`, `learning`, `system`                                   |
| `deepLink`       | Path to open, e.g. `/orders` (may be empty)                                       |

Reminders and daily achievements carry a `collapse_key`/`tag`: a phone that
was offline shows only the latest one.

### Chat messages (`kind = "chat_message"`)

Android gets a **data-only, high-priority** message: the app draws it, like
WhatsApp (`NotificationCompat.MessagingStyle`, one notification per chat,
tag = `roomId`, messages added under the sender's name, group title for
groups). Not shown when that chat is open on screen.

| data key                 | Meaning                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| `roomId`, `roomKind`     | The chat; `course`, `team` or `direct`                               |
| `roomTitle`              | Group name, or the sender's name in a private chat                   |
| `messageId`, `seq`       | The message (open the chat at `seq`)                                 |
| `senderId`, `senderName` | Who sent it                                                          |
| `text`                   | One line: the text, or "📷 Photo", "🎤 Voice message", "📄 Document" |
| `sentAt`                 | ISO time                                                             |
| `isMention`              | `"true"` when the reader was mentioned / @everyone                   |
| `isRequest`              | `"true"` for a first message from someone not yet accepted           |
| `unreadCount`            | Unread messages in that chat for the reader (max 99)                 |
| `deepLink`               | `/chat/<roomId>?seq=<seq>`                                           |
| `actionToken`            | Android only: the token for Reply / Mark as read (section 5)         |
| `actionTokenExpiresAt`   | ISO time the token stops working                                     |

iOS gets an alert for both kinds (`thread-id` = the channel group, or
`chat:<roomId>` for chats, so a chat's messages stack).

### Chat read (`kind = "chat_read"`)

Android only, **data-only, normal priority**: the chat was read up to
`readSeq` (in the web app, on another device, or with Mark as read), so
remove its notification lines up to there. Sent only to the phones that
got a push for that chat that this read makes old.

| data key  | Meaning                 |
| --------- | ----------------------- |
| `roomId`  | The chat                |
| `readSeq` | Read up to this message |

## 4. Who gets a chat push

Everyone in the chat but the sender, except people who muted it
(`notify_level` none, or for a while: `muted_until`, set with
`PATCH /chat/rooms/:id/me {"muteFor":"8h"|"1w"|"always"|"off"}` and shown
as `me.mutedUntil`; "mentions" pushes only when mentioned), already read
it on another device, blocked the sender, or turned chat pushes off in
settings (`chat.message` / `push`). Groups above
`CHAT_PUSH_GROUP_MAX_MEMBERS` (256) push only mentions and @everyone.
Deleted and system messages push nothing. A chat mention does not send a
second push: the chat message already says `isMention`.

Browsers get the same chat pushes through Web Push (see
[web-push.md](web-push.md)): they are `push_devices` rows with platform
`web` in the same queue. Phone apps are unaffected.

## 5. Reply and Mark as read from a chat notification

A chat notification's Reply and Mark as read buttons run in the app's
native code, often with no WebView, and native code never gets the
session. Each chat push to an Android phone therefore carries
`actionToken`: random, single use, bound to that user, phone, login and
chat, valid for `PUSH_ACTION_TOKEN_TTL_HOURS` (48). The server keeps only
its SHA-256. Keep it in app-private storage (not in the notification's
extras), the newest `seq` per chat winning; show the buttons only while
one is valid.

```
POST /v1/push-actions/chat/reply
Authorization: PushAction pat_...
{ "clientId": "<uuid>", "body": "On my way" }
→ 201 { "message": { "seq": 7, "sentAt": "…" }, "nextToken": "pat_…", "nextTokenExpiresAt": "…" }
→ 200 the same: this clientId was already sent with this token (a fresh nextToken)

POST /v1/push-actions/chat/read
Authorization: PushAction pat_...
→ 200 { "readSeq": 5 }
```

No cookie is read on these routes. Retry a reply with the **same token and
clientId**: it is sent once. Errors:

| Answer                         | Meaning; what the app does                               |
| ------------------------------ | -------------------------------------------------------- |
| 401 `PUSH_ACTION_INVALID`      | Used, replaced by a newer push, read elsewhere: drop it  |
| 401 `PUSH_ACTION_EXPIRED`      | Expired: drop it, "Open the chat to reply"               |
| 401 `PUSH_ACTION_SIGNED_OUT`   | The login was signed out or ran out: drop all, "Sign in" |
| 409 `PUSH_ACTION_STALE`        | Read since the push: remove the notification             |
| 403 / 429 (chat rules, limits) | Not spent: keep the token, show the message              |

The checks: token (scope, not used, not revoked, not expired), the login
as for any request with the cookie (signed in, not expired, no two-factor
step pending), not read since the push, then every chat rule of the normal
send. Limits: 10 replies per 10 s per user. A reply returns the token for
the next reply; Mark as read does not. A chat read anywhere revokes its
tokens and sends the phones a silent `chat_read` push. Off
(`PUSH_ACTIONS_ENABLED=false`), pushes carry no token.

The community app hosts several academies, each with its own API; a token
works only on the API that issued it. Until pushes say which academy they
belong to, the community app shows no Reply buttons.

## 6. Settings for push per type

The app saves switches with the existing endpoint, channel `push`:

```
PUT /v1/notification-preferences
{ "preferences": [{ "notificationType": "chat.message", "channel": "push", "enabled": false }] }
```

Security notices are mandatory and ignore switches.

## 7. Server setup (ops)

| Setting                         | Default          |                                                                                                                                                  |
| ------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PUSH_APPS`                     | unset (push off) | `[{"applicationId":"com.procodrr.app","serviceAccountPath":"/etc/veolms-api/fcm-procodrr.json"}]`, or `serviceAccountBase64` instead of the path |
| `PUSH_ENABLED`                  | true             | Kill switch                                                                                                                                      |
| `PUSH_TARGET_FIELD`             | `fid`            | `token` if Firebase refuses `fid` (it accepts FIDs there during the transition)                                                                  |
| `PUSH_MAX_ATTEMPTS`             | 5                | Sends before a push is marked failed                                                                                                             |
| `PUSH_SEND_CONCURRENCY`         | 16               | Parallel sends per worker                                                                                                                        |
| `PUSH_MAX_DEVICES_PER_USER`     | 10               |                                                                                                                                                  |
| `NOTIFICATION_COURSE_WIDE_PUSH` | true             | Off keeps course-wide announcements off phones                                                                                                   |
| `CHAT_PUSH_GROUP_MAX_MEMBERS`   | 256              |                                                                                                                                                  |
| `PUSH_ACTIONS_ENABLED`          | true             | Reply / Mark as read tokens in chat pushes to phones                                                                                             |
| `PUSH_ACTION_TOKEN_TTL_HOURS`   | 48               | How long a token works (the chat push's own lifetime)                                                                                            |

The key file is a Firebase service account with the "Firebase Cloud
Messaging API Admin" role; set it on every API server. iOS also needs the
APNs key uploaded in the Firebase console. A missing or refused key pauses
that app's pushes for 5 minutes at a time (logged as an error); queued
pushes wait instead of failing, until they expire. The ops heartbeat logs
`pushBacklog`.

Sending details: the API sends with the official Firebase Admin SDK
(`firebase-admin/messaging`, one Firebase app per `applicationId`), addressed
by `fid` (or `token`). The SDK itself retries a send a few times on HTTP 503
and dropped connections before the queue sees the error. The queue is
`push_deliveries` (one row per message per
user, retried per phone, never sent after its expiry: chats 2 days,
reminders 1 day, others up to 7). `UNREGISTERED`, an invalid FID and
`SENDER_ID_MISMATCH` delete the phone; `UNAVAILABLE`, `INTERNAL` and network
errors retry with backoff (honouring `Retry-After`, at least a minute after
`QUOTA_EXCEEDED`); 10 failures in a row delete the phone.
