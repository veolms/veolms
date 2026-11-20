# Lesson video at high speeds (8x-16x): findings, open work, and how to test

Written 2026-11-21 from a long investigation of "lessons pause at 16x even
though the internet is fast". It is meant to be handed to a teammate or to
Claude as is: every finding says what was measured, where the code is, what
to try, how to measure it, and what could go wrong.

Status in one paragraph: lessons at 16x pause now and then for about a
second even with minutes already downloaded. The cause is inside Chrome's
video pipeline (its video decoder runs dry and does not recover until the
playhead is moved). How often it happens swings from 0 to 13 times per
lesson depending on how busy the computer is. Several things on our side
make the computer busier than it needs to be while a lesson plays; those
are listed below with fixes to try. Nothing in "Open work" is fixed yet.

---

## 1. Background: how lesson playback works

- Player: Shaka Player 5.2.7 wrapped by `packages/video-player`
  (`engines/shaka/ShakaVideoEngine.ts`, `engines/base/MediaElementEngineBase.ts`,
  React layer in `react/`).
- JavaScript-course lessons (production): HLS, fMP4, **2-second segments**,
  sound (AAC 44.1 kHz) packed in the same segments as the picture,
  at `transcoded/<video id>/v2/master.m3u8` (1080p / 720p / 360p).
- Node.js-course lessons: DASH, ~6-second segments, sound in its own stream,
  ClearKey-encrypted, about 10 periods per video.
- At 16x a 2-second-segment lesson needs 8 segments a second, and the decoder
  must produce 480 frames a second (30 fps x 16).
- Buffer: the player grows the buffer ahead with the connection, up to
  **600 seconds** (`growBufferWithConnection` / `adaptiveBufferingGoal` in
  `ShakaVideoEngine.ts`, `ADAPTIVE_BUFFER_FAST_SECONDS = 600`), and keeps
  30 s behind.
- Segments are also saved on the learner's device (Cache Storage +
  IndexedDB index): `apps/web/src/learning/player/segmentCache.ts`,
  `segmentCacheIndex.ts`.

## 2. Already changed (branch `feat/parallel-segment-fetch`)

These were built and tested during the investigation. When this was written
they were **uncommitted** in the worktree of that branch (based on `dev`
34cb3defa); check `git status` there before relying on them.

| Change                                               | Where                                                                                                                                                         | What it does                                                                                                                                      | How it was checked                                                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Fetch several segments at once at high speeds        | `packages/video-player/src/engines/shaka/parallel-segment-fetch.ts`, `fetchSegmentsTogetherWhenNeeded` in `ShakaVideoEngine.ts`                               | count = ceil(1.5 x speed x fetch time / segment length), 1 at normal speeds, at most 8; off during seeks                                          | Uncached lessons at 16x went from ~7-8x with constant waits to ~15.5-16x. Unit tests in `__tests__/parallel-segment-fetch.test.ts` |
| Quality chooser ignores playback speed               | `speedBlindAbrFactory` in `shaka-internal.ts`                                                                                                                 | Shaka counted 1080p at 16x as needing 16x the bitrate and fell to 360p on a 200 Mbps line; now judged as at normal speed                          | Whole cold lesson on Auto at 16x stayed 1080p                                                                                      |
| A chosen quality is no longer wiped                  | `linkCarriesChosenQuality` in `ShakaVideoEngine.ts`; `LessonVideoPlayer.tsx` no longer saves `videoQuality: "auto"` on fallback                               | The "chosen quality can't keep up" fallback only applies when the measured link can't carry the quality at normal speed, and only for that lesson | Manual check                                                                                                                       |
| Festive decorations stand still while a lesson plays | `apps/web/src/lib/lesson-playing.ts`, `root.tsx`, `apps/web/src/festive/*`                                                                                    | Looping Diwali animations made a full-size 16x lesson stand still ~2 s in every 11                                                                | 13.1x with sparkles vs 15.9x without, repeated                                                                                     |
| "Can't keep up at this speed" card                   | `packages/video-player/src/core/playbackStrain.ts`, `controls/PlaybackStrainNotice.tsx`, wired in `MediaElementEngineBase.ts` and `react/PlayerController.ts` | After 2 stops (>= 0.5 s) within 30 s above 2x, shows "Playback keeps pausing at 16x" with "Play at 8x" and "Dismiss"                              | Unit tests in `core/__tests__/playbackStrain.test.ts`; seen working under 6x CPU slowdown                                          |

