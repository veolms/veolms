# Single-stream playback and Google One Tap nonce: implementation guide

This guide is for the contributor who opened
[issue 272](https://github.com/veolms/veolms/issues/272). Thank you for the
detailed report and for offering to build the remaining pieces. This document
says exactly what to build, what not to build, and why, so the pull request
lands on the first or second round.

It is written against the `dev` branch of `veolms/veolms` as of 2026-10-28.
Every path below exists there. If a path has moved by the time you read this,
search for the function name instead.

There are two pieces of work. Please send them as **two separate pull requests**:

1. Single-stream playback (one device plays at a time).
2. A server nonce for Google One Tap.

---

## Part 0: what changed since the issue, and what the stack actually is

Read this first. It changes several assumptions in the issue.

### Already merged

- **The device limit** (your Phase 1) is on `dev` as merge `08c30370`.
  Students are limited to 3 signed-in devices by default. An admin can set
  1 to 20 or "no limit" under Platform > Security. Staff (admins, instructors,
  team members) are never limited. A student at the limit is shown their
  devices and signs one out to get in. Do not touch any of this.
- Each session row already stores the user agent, IP address, and the
  Cloudflare visitor location (city, region, country), plus `last_used_at`.
  The single-stream feature reuses these to name "the other device".

### Video delivery costs nothing per gigabyte here

The issue estimates $0.08 to $0.12 per GB of egress. That is AWS or GCP
pricing. VeoLMS does not run on that:

- Videos live in **Cloudflare R2** and are served by a **Cloudflare Worker**
  on the CDN hostname. R2 charges **no egress**, and Cloudflare's terms allow
  video through the CDN when it is hosted on their platform (R2 is).
- What is billed is per request only: Worker invocations, one analytics data
  point per response, and R2 reads on edge cache misses. Segments are 2
  seconds long, so an hour of viewing is roughly 3,600 requests, which comes
  to about **$0.002 per viewing hour**. Ten thousand viewing hours a month
  is around $20.

So "saves 60 to 80% on CDN egress" does not apply. The only reason to limit
simultaneous playback is **account sharing**, and that reason is enough.
Please drop the cost argument from the PR description.

### Why the CDN and the DRM licence cannot be the gate

You proposed enforcing the lease in `media.service.ts` and the video player.
The media layer is the wrong place, for reasons you cannot see from the
public repo:

- Segment URLs carry a token that is an HMAC of the **lesson folder plus an
  expiry** (15 minutes). It is not bound to a user or a session, and the edge
  cache key strips it. A second device fetches the same cached segments.
- The licence server (ClearKey, in the private cloud repo) is called **once
  per video per tab**; keys are cached in the tab afterwards. There is no
  per-stream request to check.
- Two course catalogues (JavaScript, Next.js) are not encrypted at all.
- The API runs as several worker processes behind pm2, so there is no shared
  in-process memory. There is also **no Redis** in this stack. State goes in
  Postgres.

The good news: nothing in the private cloud repo needs to change. The whole
feature lives in this public repo, in code you can read and run.

### The heartbeat already exists

You proposed a new 20 to 30 second heartbeat. There already is one.

While a lesson video plays, the page POSTs
`/learning-progress/:courseKey/batch` **every 15 seconds**. It carries
progress percentages, the seconds actually played, and the playhead
position (noted every 5 seconds while playing). The batch is only sent when
something was played: a paused player is silent. A hidden tab flushes at
once; a closing tab sends a keepalive beacon.

The API already knows which session (which device) sent that request:
`request.session` is set by `apps/api/src/middlewares/auth.middleware.ts`.
So **the session is the device**. The client does not need to send any
device identifier. We only add a small "I am playing lesson X" field to the
batch and a small answer to its response.

---

## Part 1: single-stream playback

### Behaviour to implement

- A platform security setting, **Streams at a time**, next to "Devices per
  student": default **1**, admin may choose 1 to 5 or "No limit". Staff are
  never limited (`isStaffAccount(roles)` in
  `apps/api/src/modules/auth/shared/mfa-policy.ts`).
- **The newest play wins.** When a student presses play on device B while
  device A is playing, B starts immediately. A pauses within 15 seconds and
  shows, inside the player: _"Paused. You started playing on Chrome on
  Android in Pune. Play here instead?"_ Pressing play on A (the notice button
  or the normal play control) takes playback back, and B pauses on its next
  heartbeat.
