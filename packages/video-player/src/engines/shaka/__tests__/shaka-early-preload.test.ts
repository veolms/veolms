/// <reference types="node" />
/**
 * The page keeps one preloaded video (the "slot"), labelled with the lesson
 * it is for. These tests make two preloads overlap, as on production on
 * 17 Nov 2026: a learner's lesson 19 played lesson 21's video, because
 * while lesson 19's preload was clearing the old one out of the slot,
 * lesson 21's took the slot, and lesson 19's then wrote its own label on
 * it. The page saw "lesson 19", took it, and played lesson 21.
 *
 * Shaka is replaced by a stand-in whose players remember what they were
 * asked to preload, and whose teardown takes as long as a test says.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, it } from "node:test";

import type { VideoSource } from "../../../core/types";
import {
  earlyShakaPreloadMatches,
  getEarlyShakaPreloadSession,
  setEarlyShakaPreloadSessionForTests,
  startEarlyShakaPreload,
  type EarlyShakaPreloadSession,
} from "../shaka-early-preload";

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** How long the next player teardown takes (the window the bug needs). */
let teardownMs = 0;

class StandInPlayer {
  static isBrowserSupported() {
    return true;
  }
  /** The video this player was given to preload. */
  loading: string | null = null;
  async preload(src: string) {
    this.loading = src;
    return { destroy: async () => undefined };
  }
  async destroy() {
    await sleep(teardownMs);
  }
}

/** Any Shaka call the preload makes that the test does not care about. */
function withNoOps<T extends object>(target: T): T {
  return new Proxy(target, {
    get: (object, key) =>
      key in object
        ? (object as Record<string | symbol, unknown>)[key]
        : // Not a promise (\`await\` must not wait on it) nor a module with
          // a \`default\` export (the runtime is read from it).
          key === "then" || key === "default"
          ? undefined
          : () => ({}),
  });
}

const runtime = withNoOps({
  Player: new Proxy(StandInPlayer, {
    construct: (Type) => withNoOps(new Type()),
  }),
  polyfill: { installAll: () => undefined },
  net: { NetworkingEngine: { RequestType: {} } },
});
/** Shaka "loads" after `ms`: how long a preload waits before its player. */
const shakaLoadsAfter = (ms: number) => async () => {
  await sleep(ms);
  return runtime;
};

const lesson = (n: number): VideoSource =>
  ({
    src: `https://cdn.test/lesson-${n}/manifest.mpd`,
    id: `course-lesson-${n}`,
    type: "dash",
  }) as VideoSource;

function holding(session: EarlyShakaPreloadSession | null) {
  const player = session?.player as unknown as StandInPlayer | undefined;
  return player?.loading ?? null;
}

/** Every moment the slot held one lesson's video under another's label. */
function watchSlot(): { mismatches: string[]; stop: () => void } {
  const mismatches: string[] = [];
  const timer = setInterval(() => {
    const session = getEarlyShakaPreloadSession();
    const video = holding(session);
    if (
      session &&
      !session.consumed &&
      video &&
      video !== session.manifestUrl
    ) {
      mismatches.push(`labelled ${session.manifestUrl}, holding ${video}`);
    }
  }, 1);
  return { mismatches, stop: () => clearInterval(timer) };
}

beforeEach(() => {
  (globalThis as { document?: unknown }).document = {};
  teardownMs = 0;
  setEarlyShakaPreloadSessionForTests(null);
});

afterEach(() => {
  setEarlyShakaPreloadSessionForTests(null);
  delete (globalThis as { document?: unknown }).document;
});

it("two overlapping preloads never leave one lesson's video under another lesson's label", async () => {
  // Lesson 21 is preloaded (a lesson the learner is likely to open).
  await startEarlyShakaPreload(lesson(21), {
    runtimeLoader: shakaLoadsAfter(0),
    speculative: true,
  });
  assert.equal(holding(getEarlyShakaPreloadSession()), lesson(21).src);

  const slot = watchSlot();
  // Lesson 19 is opened: lesson 21's preload is cleared out first, and
  // that takes a moment...
  teardownMs = 40;
  const opening19 = startEarlyShakaPreload(lesson(19), {
    runtimeLoader: shakaLoadsAfter(30),
  });
  await sleep(5);
  // ...in which lesson 21 is asked for again and takes the slot.
  teardownMs = 0;
  const preloading21 = startEarlyShakaPreload(lesson(21), {
    runtimeLoader: shakaLoadsAfter(0),
    speculative: true,
  });
  const [for19, for21] = await Promise.all([opening19, preloading21]);
  await sleep(60);
  slot.stop();

  assert.deepEqual(slot.mismatches, []);
  for (const session of [for19, for21]) {
    if (session?.player) assert.equal(holding(session), session.manifestUrl);
  }
});

it("a player never takes a preload whose video is not the lesson's, whatever its label", () => {
  const session = {
    manifestUrl: lesson(19).src,
    mediaKey: lesson(19).id,
    player: null,
    preloadPromise: null,
    consumed: false,
    ready: Promise.resolve(),
    preloadedFor: { src: lesson(21).src, id: lesson(21).id },
  } satisfies EarlyShakaPreloadSession;

  assert.equal(earlyShakaPreloadMatches(session, lesson(19)), false);
  assert.equal(earlyShakaPreloadMatches(session, lesson(21)), false);
  assert.equal(
    earlyShakaPreloadMatches(
      { ...session, preloadedFor: { src: lesson(19).src, id: lesson(19).id } },
      lesson(19),
    ),
    true,
  );
});