Tried and removed: silencing the sound at high speeds (it did not stop the
pauses; see section 5).

---

## 3. Findings

### F1. The pauses with plenty downloaded are Chrome's video decoder running dry

- Signature: the picture stands still about 1.0-1.4 s, `video.readyState`
  drops to 2 (HAVE_CURRENT_DATA) while 60-600 s are buffered ahead, then it
  resumes exactly when Shaka's stall detector nudges the playhead 0.1 s
  forward (Shaka `stallThreshold` = 1 s).
- `chrome://media-internals` for the player shows
  `video_buffering_state: BUFFERING_HAVE_NOTHING` with reason
  `DECODER_UNDERFLOW` (sometimes `DEMUXER_UNDERFLOW`). The sound side
  (`audio_buffering_state`) stays `BUFFERING_HAVE_ENOUGH`.
- Hardware decoding is in use (`kVideoDecoderName: D3D11VideoDecoder`), and
  the videos are 30 fps H.264 Main profile, the same load as YouTube's copy.
- It varies a lot from run to run and with how busy the computer is: the same
  lesson at 16x paused 0, 2, 5, 6 and 13 times in different runs. **One run
  proves nothing; see section 6 for the protocol.**
- Dropped frames are normal at 16x (YouTube's player dropped 75% on the same
  machine); they are not the problem.

### F2. Our `init.mp4` files make Chrome treat every lesson as a live stream

- Our `init.mp4` has `mvhd duration = 0` and no `mehd` box. When an MP4
  init states no length, Chrome's MP4 parser marks the stream as live, and
  Chrome then renders video in **low delay mode** (media-internals logs
  "Video rendering in low delay mode."). In that mode it keeps the smallest
  possible queue of decoded frames ahead of the picture. YouTube's player of
  the same lesson does not log it.
- Why it matters: at 16x the decoder needs 480 frames a second, and the
  queue of ready frames is what absorbs a brief decoding hiccup. A smaller
  queue empties sooner.
- Tested: patching the real length into `init.mp4` removed low delay mode,
  but in one app run the lesson still paused 5+ times. **Not shown to help;
  not shown not to help.** Needs the A/B protocol.
- Fix options:
  1. Packaging: write the duration (mvhd duration or an `mehd` box) when
     videos are encoded. Cleanest; affects new videos only.
  2. One-time job: rewrite the `init.mp4` files in storage (3 tiny files per
     lesson; patching mvhd duration does not change the file size).
  3. Player: patch the bytes in a Shaka response filter for init segments.
     Works for every existing lesson at once, no re-upload.