- The same device never conflicts with itself: a lesson page and the mini
  player, or two tabs in the same browser, share one session.
- With "Streams at a time" set to N, the N most recent plays may continue;
  the oldest is paused.

Why "newest wins" and not Netflix-style "block the new device": the person
pressing play is the one who is actually present; the other device is a
forgotten tab or the friend. Blocking the new device would also be where a
wait appears (it would have to outlast the staleness window). With takeover
there is no wait on the device that was just touched, and a shared account
becomes annoying for both parties, which is exactly the deterrent.

### What not to implement in this PR

- No new table in Redis or Postgres for leases. Three nullable columns on
  `sessions` are enough (see below).
- No new heartbeat endpoint and no new interval. Reuse the progress batch.
- No change to `apps/api/src/modules/media/media.service.ts`
  (`assertPlaybackAccess`), the playback bootstrap, the playback token, or
  anything under `packages/video-player`. Do not add a request filter to Shaka.
- No change to session lifetime (`SESSION_TTL_DAYS`).
- No eviction of sessions. The device limit already handles that its own way.
- No watermark in this PR (see Part 3).
- Do not try to make it tamper-proof. A modified client can skip the
  heartbeat; so can a modified client skip the device limit cookie. The aim
  is friction for casual sharing in the real app, not DRM.

### Data model

Migration file: `packages/database/migrations/<timestamp>-playback-claims.ts`,
in the style of `20261028120000-device-limit.ts` (raw `sql` tagged
templates, `if not exists`, a `down`). Then add the columns to
`SessionTable` in `packages/database/src/schema/auth.schema.ts`.

```sql
alter table sessions
  add column if not exists playing_lesson_id uuid,
  add column if not exists playing_claimed_at timestamptz,
  add column if not exists playing_at timestamptz;

create index if not exists sessions_playing_idx
  on sessions (user_id, playing_at)
  where playing_at is not null;
```

- `playing_lesson_id`: what this device is playing (informational, used to
  name the lesson in the notice). No foreign key; a deleted lesson just shows
  no title.
- `playing_claimed_at`: when this device last **pressed play** (or started
  being counted). This is what "newest wins" compares.
- `playing_at`: the last heartbeat. A claim with `playing_at` older than the
  staleness window does not count.

Add the constant to `apps/api/src/modules/auth/shared/auth.constants.ts`:

```ts
/** A playback claim not refreshed for this long no longer counts (the page
 *  reports every 15 s; this allows two missed reports plus jitter). */
export const PLAYBACK_CLAIM_STALE_MS = 40_000;
```

### Contract changes (`packages/contracts/src/learning-progress.ts`)

Request: one optional field on `learningProgressBatchRequestSchema`.

```ts
export const learningProgressPlayingSchema = z.strictObject({
  lessonId: z.uuid(),
  /** "play": the viewer just pressed play on this device (a new claim).
   *  "heartbeat": still playing since the last report. */
  event: z.enum(["play", "heartbeat"]),
});

// in learningProgressBatchRequestSchema:
/** The lesson playing on this device when the report was sent. Absent when
 *  nothing is playing here, which releases this device's claim. */
playing: learningProgressPlayingSchema.optional(),
```

Response: one optional field on `learningProgressSyncResponseSchema`. Keep
`synced: z.literal(true)` exactly as it is.

```ts
export const learningProgressPlaybackSchema = z.discriminatedUnion("allowed", [
  z.strictObject({ allowed: z.literal(true) }),
  z.strictObject({
    allowed: z.literal(false),
    /** The device whose play is newer than this one's. */
    playingOn: z.strictObject({
      userAgent: z.string().nullable(),
      location: z.string().nullable(),
      lessonTitle: z.string().nullable(),
      since: z.iso.datetime(),
    }),
  }),
]);

// in learningProgressSyncResponseSchema:
playback: learningProgressPlaybackSchema.optional(),
```

Absent `playback` means "allowed" (older API, unlimited setting, staff).
Register the new schemas with `z.globalRegistry.add` like the others in that
file so the OpenAPI document names them.