- Risks: DASH lessons have one init per period (state the whole length or
  the period's?); mvhd version 1 uses 64-bit fields; a wrong length only
  affects Chrome's first guess (Shaka sets `MediaSource.duration` itself),
  but check seeking and the end of the video.

### F3. The buffer stops at ~480 s: probably Chrome's buffer memory limit

- In many runs the buffer stopped growing at almost exactly 480 s ahead.
  That is the 600 s goal x 0.8, the factor Shaka applies after the browser
  refuses an append with `QuotaExceededError`. So the player likely fills
  Chrome's per-video memory to the limit, and Chrome then cleans up on every
  append.
- Hypothesis (untested): appends and clean-up at that limit help starve the
  decoder at 16x. YouTube keeps about 1-2 minutes buffered.
- Test: same lesson, buffer goal 60 s vs 600 s (bare Shaka page or a
  temporary change to `adaptiveBufferingGoal`), 5+ whole-lesson runs each at
  16x, count pauses; hook `SourceBuffer.prototype.appendBuffer` to count
  `QuotaExceededError` (Appendix A6).
- Drawback if the buffer is made smaller: less protection against a
  connection that drops for a minute at normal speed. A speed-dependent goal
  (smaller only at high speeds) avoids that.

### F4. Main-thread work while a lesson plays (production build)

Measured with Chrome's CPU profiler over 30 s of 16x playback, production
build, with and without 4x CPU slowdown (section 6.3).

| Run                  | Main thread busy | JavaScript | Style + layout | Buffer ahead after 30 s |
| -------------------- | ---------------- | ---------- | -------------- | ----------------------- |
| 16x, normal CPU      | 21%              | 3%         | 3.5%           | 181 s                   |
| 16x, 4x CPU slowdown | 82%              | 20%        | 20%            | 135 s                   |

Per segment, JavaScript is about 2 ms (Shaka ~1.8 ms, the device segment
cache ~0.3 ms). **Segment handling is not the bottleneck.** Most of the
time is the browser restyling, laying out and drawing the page while it
plays, plus a few avoidable measurements. Even with 135 s buffered, the
slowed run only reached ~7x instead of 16x: on a weaker computer the page's
own work is what holds the video back.

Named costs (4x CPU slowdown, 33 s, production unless noted):

| #   | Cost                                                  | Time                                    | Where                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4a  | Floating page scrollbar re-measuring layout           | 1.75 s                                  | `apps/web/src/shell/FloatingScrollbar.tsx`: `syncScrollbar` (from line ~111) is scheduled by a `MutationObserver` on the whole scrollport subtree (line ~275) and by document-wide `transitionrun/transitionend/transitioncancel` listeners (lines ~260-262). Each sync calls `getComputedStyle` + `getClientRects` + `getBoundingClientRect`, forcing a layout. While a lesson plays something changes almost every frame. |
| 4b  | Per-frame position measuring                          | 0.58 s                                  | `getBoundingClientRect` from the chunk that bundles `learningMiniPlayerBufferingIndicator` (minified, exact function not pinned) and `packages/video-player/src/react/pageFullscreen.ts` (`toPlayerRect`, line ~312). Confirm the callers with a development profile (Appendix A4 prints them).                                                                                                                             |
| 4c  | Glow behind the video                                 | 0.45 s (dev), 0.18 s `toDataURL` (prod) | `apps/web/src/learning/player/LessonAmbientProjection.tsx`: `showAsBackground` (line ~235) turns the canvas into a PNG data URL every second (`AMBIENT_FRAME_INTERVAL_MS`).                                                                                                                                                                                                                                                 |
| 4d  | Closed settings menu re-rendering                     | 2.2 s (dev)                             | `packages/video-player/src/controls/SettingsMenu.tsx` lines ~192-205 subscribe to the whole `snapshot.media`, which changes on every time update and every buffered segment, so the menu re-renders while closed.                                                                                                                                                                                                           |
| 4e  | Discussion list and page re-rendering during playback | ~1.6 s + ~1.5 s (dev)                   | `CommentCard`, `DiscussionInner`, `ThreadSurface`, `LearningWorkspace`, `Curriculum`, `LessonChapterRows`, `LessonContentPanel`, `useCapabilities` showed up repeatedly while nothing about them changed. Find what state they read that changes with playback time.                                                                                                                                                        |
| 4f  | Timeline / time display / controls                    | ~1.6 s (dev)                            | `Timeline.tsx`, `TimeDisplay.tsx`, `LessonPlayerControls.tsx`. Expected to update, but check how often and how much re-renders with them.                                                                                                                                                                                                                                                                                   |
| 4g  | Segment cache writes                                  | ~0.3-0.6 s                              | `segmentCache.ts` (`fetchAndKeep`, Cache Storage `put`), `segmentCacheIndex.ts` (`recordSegment`, IndexedDB). Small.                                                                                                                                                                                                                                                                                                        |

"(dev)" = measured on the development server, where React's dev runtime
inflates React costs several times; the order is right but confirm the size
on production.

### F5. The development server misleads for this kind of test

With 4x CPU slowdown at 16x the dev server starved the buffer (2 s ahead,
main thread 96%) where the production build kept 135 s ahead. The dev
server runs React's development runtime (`jsxDEV`, `console.createTask`,
extra checks). **Always measure performance on the production build.**

---

## 4. Open work, in suggested order

For each: what to change, expected benefit, drawbacks, and how to tell it
worked. Measure before and after with section 6.

1. **Scrollbar (4a).** Re-measure only when the scrollport scrolls or its own
   size changes: rely on `ResizeObserver` (it reports after layout, no forced
   layout) and the scroll event; stop scheduling a sync on every DOM mutation
   in the page and on every transition anywhere (keep transitions only for
   the scrollport's own ancestors if the thumb must follow a moving panel).
   - Benefit: removes the largest named main-thread cost; helps every page
     with this scrollbar, including scrolling.
   - Drawback: content that changes height without resizing an observed
     element might leave the thumb stale; check long pages, drawers, the
     phone full-screen hold, comments loading in.
   - Done when: `getClientRects` under `syncScrollbar` drops to near zero in
     the profile during playback; the thumb still tracks scrolling and
     content growth.
2. **Settings menu (4d).** Select only the fields it shows (speed, qualities,
   auto/selected quality, captions, audio tracks), or subscribe to `media`
   only while the menu is open.
   - Benefit: stops a large subtree re-rendering several times a second.
   - Drawback: a missed field shows stale state in the menu; test every
     menu view.
   - Done when: React DevTools "Highlight updates" shows no menu renders
     during playback with the menu closed.
3. **Re-renders during playback (4e, 4f).** Use React DevTools Profiler
   during 16x playback; for each component that re-renders, find the state
   it reads that changes with time and narrow it.
4. **Per-frame measuring (4b).** Measure positions only on resize or state
   change, cache them otherwise.
5. **Glow (4c).** Draw into a visible canvas instead of `toDataURL` + CSS
   background each second, or skip the glow above e.g. 4x.
   - Drawback: visual change risk; compare screenshots in light and dark.
6. **Buffer size at high speed (F3).** Test 60 s vs 600 s first; if smaller
   helps, make the goal depend on speed.
7. **`init.mp4` length (F2).** Cheap and correct; measure with the protocol.
8. **Remaining decoder pauses (F1).** If 1-7 do not get rid of them, the
   options left are a lower rendition only at very high speeds (8x+), or a
   quicker un-stick (our own detector that nudges only when `readyState < 3`
   with data buffered; Shaka's own `stallThreshold: 0.15` was tried and made
   things worse because it nudges too eagerly).

---

## 5. Already ruled out (do not redo)

| Idea                                                                                    | Result                                                                                                                                                   |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Silencing sound at high speed (Firefox does it above 4x)                                | A silenced lesson at 16x still paused 6 times; removed at the product owner's request. Earlier "muted = no pauses" runs were within run-to-run variance. |
| YouTube's sound format (Opus 48 kHz in its own stream), AAC 48 kHz, separate AAC stream | Opus looked clean in a bare player (0/0/0) but paused 5 and 7 times inside the app. Not the fix.                                                         |
| Faster Shaka stall detector (`stallThreshold: 0.15`)                                    | Worse: eager nudges restart decoding from the previous key frame.                                                                                        |
| Glow `drawImage` of the video                                                           | No difference.                                                                                                                                           |
| Controls showing/hiding, timeline hover previews, real mouse movement                   | No difference.                                                                                                                                           |
| Hidden next-lesson (standby) player                                                     | No difference.                                                                                                                                           |
| Token renewals after rejected requests                                                  | No difference.                                                                                                                                           |
| Patching `init.mp4` length alone                                                        | Removed low delay mode; pauses remained in one run (needs protocol, F2).                                                                                 |

---

## 6. How to reproduce, test and measure

### 6.1 Setup

- Run the full app (API + web) the way local playback works for this
  project (the cloud edition is needed for DRM lessons; the JavaScript
  course is not encrypted).
- **Use lessons laid out like production** (2-second segments under
  `.../v2/master.m3u8`). Some local database copies point lessons at an
  older layout with ~40 s segments, where none of this happens. Check a
  lesson with
  `GET /v1/courses/<course>/lessons/<n>/playback-bootstrap` and look at
  `manifestUrl`.
- **Measure on the production build**, not the dev server (F5). Build and
  serve the production preview locally against the local API, then open the
  lesson on that port.
- Sign in on localhost; for automated runs a local fixed sign-in code
  (`LOCAL_FIXED_OTP` in the local `.env`, never on a server) makes this
  scriptable.
- Use a lesson that has not been played in this browser profile, or a fresh
  profile, so segments really come from the network (the device cache
  answers replays).

### 6.2 Manual test in Chrome

1. Open the lesson, set quality to 1080p in the player menu, set speed to
   16x with the player's speed control (not a browser extension).
2. Keep the window visible (a hidden tab is throttled by Chrome).
3. **Slow the computer down:** DevTools > **Performance** tab > settings gear
   (or "Environment settings" in newer Chrome) > **CPU: 4x slowdown** (or
   6x). This slows only the page's main thread (JavaScript, style, layout,
   paint preparation); the GPU, hardware video decoding, the network and
   Chrome's media threads run at full speed. Set it back to **No
   throttling** afterwards; it only applies to that tab while DevTools is
   open.