Platform setting, in `packages/contracts/src/platform-settings-defaults.ts`
and `platform-settings.ts`, mirroring `maxDevicesPerStudent` exactly:

```ts
/** How many devices a student may play video on at once; null for no limit. */
maxSimultaneousStreams: number | null;
export const DEFAULT_MAX_SIMULTANEOUS_STREAMS = 1;
export const MIN_MAX_SIMULTANEOUS_STREAMS = 1;
export const MAX_MAX_SIMULTANEOUS_STREAMS = 5;
```

In `apps/api/src/modules/platform/platform-settings.service.ts` add the
same `resolveSettings` branch as `maxDevicesPerStudent` (null saved by an
admin means no limit; anything unreadable means the default) and an accessor
`maxSimultaneousStreams(): Promise<number | null>` on the service interface.
Add a case to `platform-settings.service.test.ts`.

### Server algorithm

Put the logic in the auth module, beside sessions, because it is about
sessions: a new method `reportPlayback` on the session service
(`apps/api/src/modules/auth/session/session.service.ts`) with repository
functions in `session.repository.ts`. The learning-progress controller
(`apps/api/src/modules/learning-progress/learning-progress.controller.ts`)
calls `service.syncProgress(...)` as today, then
`sessionService.reportPlayback(...)`, and returns `{ ...synced, playback }`.
`learning-progress.routes.ts` already creates a `sessionService`; pass it to
the controller.

Repository functions to add (all take the `Executor` like the existing ones):

- `listLivePlaybackClaims(db, userId, since)`: the user's sessions with
  `revoked_at is null`, `expires_at > now()`, `playing_at > since`, left
  joined to `lessons` for the title. Select `id`, `user_agent`,
  `location_city/region/country`, `playing_lesson_id`, `lesson title`,
  `playing_claimed_at`, `playing_at`.
- `setPlaybackClaim(db, sessionId, { lessonId, claimedAt, at })`.
- `clearPlaybackClaim(db, sessionId)`: sets the three columns to null.

`reportPlayback(user: { id, roles }, sessionId, playing | undefined)`:

```
limit = isStaffAccount(user.roles) ? null : await platformSettings.maxSimultaneousStreams()
if limit === null:            return { allowed: true }        // no writes at all
if playing is undefined:      clearPlaybackClaim(sessionId); return { allowed: true }

in a transaction:
  lockUserForSignIn(trx, user.id)            // same row lock the device limit uses
  now   = new Date()
  live  = listLivePlaybackClaims(trx, user.id, now - PLAYBACK_CLAIM_STALE_MS)
  mine  = live.find(s => s.id === sessionId)
  claimedAt = (playing.event === "play" || !mine) ? now : mine.playing_claimed_at
  others = live.filter(s => s.id !== sessionId)

  // Rank every live claim, newest first; ties broken by session id so the
  // order is total. This device may play if it is among the `limit` newest.
  ranked = [...others.map(o => [o.playing_claimed_at, o.id]), [claimedAt, sessionId]]
             .sort(newest first, then id)
  allowed = ranked.findIndex(([, id]) => id === sessionId) < limit

  if allowed:
    setPlaybackClaim(trx, sessionId, { lessonId: playing.lessonId, claimedAt, at: now })
    return { allowed: true }
  else:
    clearPlaybackClaim(trx, sessionId)       // a paused device must not keep counting
    newest = ranked[0]
    return { allowed: false, playingOn: describe(newest) }
```

Notes:

- `event: "play"` sets `claimedAt = now`, so a fresh play is always the
  newest and always allowed: that is the takeover.
- A `"heartbeat"` keeps its old `claimedAt`, so it loses as soon as another
  device has pressed play since.
- `describe()` formats `location` the way the sessions list does, with
  `formatSessionLocation` from
  `apps/api/src/modules/auth/shared/request-location.ts`.
- Do not read `playing.lessonId` for authorization. It is informational.
  The batch itself was already authorised by `syncProgress` (course access,
  published lessons).
- Keep the writes out of the unlimited and staff paths: with the default
  settings those cost nothing extra.

### Web changes

The two places that send the batch are
`apps/web/src/learning/useLearningProgress.ts` (`flushProgress`, used by the
lesson page through `learning/workspace/hooks/useLessonProgressState.ts`)
and `apps/web/src/learning/detachedLearningProgress.ts` (the mini player
after the lesson page has unmounted). Both must send `playing` and both must
act on `playback`.