4. Network: DevTools > **Network** > throttling dropdown, only if testing
   slow connections. Keep "No throttling" for these tests.
5. Watch for pauses; open `chrome://media-internals` in another tab, pick the
   player and read `video_buffering_state` / `audio_buffering_state` events
   and their `reason` at the moment of a pause.
6. Paste the recorder from Appendix A1 into the console before playing to
   get exact numbers.

### 6.3 Automated measurement

- Drive a **visible** Chrome (Playwright `channel: "chrome"`,
  `headless: false`); the Claude desktop Browser pane and headless runs hid
  these pauses for hours.
- Slow the CPU from the script with the DevTools protocol:
  `Emulation.setCPUThrottlingRate { rate: 4 }`.
- Main-thread totals: `Performance.enable` + `Performance.getMetrics` before
  and after (TaskDuration, ScriptDuration, RecalcStyleDuration,
  LayoutDuration, divided by wall time).
- Who costs what: `Profiler.start` / `Profiler.stop` (sampling interval
  500 us), then add self time per file and per function, and walk up the
  call tree to find who calls costly native functions (`getClientRects`,
  `getBoundingClientRect`, `toDataURL`, `put`). Appendix A3/A4.
- Pauses: Appendix A2 plays a whole lesson at 16x and records every moment
  the picture stands still, with buffer ahead and `readyState`.

### 6.4 Protocol (because of the variance)

- Same lesson, same quality, same window size, sound on, visible window.
- Alternate the two versions (A, B, A, B, ...), **at least 5 whole-lesson
  runs each**; nothing else running on the machine.
- Report per run: pauses >= 0.5 s, total seconds standing still, achieved
  speed (video seconds / real seconds), main thread busy share, buffer ahead
  at the end.
- A change counts as a win only if the totals move clearly beyond the spread
  between runs of the same version.

---

## Appendix

### A1. In-page pause recorder (paste into the console, then play at 16x)