1. **A small per-tab module**, e.g. `apps/web/src/learning/playbackClaim.ts`,
   in the style of `learningWatchTime.ts` and `lessonPositionOutbox.ts`:
   - `markPlaying(courseKey, lessonId)`: called on the player's `play` and
     `playing` events. Remembers the lesson and sets a "fresh claim" flag.
   - `markNotPlaying(courseKey)`: called on `pause`, `ended`, `unloaded`,
     `error`.
   - `takePlayingReport(courseKey)`: returns
     `{ lessonId, event: "play" | "heartbeat" }` or `undefined`, clearing the
     fresh flag; the flush paths call it when building the payload.
   - `subscribeToClaimRequests(courseKey, cb)`: `markPlaying` with a fresh
     claim asks for an immediate flush so the new device claims at once
     instead of waiting for the next 15 second tick. `useLearningProgress`
     subscribes and calls `flushProgress()`; `detachedLearningProgress`
     subscribes and calls its `syncDetachedLearningProgress(target, true)`.
     The player events are already observed in one place per player:
     `handleEvent` in `apps/web/src/learning/player/LessonVideoPlayer.tsx` and
     in `LearningMiniPlayer.tsx` (both start with `trackWatchTime(event)`).
     Add the calls right there. Only `play`/`playing` mark playing; `loaded`
     and the hover preloads must not.

2. **Send it.** In both flush functions, add `playing: takePlayingReport(courseKey)`
   to the payload. Loosen the early "nothing to send" return so a batch goes
   out when a fresh claim is pending, even with no progress yet. A paused
   player sends nothing new, so its claim simply goes stale after 40 seconds;
   the batch that carries its last position (usually the next tick) goes out
   without `playing`, which releases the claim at once. The keepalive beacon
   on `pagehide` must not include `playing` (the page is going away).

3. **Act on the answer.** When `response.playback?.allowed === false`:
   - Pause the player (`playerRef.current?.pause()` in `LessonVideoPlayer`,
     the same handle in `LearningMiniPlayer`).
   - Show a notice over the paused video. Do **not** reuse
     `playbackAccessError` for this; it stands in for the video and unloads
     it. Add a small overlay in the style of `LessonEndScreenOverlay`:
     title "Playing on another device", the sentence built from
     `playingOn` (device from `formatSessionDevice(userAgent)` in
     `apps/web/src/settings/sessionDisplay.ts`, the same helper the device
     limit dialog uses; location; lesson title if known), and one button
     "Play here instead". The mini player gets a one-line version.
   - Any `play` event clears the overlay and marks a fresh claim, so the
     button only needs to call `player.play()`.
   - Call `markNotPlaying` so the next batch does not re-send `heartbeat`.

4. **Admin control.** In `apps/web/src/platform/PlatformSecurityTab.tsx`,
   add a second `ThemedSelect` under the Devices section labelled
   "Streams at a time" with options 1 to 5 and "No limit", saving
   `{ security: { maxSimultaneousStreams } }` exactly like the devices one.
   Help text: "How many devices a student can play video on at the same
   time. The most recent play wins; the others pause."

5. **Older API.** Treat a missing `playback` field as allowed. Nothing else
   is needed; the request field is optional on the server too.

### Edge cases to handle

- Two heartbeats from two devices at the same instant: covered by the row
  lock inside the transaction.
- A device in the background: Chrome does not throttle timers in a tab that
  is playing audio, so heartbeats keep coming. A muted video in a hidden tab
  may be throttled; it then goes stale and loses without being told until its
  next flush. Acceptable.
- Lesson change in the same tab: `markNotPlaying` on `unloaded`, then
  `markPlaying` on the next `play`.
- Student view used by staff (`learnerView`): staff are exempt whatever view
  they are in.
- Quiz and reading lessons never mark playing.

### Tests and checks

API tests use Node's test runner (`node --test`), see
`apps/api/src/modules/platform/platform-settings.service.test.ts` for the
fake-database style. Add `apps/api/src/modules/auth/session/playback-claim.test.ts`
covering at least:

- unlimited setting and staff: allowed, no repository writes;
- first play on one device: allowed and stored;
- heartbeat after another device pressed play: denied, `playingOn` filled,
  own claim cleared;
- a `play` event always wins;
- a stale claim (older than 40 s) is ignored;
- limit 2 lets two devices play and pauses the third oldest;
- a batch without `playing` clears the claim.

Run before opening the PR:

```bash
pnpm typecheck
pnpm lint
pnpm --filter @veolms/api test
pnpm --filter @veolms/web build
```

Frontend policy: do **not** add unit or E2E tests under `apps/web`, test
runners, or test-only dependencies (see the root `AGENTS.md`). Validate the
web with typecheck, lint and build, and by using it.

### Manual test script

1. Local Postgres (see `docs/development.md`), `pnpm --filter @veolms/database migrate`, `pnpm dev`.
2. Sign in as a student in Chrome and in Firefox (two sessions).
3. Play a lesson in Chrome. Press play in Firefox: Firefox plays at once;
   within 15 seconds Chrome pauses with the notice naming Firefox.
4. Press "Play here instead" in Chrome: Chrome plays; Firefox pauses within
   15 seconds.
5. Minimise to the mini player in Chrome and keep playing; Firefox still
   gets paused on play-back-and-forth.
6. Open a second Chrome tab with the same account: both tabs may play.
7. Set "Streams at a time" to "No limit": no pausing anywhere.
8. Sign in as an admin: never paused.

### Acceptance criteria for the PR

- [ ] "Streams at a time" in Platform > Security, default 1, 1 to 5 or no limit, staff exempt.
- [ ] A fresh play on one device pauses an older play on another within 15 s, with the in-player notice naming the device.
- [ ] "Play here instead" takes playback back without reloading.
- [ ] Same browser, two tabs or the mini player: no conflict.
- [ ] Nothing changes for the unlimited setting, for staff, or for clients that do not send `playing`.
- [ ] No changes under `packages/video-player`, `apps/api/src/modules/media`, or the session lifetime.
- [ ] API tests above pass; `pnpm typecheck`, `pnpm lint`, web build pass.
- [ ] Migration has a `down`; new columns are nullable; no data rewrite.

### Repository rules

- Branch from `dev`, name it `feat/single-stream-playback`, open the PR
  against `dev`. Never push to `dev` or `development` directly.
- Commit messages follow the history: `feat(auth): …`, `feat(web): …`,
  `feat(platform): …`, `feat(contracts): …`.
- Requests and responses go through `@veolms/contracts` only.
- API code follows Route → Controller → Service → Repository
  (`apps/api/AGENTS.md`). Frontend rules are in `apps/web/AGENTS.md`.
- Nothing cloud-specific (billing, tenancy, analytics) in this repo.

---

## Part 2: a server nonce for Google One Tap

### What the risk really is

Your Defect 4 is correct in principle: `GoogleOneTap.tsx` calls
`google.accounts.id.initialize(...)` without a `nonce`, and
`POST /auth/oauth/google/one-tap` accepts any valid Google ID token for the
client ID while it is unexpired (up to an hour). A captured token could be
posted again from another machine.

In practice the window is narrow: the token travels over HTTPS from the
victim's browser straight to the API, so capturing it needs script running
in the victim's page or malware on their device, and either of those can
take the session cookie just the same. The device limit now also counts
every replayed sign-in as a device. So this is defence in depth, not a
revenue issue. It is still worth doing: Google's own guidance recommends a
nonce, and it is small and self-contained. Keep it in its **own PR**.

### What not to implement

- No binding of the nonce to an IP address or user agent (mobile networks
  change IPs; the device limit already names devices).
- No binding to a cookie: One Tap can fire on a first visit with no cookie.
- No 5 minute TTL: the prompt may sit on screen longer. Use **1 hour**, the
  lifetime of the ID token itself. Single use is the real protection.
- No change to the "Sign in with Google" button flow
  (`/auth/oauth/url` + `/auth/oauth/login`): that is the authorization code
  flow, already protected by the `state` cookie
  (`OAUTH_STATE_COOKIE`), and Google makes codes single-use.
- No change to session lifetime.

### Design

**Table** (migration `packages/database/migrations/<timestamp>-oauth-nonces.ts`,
schema in `packages/database/src/schema/auth.schema.ts`):