```js
(() => {
  const v = [...document.querySelectorAll("video")].sort(
    (a, b) => (b.duration || 0) - (a.duration || 0),
  )[0];
  const ahead = () => {
    const b = v.buffered;
    for (let i = 0; i < b.length; i++)
      if (b.start(i) <= v.currentTime + 0.05 && b.end(i) >= v.currentTime)
        return Math.round(b.end(i) - v.currentTime);
    return 0;
  };
  const stops = [];
  let last = v.currentTime,
    lp = performance.now(),
    cur = null;
  const iv = setInterval(() => {
    const n = performance.now();
    const expected = v.playbackRate * ((n - lp) / 1000);
    if (
      !v.paused &&
      !v.ended &&
      !v.seeking &&
      v.currentTime - last < 0.5 * expected
    ) {
      cur ??= {
        at: +last.toFixed(1),
        ahead: ahead(),
        readyState: v.readyState,
        ms: 0,
      };
      cur.ms += n - lp;
    } else if (cur) {
      if (cur.ms >= 300) stops.push({ ...cur, ms: Math.round(cur.ms) });
      cur = null;
    }
    last = v.currentTime;
    lp = n;
  }, 50);
  window.__stops = stops;
  window.__stopRecorder = () => clearInterval(iv);
  console.log("Recording. Read window.__stops; stop with __stopRecorder().");
})();
```

A pause with `readyState` 2 and a large `ahead` is F1 (device); with
`ahead` near 0 it is loading.

### A2. Whole lesson at 16x in a visible Chrome (Playwright, Node)

```js
// node run16x.mjs <lessonUrl> [cpuSlowdown]
import { chromium } from "@playwright/test";
const [url, slow = "1"] = process.argv.slice(2);
const browser = await chromium.launch({
  channel: "chrome",
  headless: false,
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--window-size=1500,950",
  ],
});
const context = await browser.newContext({
  viewport: null,
  storageState: "session.json",
});
const page = await context.newPage();
await page.goto(url);
await page.waitForFunction(
  () => (document.querySelector("video")?.readyState ?? 0) >= 2,
);
const cdp = await context.newCDPSession(page);
if (Number(slow) > 1)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(slow) });
const result = await page.evaluate(async () => {
  const v = [...document.querySelectorAll("video")].sort(
    (a, b) => (b.duration || 0) - (a.duration || 0),
  )[0];
  const ahead = () => {
    const b = v.buffered;
    for (let i = 0; i < b.length; i++)
      if (b.start(i) <= v.currentTime + 0.05 && b.end(i) >= v.currentTime)
        return Math.round(b.end(i) - v.currentTime);
    return 0;
  };
  v.muted = false;
  v.currentTime = 0;
  await new Promise((r) => setTimeout(r, 800));
  const t0 = performance.now();
  const stops = [];
  let last = v.currentTime,
    lp = t0,
    cur = null;
  v.playbackRate = 16;
  await v.play();
  await new Promise((done) => {
    const iv = setInterval(() => {
      const n = performance.now();
      if (!v.paused && v.currentTime - last < 0.5 * 16 * ((n - lp) / 1000)) {
        cur ??= {
          t: Math.round(lp - t0),
          at: +last.toFixed(1),
          ahead: ahead(),
          rs: v.readyState,
          ms: 0,
        };
        cur.ms += n - lp;
      } else if (cur) {
        cur.ms = Math.round(cur.ms);
        stops.push(cur);
        cur = null;
      }
      last = v.currentTime;
      lp = n;
      if (v.ended || v.currentTime >= v.duration - 0.5 || n - t0 > 300000) {
        clearInterval(iv);
        done();
      }
    }, 50);
  });
  const real = (performance.now() - t0) / 1000;
  return {
    speed: +(v.currentTime / real).toFixed(2),
    stops: stops.filter((s) => s.ms >= 100),
  };
});
console.log(JSON.stringify(result));
await browser.close();
```

Setting `playbackRate` on the element from a script makes the player show
"Speed changed outside the player"; that is expected in tests.

### A3. Main-thread profile (add to A2 around the playing period)