```sql
create table if not exists oauth_nonces (
  token_hash text primary key,
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists oauth_nonces_expires_at_idx on oauth_nonces (expires_at);
```

Housekeeping: when issuing a nonce, also run
`delete from oauth_nonces where expires_at < now()`. One delete per issue is
fine at this volume; no scheduler needed.

**Issue endpoint**: `GET /auth/oauth/google/nonce` in
`apps/api/src/modules/auth/oauth/oauth.routes.ts`, unauthenticated, with the
same `rateLimit` config block as the one-tap route (10 per minute per IP).
Service: `generateRandomToken()` and `hashToken()` from
`apps/api/src/modules/auth/shared/auth.utils.ts` (the session token uses the
same pair), store `hashToken(nonce)` with `expires_at = now + 1 h`, return
`{ nonce, expiresAt }`. Add the response schema to
`packages/contracts/src/auth/session.ts` next to
`googleOneTapLoginRequestSchema`.

**Verification**: in `apps/api/src/modules/auth/oauth/oauth.provider.ts`
add `nonce?: string` to `GoogleIdTokenClaims` (google-auth-library's
`TokenPayload` already exposes it) and return it from
`verifyGoogleIdToken`. In `oauth.service.ts`, `loginWithGoogleCredential`
then consumes it **atomically**, before `login(...)`:

```sql
update oauth_nonces
   set used_at = now()
 where token_hash = $hash and used_at is null and expires_at > now()
returning token_hash
```

No row returned, or no nonce claim in the token, means
`401 ONE_TAP_NONCE_INVALID` ("This sign-in prompt has expired. Try again.").
The one-tap request body stays `{ credential }`; the nonce travels inside the
signed token, which is the point.

**Web**: in `apps/web/src/auth/GoogleOneTap.tsx`, fetch the nonce
(`authService.googleOneTapNonce()`, a new method in
`apps/web/src/services/auth/auth.service.ts`) **in parallel** with
`loadGoogleIdentityServices()`, and pass `nonce` to `initialize({...})`. If
the nonce request fails, do not show the prompt. The One Tap prompt is
already scheduled on idle or after the first interaction, so the extra
request is off the critical path. `use_fedcm_for_prompt: true` is fine:
Chrome's FedCM passes the nonce through to the token.

Rollout note for the maintainers: a browser holding an older web bundle will
fail One Tap once after the API deploys (clear error, the Google button still
works). That is acceptable; no feature flag is needed.

### Tests

- `oauth.provider` / `oauth.service` tests (Node test runner): token without
  nonce rejected; unknown nonce rejected; expired nonce rejected; a nonce
  used twice rejected the second time; happy path signs in.
- Acceptance: One Tap works in a fresh browser; posting the same credential
  twice to `/auth/oauth/google/one-tap` with curl gets 401 the second time.

---

## Part 3: items from the issue that will not be done, and why

| Item in the issue                                   | Decision                 | Reason                                                                                              |
| --------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------- |
| Phase 1, session cap with eviction of the oldest    | Done differently, merged | Students choose which device to sign out; nobody is evicted silently.                               |
| Phase 2, playback lease with a new heartbeat        | Do, as Part 1            | Reuses the existing 15 s progress batch; no new endpoint or interval.                               |
| Phase 2, enforce in `media.service.ts` / the player | Not done                 | Segment tokens and licences are not per stream; the API knows the session on the heartbeat already. |
| Defect 3, 30 day session lifetime                   | Not changed              | Device limit, the sessions list and sign-out cover it.                                              |
| Defect 4, One Tap nonce                             | Do, as Part 2            | Cheap defence in depth; own PR.                                                                     |
| Phase 4, email watermark on the video               | Later, separate feature  | Worth doing as a platform setting; unrelated to this work.                                          |
| "PostgreSQL sessions table bloat"                   | Not an issue             | Sessions are looked up by an indexed token hash; a few rows per user is nothing.                    |
| CDN egress savings                                  | Not applicable           | R2 egress is free; per-request cost is about $0.002 per viewing hour.                               |

If anything here is unclear, ask on the issue before writing code. Questions
about the design are welcome; the shape above has been checked against the
code paths named, so please keep to it unless you find a real problem with it.