```js
await cdp.send("Performance.enable");
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
const m0 = Object.fromEntries(
  (await cdp.send("Performance.getMetrics")).metrics.map((m) => [
    m.name,
    m.value,
  ]),
);
await cdp.send("Profiler.start");
// ... let it play 30 s ...
const { profile } = await cdp.send("Profiler.stop");
const m1 = Object.fromEntries(
  (await cdp.send("Performance.getMetrics")).metrics.map((m) => [
    m.name,
    m.value,
  ]),
);
const wall = m1.Timestamp - m0.Timestamp;
console.log({
  busy: (m1.TaskDuration - m0.TaskDuration) / wall,
  script: (m1.ScriptDuration - m0.ScriptDuration) / wall,
  styleLayout:
    (m1.RecalcStyleDuration -
      m0.RecalcStyleDuration +
      m1.LayoutDuration -
      m0.LayoutDuration) /
    wall,
});
// Self time per node: sum profile.timeDeltas[i] for profile.samples[i];
// group by node.callFrame.url (file) and functionName.
require("node:fs").writeFileSync("run.cpuprofile", JSON.stringify(profile));
```

A `.cpuprofile` file also opens in DevTools (Performance > Load profile) for
a flame chart.

### A4. Who calls a costly native function (Node, on a `.cpuprofile`)

```js
const p = JSON.parse(require("node:fs").readFileSync("run.cpuprofile", "utf8"));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id);
const self = new Map();
p.samples.forEach((id, i) =>
  self.set(id, (self.get(id) || 0) + p.timeDeltas[i] / 1000),
);
const name = process.argv[2] || "getClientRects";
const callers = new Map();
for (const n of p.nodes) {
  if (n.callFrame.functionName !== name || n.callFrame.url) continue;
  const caller = byId.get(parent.get(n.id));
  const key = `${caller.callFrame.functionName} @ ${caller.callFrame.url}:${caller.callFrame.lineNumber + 1}`;
  callers.set(key, (callers.get(key) || 0) + (self.get(n.id) || 0));
}
console.log([...callers].sort((a, b) => b[1] - a[1]).slice(0, 10));
```

Use a development-build profile to get readable file and function names,
then confirm the size on production.

### A5. Inspect or patch an `init.mp4` length (Node)

```js
// node init-length.mjs <init.mp4> [durationSeconds -> writes init.patched.mp4]
import { readFileSync, writeFileSync } from "node:fs";
const [file, seconds] = process.argv.slice(2);
const b = Buffer.from(readFileSync(file));
let o = 0;
while (b.toString("latin1", o + 4, o + 8) !== "moov") o += b.readUInt32BE(o);
const mvhd = o + 8; // first child of moov
const v = b[mvhd + 8];
const timescale = v ? b.readUInt32BE(mvhd + 28) : b.readUInt32BE(mvhd + 20);
const duration = v
  ? Number(b.readBigUInt64BE(mvhd + 32))
  : b.readUInt32BE(mvhd + 24);
console.log({
  version: v,
  timescale,
  duration,
  hasMehd: b.includes(Buffer.from("mehd")),
});
if (seconds && v === 0) {
  b.writeUInt32BE(Math.round(Number(seconds) * timescale), mvhd + 24);
  writeFileSync(file.replace(/\.mp4$/, ".patched.mp4"), b);
}
```

Our files print `duration: 0, hasMehd: false`. In media-internals the
player then logs "Video rendering in low delay mode."; with a patched
length it does not.

### A6. Count buffer-full refusals (paste before the video loads)

```js
(() => {
  const append = SourceBuffer.prototype.appendBuffer;
  window.__quota = 0;
  SourceBuffer.prototype.appendBuffer = function (data) {
    try {
      return append.call(this, data);
    } catch (e) {
      if (e && e.name === "QuotaExceededError") window.__quota++;
      throw e;
    }
  };
})();
```

Then read `window.__quota` after a run, and watch whether the buffer stops
at ~480 s ahead (600 x 0.8).
